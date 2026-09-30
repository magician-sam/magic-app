import { guestServiceNames } from "./guest-services.js";
import { preparationChecklist } from "./preparation.js";
import { staffNotices, type StaffNoticeState } from "./staff-notices.js";
import { limitedStaff, staffRouteAllowed, canSeeArtistPay, canStaffAction, staffResponse } from "./staff-permissions.js";
import { siteMediaSlots } from "./site-media.js";
import { eventNotice, offerNotice } from "./notifications.js";
import { storeFromEnvironment, applicationOrigin } from "./runtime.js";
import { rateLimit } from "./rate-limit.js";
import { followups, generateFollowups } from "./followups.js";
import { writeRoutes } from "./write-routes.js";
import { prepareBundle, validateBundleSelection } from "./bundles.js";
import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import {
  contentSecurityPolicy,
  crossOriginOpenerPolicy,
  crossOriginResourcePolicy,
  originAgentCluster,
  referrerPolicy,
  strictTransportSecurity,
  xContentTypeOptions,
  xDnsPrefetchControl,
  xDownloadOptions,
  xFrameOptions,
  xPermittedCrossDomainPolicies,
  xPoweredBy,
  xXssProtection,
} from "helmet";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { put } from "@vercel/blob";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { DateTime } from "luxon";
import { z } from "zod";
import { Store, id } from "./store.js";
import { customerAccounts } from "./customer-accounts.js";
import { customerRecovery } from "./customer-recovery.js";
import { contactHistory } from "./contact-history.js";
import { customerMerge } from "./customer-merge.js";
import { performerAssignments, type ActPlan } from "./act-plans.js";
import { rewardLedger, validateQuoteReward } from "./reward-ledger.js";
import { rewardSettings, rewardSchema } from "./rewards.js";
import {
  customFieldSchema,
  customAnswers,
  orderedFields,
  type CustomField,
} from "./custom-fields.js";
import {
  createUser,
  hash,
  passwordMatches,
  passwordHash,
  insertUser,
  token,
} from "./auth.js";
import {
  Problem,
  requireThat,
  customerSchema,
  eventSchema,
  packageSchema,
  performerSchema,
  short,
  date,
  time,
  cents,
  url,
  selectedPackages,
  compatibility,
  conflicts,
  timetable,
  totals,
  normalizePhone,
} from "./domain.js";
import type {
  User,
  Business,
  Package,
  Performer,
  Customer,
  Booking,
  Quote,
  Reminder,
  Review,
  AvailabilityBlock,
  MoneyEntry,
  ServiceEnquiry,
} from "./models.js";

declare module "express-serve-static-core" {
  interface Request {
    user: User;
    business: Business;
  }
}

type Authed = Request & { user: User; business: Business };
const kinds = [
  "guestGalleries",
  "packages",
  "performers",
  "customers",
  "bookings",
  "money",
  "reminders",
  "reviews",
  "blocks",
  "referrals",
] as const;
export function createApp(store: Store, origin = "http://localhost:3000") {
  const app = express();
  const writes = writeRoutes(app, store);
  if (process.env.VERCEL) app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(
    contentSecurityPolicy({
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", "https:", "data:"],
        mediaSrc: ["'self'", "https:"],
        connectSrc: ["'self'", "https://vercel.com", "https://*.blob.vercel-storage.com"],
        frameSrc: ["https://www.youtube-nocookie.com", "https://player.vimeo.com"],
        formAction: ["'self'"],
        upgradeInsecureRequests: origin.startsWith("https:") ? [] : null,
      },
    }),
    crossOriginOpenerPolicy(),
    crossOriginResourcePolicy(),
    originAgentCluster(),
    referrerPolicy({ policy: "no-referrer" }),
    strictTransportSecurity(),
    xContentTypeOptions(),
    xDnsPrefetchControl(),
    xDownloadOptions(),
    xFrameOptions(),
    xPermittedCrossDomainPolicies(),
    xPoweredBy(),
    xXssProtection(),
  );
  app.use(express.json({ limit: "512kb" }));
  app.use("/api", (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  app.use((req, res, next) => {
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.headers.origin !== origin
    ) {
      res
        .status(403)
        .json({ error: "This request must come from the application." });
      return;
    }
    next();
  });
  app.use("/api", rateLimit(store));
  const owned = async <T>(businessId: string, kind: string, key: string) => {
    const value = await store.get<T>(businessId, kind, key);
    requireThat(value, "Record not found", 404);
    return value;
  };
  async function businessBySlug(slug: string) {
    const business = await store.business(slug, true);
    requireThat(business, "Business not found", 404);
    return business;
  }
  async function writeRecord<T extends { id: string }>(
    req: Authed,
    kind: string,
    record: T,
    action = "updated",
  ) {
    return await store.transaction(async () => {
      const before = await store.get(req.business.id, kind, record.id);
      await store.put(req.business.id, kind, record);
      await store.audit(
        req.business.id,
        req.user.email,
        `${kind}.${action}`,
        record.id,
        before ?? null,
        record,
      );
      return record;
    });
  }
  function canManage(req: Authed) {
    requireThat(
      ["owner", "admin"].includes(req.user.role) || (limitedStaff(req.user.role) && staffRouteAllowed(req.user.role, req.method, req.originalUrl)),
      "Your access level does not permit this action.",
      403,
    );
  }
  async function validateSelection(
    businessId: string,
    packageIds: string[],
    performerIds: string[],
  ) {
    validateBundleSelection(
      (await store.all<Package>(businessId, "packages")).filter((p) =>
        packageIds.includes(p.id),
      ),
    );
    requireThat(
      new Set(packageIds).size === packageIds.length,
      "Choose each package once.",
    );
    requireThat(
      new Set(performerIds).size === performerIds.length,
      "Choose each performer once.",
    );
    await Promise.all(
      packageIds.map(async (key) =>
        requireThat(
          (await owned<Package>(businessId, "packages", key)).active,
          "A selected package is unavailable.",
        ),
      ),
    );
    await Promise.all(
      performerIds.map(async (key) =>
        requireThat(
          (await owned<Performer>(businessId, "performers", key)).active,
          "A selected performer is unavailable.",
        ),
      ),
    );
  }
  function validEventDate(
    business: Business,
    value: { date: string; time: string },
    future = true,
  ) {
    const dt = DateTime.fromISO(`${value.date}T${value.time}`, {
      zone: business.timezone,
    });
    requireThat(
      dt.isValid && dt.toFormat("HH:mm") === value.time,
      "This local time does not exist; choose a different time.",
    );
    requireThat(
      dt.getPossibleOffsets().length === 1,
      "This time occurs twice during a clock change; choose a different time.",
    );
    if (future)
      requireThat(
        dt.toMillis() > Date.now(),
        "Choose a future event date and time.",
      );
  }
  async function issueLink(businessId: string, bookingId: string) {
    const value = token();
    await store.db
      .prepare("DELETE FROM links WHERE business_id=? AND booking_id=?")
      .run(businessId, bookingId);
    await store.db
      .prepare(
        "INSERT INTO links(hash,business_id,booking_id,expires) VALUES(?,?,?,?)",
      )
      .run(hash(value), businessId, bookingId, Date.now() + 180 * 86400_000);
    return `/event#${value}`;
  }
  async function eventAccess(req: Request) {
    const value = req.headers["x-event-token"];
    requireThat(
      typeof value === "string" && value.length === 64,
      "Event link is missing or expired.",
      404,
    );
    const row = await store.db
      .prepare("SELECT * FROM links WHERE hash=? AND expires>?")
      .get(hash(value), Date.now());
    requireThat(row, "Event link is missing or expired.", 404);
    return {
      business: (await store.business(String(row.business_id)))!,
      booking: await owned<Booking>(
        String(row.business_id),
        "bookings",
        String(row.booking_id),
      ),
    };
  }
  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.get("/api/default-business", async (_req, res) => {
    const row = await store.db
      .prepare("SELECT slug FROM businesses ORDER BY rowid LIMIT 1")
      .get();
    requireThat(row, "The business has not been set up yet.", 503);
    res.json({ slug: String(row.slug) });
  });
  writes.post("/api/login", async (req, res) => {
    const data = z
      .object({ email: z.email(), password: z.string().min(1).max(200) })
      .parse(req.body);
    const row = await store.db
      .prepare("SELECT * FROM users WHERE email=?")
      .get(data.email.toLowerCase());
    // A real scrypt even for unknown users reduces account enumeration through timing.
    const valid = await passwordMatches(
      data.password,
      row ? String(row.password) : `${"0".repeat(32)}:${"0".repeat(128)}`,
    );
    requireThat(row && valid, "Email or password is incorrect.", 401);
    const value = token();
    await store.db
      .prepare("DELETE FROM sessions WHERE expires<?")
      .run(Date.now());
    await store.db
      .prepare("INSERT INTO sessions(hash,user_id,expires) VALUES(?,?,?)")
      .run(hash(value), String(row.id), Date.now() + 8 * 3600_000);
    res.cookie("magic_session", value, {
      httpOnly: true,
      sameSite: "strict",
      secure: origin.startsWith("https:"),
      maxAge: 8 * 3600_000,
      path: "/",
    });
    res.json({ user: JSON.parse(String(row.data)) });
  });
  writes.post("/api/logout", async (req, res) => {
    const cookie = req.headers.cookie?.match(
      /(?:^|;\s*)magic_session=([a-f0-9]{64})(?:;|$)/,
    )?.[1];
    if (cookie)
      await store.db
        .prepare("DELETE FROM sessions WHERE hash=?")
        .run(hash(cookie));
    res.clearCookie("magic_session", { path: "/" }).json({ ok: true });
  });
  app.get("/api/public/:slug", async (req, res) => {
    const business = await businessBySlug(String(req.params.slug));
    const reviews = (await store.all<Review>(business.id, "reviews"))
      .filter((r) => r.published && r.publishConsent)
      .map((r) => ({
        performerId: r.performerId,
        overall: r.overall,
        punctuality: r.punctuality,
        engagement: r.engagement,
        communication: r.communication,
        text: r.text,
        bestReaction: r.bestReaction ?? "",
        personalMoment: r.personalMoment ?? "",
        rememberedDetail: r.rememberedDetail ?? "",
        photo: r.photoConsent ? r.photo : "",
      }));
    res.json({
      business,
      guestGalleries: await store.all(business.id, "guestGalleries"),
      packages: (await store.all<Package>(business.id, "packages")).filter(
        (p) => p.active,
      ),
      performers: (
        await store.all<Performer>(business.id, "performers")
      ).filter((p) => p.active),
      reviews,
      customFields: orderedFields(
        await store.all<CustomField>(business.id, "customFields"),
      ).filter((f) => f.active),
    });
  });
  writes.post("/api/public/:slug/visit", async (req, res) => {
    const business = await businessBySlug(String(req.params.slug));
    const { source } = z
      .object({
        source: z
          .enum([
            "direct",
            "instagram",
            "whatsapp",
            "referral",
            "school",
            "other",
          ])
          .default("direct"),
      })
      .parse(req.body);
    await store.db
      .prepare(
        "INSERT INTO visits(business_id,source,day,count) VALUES(?,?,?,1) ON CONFLICT(business_id,source,day) DO UPDATE SET count=count+1",
      )
      .run(business.id, source, new Date().toISOString().slice(0, 10));
    res.json({ ok: true });
  });
  writes.post("/api/public/:slug/interest", async (req, res) => {
    const business = await businessBySlug(String(req.params.slug));
    const { kind, key } = z.object({
      kind: z.enum(["show_open", "show_add", "service_open", "service_add", "occasion"]),
      key: z.string().min(1).max(100),
    }).parse(req.body);
    const valid = kind.startsWith("show_")
      ? (await store.all<Package>(business.id, "packages")).some((item) => item.active && item.id === key)
      : kind.startsWith("service_")
        ? guestServiceNames(business.otherShowNames, business.hiddenGuestServices).includes(key)
        : ["Birthday", "School event", "Wedding", "Corporate event", "Festival", "Christmas"].includes(key);
    requireThat(valid, "Unknown public choice.", 400);
    await store.db.prepare(
      "INSERT INTO interest_clicks(business_id,kind,item_key,day,count) VALUES(?,?,?,?,1) ON CONFLICT(business_id,kind,item_key,day) DO UPDATE SET count=count+1",
    ).run(business.id, kind, key, new Date().toISOString().slice(0, 10));
    res.json({ ok: true });
  });
  const customerSession = customerAccounts(app, store, origin, issueLink);
  writes.post("/api/public/:slug/enquiries", async (req, res) => {
    const business = await businessBySlug(String(req.params.slug));
    const input = z.object({
      service: short.min(2).max(100),
      name: short.min(2).max(120),
      phone: customerSchema.shape.phone,
      date: z.union([date, z.literal("")]).default(""),
      location: short.max(240).default(""),
      notes: z.string().trim().max(1500).default(""),
    }).parse(req.body);
    const enquiry: ServiceEnquiry = {
      ...input,
      id: id(),
      status: "new",
      createdAt: new Date().toISOString(),
    };
    await store.transaction(async () => {
      await store.put(business.id, "enquiries", enquiry);
      await store.audit(business.id, "visitor", "enquiry.created", enquiry.id, null, enquiry);
    });
    res.status(201).json({ id: enquiry.id });
  });
  writes.post("/api/public/:slug/requests", async (req, res) => {
    const business = await businessBySlug(String(req.params.slug));
    const account = await customerSession(req, business.id);
    const input = z
      .object({ event: eventSchema.extend({ packageIds: z.array(short.min(1)).max(12), requestedServices: z.array(short.min(1)).max(30).default([]) }), customAnswers: z.unknown().optional() })
      .parse(req.body);
    requireThat(input.event.packageIds.length + input.event.requestedServices.length > 0, "Choose at least one show.");
    const services = guestServiceNames(business.otherShowNames, business.hiddenGuestServices);
    requireThat(input.event.requestedServices.every((name) => services.includes(name)), "A selected guest act is unavailable.");
    requireThat(new Set(input.event.requestedServices).size === input.event.requestedServices.length, "Choose each guest act once.");
    await validateSelection(
      business.id,
      input.event.packageIds,
      input.event.performerIds,
    );
    validEventDate(business, input.event);
    const answers = customAnswers(
      await store.all<CustomField>(business.id, "customFields"),
      input.customAnswers,
    );
    const result = await store.transaction(async () => {
      const customer = await owned<Customer>(
        business.id,
        "customers",
        account.customerId,
      );
      const now = new Date().toISOString();
      const booking: Booking = {
        customAnswers: answers,
        ...input.event,
        packageSnapshot: await Promise.all(
          input.event.packageIds.map(
            async (p) => await owned<Package>(business.id, "packages", p),
          ),
        ),
        id: id(),
        customerId: customer.id,
        status: "requested",
        quotes: [],
        acceptedQuoteId: "",
        availability: Object.fromEntries(
          input.event.performerIds.map((p) => [p, "pending"]),
        ),
        travel: 30,
        breakMinutes: 10,
        checklist: [],
        venueNotes: "",
        backupPerformerIds: [],
        revision: 1,
        createdAt: now,
        updatedAt: now,
      };
      await store.put(business.id, "bookings", booking);
      await store.audit(
        business.id,
        "customer",
        "booking.requested",
        booking.id,
        null,
        booking,
      );
      return {
        id: booking.id,
        path: await issueLink(business.id, booking.id),
        status: booking.status,
      };
    });
    res.status(201).json(result);
  });
  app.get("/api/event", async (req, res) => {
    const { business, booking } = await eventAccess(req);
    const packages = [
      ...new Map(
        [
          ...(await store.all<Package>(business.id, "packages")).filter(
            (p) =>
              booking.packageIds.includes(p.id) ||
              booking.quotes.some((q) => q.packageIds.includes(p.id)),
          ),
          ...(booking.packageSnapshot ?? []),
          ...booking.quotes.flatMap((q) => q.packageSnapshot ?? []),
        ].map((p) => [p.id, p]),
      ).values(),
    ];
    const {
      id,
      name,
      date,
      time,
      location,
      occasion,
      audience,
      age,
      indoor,
      power,
      space,
      status,
      quotes,
      acceptedQuoteId,
      packageIds,
      performerIds,
      revision,
    } = booking;
    res.json({
      business,
      booking: {
        id,
        name,
        date,
        time,
        location,
        occasion,
        audience,
        age,
        indoor,
        power,
        space,
        status,
        paymentTerms: booking.paymentTerms,
        declined: booking.declined,
        quotes,
        acceptedQuoteId,
        packageIds,
        performerIds,
        revision,
        giftDetails: booking.giftDetails,
        requestedServices: booking.requestedServices ?? [],
        certificate: booking.certificate,
        customAnswers: booking.customAnswers ?? [],
      },
      packages,
      performers: (
        await store.all<Performer>(business.id, "performers")
      ).filter((p) => performerIds.includes(p.id)),
      totals: ((t) => ({
        agreed: t.agreed,
        paid: t.paid,
        balance: t.balance,
        deposit: t.deposit,
      }))(totals(booking, await store.all(business.id, "money"))),
      timetable: timetable(booking, packages, business.timezone),
      reviewed: (await store.all<Review>(business.id, "reviews"))
        .filter((r) => r.bookingId === id)
        .map((r) => r.performerId),
      startsAt: DateTime.fromISO(`${booking.date}T${booking.time}`, { zone: business.timezone }).toUTC().toISO(),
    });
  });
  writes.post("/api/event/certificate", async (req, res) => {
    const { business, booking } = await eventAccess(req);
    requireThat(["confirmed", "completed"].includes(booking.status), "Certificates are available after the event is confirmed.", 409);
    const certificate = z.object({ starName: short.min(1).max(80), role: z.enum(["magician", "scientist"]) }).parse(req.body);
    await store.transaction(async () => {
      await store.put(business.id, "bookings", { ...booking, certificate, updatedAt: new Date().toISOString() });
      await store.audit(business.id, "customer", "certificate.saved", booking.id, booking.certificate ?? null, certificate);
    });
    res.json({ certificate });
  });
  writes.post("/api/event/accept", async (req, res) => {
    const { business, booking } = await eventAccess(req);
    const input = z
      .object({ quoteId: short, revision: z.number().int() })
      .parse(req.body);
    requireThat(
      booking.revision === input.revision,
      "The quote changed. Refresh and review it before accepting.",
      409,
    );
    requireThat(
      booking.status === "quoted",
      "This proposal is not available for acceptance.",
      409,
    );
    requireThat(
      booking.quotes.some((q) => q.id === input.quoteId),
      "Quote not found",
      404,
    );
    const next = {
      ...booking,
      acceptedQuoteId: input.quoteId,
      status: "accepted" as const,
      revision: booking.revision + 1,
      updatedAt: new Date().toISOString(),
    };
    await store.transaction(async () => {
      await validateQuoteReward(
        store,
        business.id,
        booking,
        booking.quotes.find((q) => q.id === input.quoteId)!,
      );
      await store.put(business.id, "bookings", next);
      await store.audit(
        business.id,
        "customer",
        "quote.accepted",
        booking.id,
        booking,
        next,
      );
    });
    res.json({ ok: true });
  });
  writes.post("/api/event/details", async (req, res) => {
    const { business, booking } = await eventAccess(req);
    const input = z
      .object({
        revision: z.number().int(),
        location: short.min(3),
        audience: z.number().int().min(1).max(10000),
        age: z.number().int().min(0).max(99),
        indoor: z.boolean(),
        power: z.boolean(),
        space: z.number().min(1).max(100000),
      })
      .parse(req.body);
    requireThat(
      !["completed", "cancelled"].includes(booking.status),
      "This event is closed.",
      409,
    );
    requireThat(
      input.revision === booking.revision,
      "The event changed; refresh before editing.",
      409,
    );
    const next = {
      ...booking,
      ...input,
      availability:
        input.location !== booking.location
          ? Object.fromEntries(
              booking.performerIds.map((p) => [p, "pending" as const]),
            )
          : booking.availability,
      availabilityResponses:
        input.location !== booking.location ? {} : booking.availabilityResponses,
      artistCompletion:
        input.location !== booking.location ? {} : booking.artistCompletion,
      status:
        booking.status === "confirmed" ? ("accepted" as const) : booking.status,
      revision: booking.revision + 1,
      updatedAt: new Date().toISOString(),
    };
    await store.transaction(async () => {
      await store.put(business.id, "bookings", next);
      await store.audit(
        business.id,
        "customer",
        "details.updated-recheck-required",
        booking.id,
        booking,
        next,
      );
    });
    res.json({ ok: true });
  });
  writes.post("/api/event/reviews", async (req, res) => {
    const { business, booking } = await eventAccess(req);
    requireThat(
      booking.status === "completed",
      "Reviews open after the event is completed.",
      409,
    );
    const star = z.number().int().min(1).max(5);
    const input = z
      .object({
        performerId: short.default(""),
        overall: star,
        punctuality: star,
        engagement: star,
        communication: star,
        text: z.string().max(3000),
        bestReaction: z.string().max(500).default(""),
        personalMoment: z.string().max(500).default(""),
        rememberedDetail: z.string().max(500).default(""),
        privateFeedback: z.string().max(3000),
        photo: url,
        photoConsent: z.boolean(),
        publishConsent: z.boolean(),
      })
      .parse(req.body);
    requireThat(
      !input.performerId || booking.performerIds.includes(input.performerId),
      "Only booked performers can be reviewed.",
    );
    requireThat(
      !(await store.all<Review>(business.id, "reviews")).some(
        (r) =>
          r.bookingId === booking.id && r.performerId === input.performerId,
      ),
      "A review already exists for this event or performer.",
      409,
    );
    const review = {
      ...input,
      id: id(),
      bookingId: booking.id,
      published: false,
      createdAt: new Date().toISOString(),
    };
    await store.transaction(async () => {
      await store.put(business.id, "reviews", review);
      await store.audit(
        business.id,
        "customer",
        "review.submitted",
        review.id,
        null,
        { bookingId: booking.id },
      );
    });
    res.status(201).json({ ok: true });
  });
  app.use("/api/manage", async (req, res, next) => {
    try {
      const cookie = req.headers.cookie?.match(
        /(?:^|;\s*)magic_session=([a-f0-9]{64})(?:;|$)/,
      )?.[1];
      requireThat(cookie, "Please sign in.", 401);
      const row = await store.db
        .prepare(
          "SELECT u.data FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.hash=? AND s.expires>?",
        )
        .get(hash(cookie), Date.now());
      requireThat(row, "Please sign in.", 401);
      const user = JSON.parse(String(row.data)) as User;
      const target = req.headers["x-support-business"];
      let business = (await store.business(user.businessId))!;
      if (target && target !== user.businessId) {
        requireThat(
          user.role === "admin" && typeof target === "string",
          "Business access denied.",
          403,
        );
        const reason = req.headers["x-support-reason"];
        requireThat(
          typeof reason === "string" && reason.trim().length >= 10,
          "A support-access reason is required.",
        );
        business = (await store.business(target))!;
        requireThat(business, "Business not found", 404);
        await store.audit(
          business.id,
          user.email,
          "admin.support-access",
          business.id,
          null,
          { reason, method: req.method, path: req.path },
        );
      }
      (req as Authed).user = user;
      (req as Authed).business = business;
      requireThat(staffRouteAllowed(user.role, req.method, req.originalUrl), "Your access level does not permit this action.", 403);
      if (limitedStaff(user.role)) {
        const sendJson = res.json.bind(res);
        res.json = (body: unknown) => sendJson(staffResponse(body, user.role));
      }
      next();
    } catch (error) {
      next(error);
    }
  });
  app.post(
    "/api/manage/upload-photo",
    express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: "3mb" }),
    async (request, res) => {
      const req = request as Authed;
      canManage(req);
      const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
      requireThat(blobToken, "Photo uploads are not connected yet.", 503);
      const bytes = req.body;
      requireThat(Buffer.isBuffer(bytes) && bytes.length > 0, "Choose an image to upload.");
      const mime = req.headers["content-type"]?.split(";")[0]?.toLowerCase();
      const ext = mime === "image/jpeg" ? "jpg" : mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "";
      const valid = ext === "jpg"
        ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
        : ext === "png"
          ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          : ext === "webp" && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
      requireThat(valid, "Use a JPEG, PNG or WebP image.");
      const uploaded = await put(
        `${req.business.id}/shows/${randomUUID()}.${ext}`,
        bytes,
        { access: "public", contentType: mime, token: blobToken },
      );
      await store.audit(req.business.id, req.user.email, "photo.uploaded", uploaded.url, null, { bytes: bytes.length });
      res.status(201).json({ url: uploaded.url });
    },
  );
  app.post("/api/manage/upload-video", async (request, res) => {
    const req = request as Authed;
    canManage(req);
    const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
    requireThat(blobToken, "Video uploads are not connected yet.", 503);
    const result = await handleUpload({
      token: blobToken,
      request: req,
      body: req.body as HandleUploadBody,
      onBeforeGenerateToken: async (pathname) => {
        requireThat(
          new RegExp(`^${req.business.id}/show-videos/[a-f0-9-]+\\.(mp4|webm)$`).test(pathname),
          "Choose an MP4 or WebM video.",
        );
        return {
          allowedContentTypes: ["video/mp4", "video/webm"],
          maximumSizeInBytes: 100 * 1024 * 1024,
          addRandomSuffix: false,
        };
      },
    });
    res.json(result);
  });
  app.get("/api/manage/reward-settings", async (req, res) => {
    canManage(req);
    res.json(await rewardSettings(store, req.business.id));
  });
  staffNotices(app, store);
  customerRecovery(app, store, canManage);
  rewardLedger(app, store, canManage);
  contactHistory(app, store);
  customerMerge(app, store);
  followups(app, store);
  writes.put("/api/manage/bookings/:id/custom-answers", async (req, res) => {
    canManage(req);
    const booking = await owned<Booking>(
      req.business.id,
      "bookings",
      String(req.params.id),
    );
    const input = z
      .object({
        revision: z.number().int(),
        values: z.record(
          z.string(),
          z.union([z.string().max(3000), z.number().finite()]),
        ),
      })
      .parse(req.body);
    requireThat(
      input.revision === booking.revision,
      "This event changed. Refresh before editing.",
      409,
    );
    requireThat(
      !["cancelled", "completed"].includes(booking.status),
      "Closed events retain their history.",
      409,
    );
    const old = booking.customAnswers ?? [];
    requireThat(
      Object.keys(input.values).every((key) => old.some((a) => a.id === key)),
      "Unknown booking question.",
    );
    res.json(
      await writeRecord(
        req,
        "bookings",
        {
          ...booking,
          customAnswers: old.map((a) => ({
            ...a,
            value: input.values[a.id] ?? a.value,
          })),
          revision: booking.revision + 1,
          updatedAt: new Date().toISOString(),
        },
        "custom-answers-edited",
      ),
    );
  });
  app.get("/api/manage/custom-fields", async (req, res) => {
    canManage(req);
    res.json(
      orderedFields(
        await store.all<CustomField>(req.business.id, "customFields"),
      ),
    );
  });
  writes.put("/api/manage/custom-fields/order", async (req, res) => {
    canManage(req);
    const input = z
      .object({
        previous: z.array(z.string()).max(50),
        ids: z.array(z.string()).max(50),
      })
      .parse(req.body);
    const result = await store.transaction(async () => {
      const fields = orderedFields(
        await store.all<CustomField>(req.business.id, "customFields"),
      );
      const previous = fields.map((f) => f.id);
      requireThat(
        JSON.stringify(previous) === JSON.stringify(input.previous),
        "Questions changed. Reopen the questions before reordering.",
        409,
      );
      requireThat(
        input.ids.length === previous.length &&
          new Set(input.ids).size === previous.length &&
          input.ids.every((key) => previous.includes(key)),
        "Include each question exactly once.",
      );
      const next = input.ids.map((key, position) => ({
        ...fields.find((f) => f.id === key)!,
        position,
      }));
      await Promise.all(
        next.map(
          async (f) => await store.put(req.business.id, "customFields", f),
        ),
      );
      await store.audit(
        req.business.id,
        req.user.email,
        "questions.reordered",
        "customFields",
        previous,
        input.ids,
      );
      return next;
    });
    res.json(result);
  });
  writes.post("/api/manage/custom-fields", async (req, res) => {
    canManage(req);
    const input = customFieldSchema.parse(req.body);
    requireThat(
      (await store.get(req.business.id, "customFields", input.id)) ||
        (await store.all(req.business.id, "customFields")).length < 50,
      "Maximum 50 questions. Edit an existing question.",
    );
    const fields = await store.all<CustomField>(
      req.business.id,
      "customFields",
    );
    const existing = fields.find((f) => f.id === input.id);
    res.json(
      await writeRecord(req, "customFields", {
        ...input,
        position: existing
          ? (existing.position ?? 0)
          : Math.max(-1, ...fields.map((f) => f.position ?? 0)) + 1,
      }),
    );
  });
  writes.put("/api/manage/reward-settings", async (req, res) => {
    canManage(req);
    res.json(
      await writeRecord(req, "rewardSettings", {
        ...rewardSchema.parse(req.body),
        id: "program",
      }),
    );
  });
  app.get("/api/manage/state", async (request, res) => {
    if (request.user.role !== "performer")
      await generateFollowups(store, request.business);
    const req = request as Authed;
    const bid = req.business.id;
    const result: Record<string, unknown> = {
      business: req.business,
      user: req.user,
      uploadsEnabled: !!process.env.BLOB_READ_WRITE_TOKEN,
    };
    await Promise.all(
      kinds.map(async (kind) => {
        result[kind] = await store.all(bid, kind);
      }),
    );
    result.enquiries = req.user.role === "performer"
      ? []
      : await store.all<ServiceEnquiry>(bid, "enquiries");
    if (req.user.role === "assistant")
      result.bookings = (result.bookings as Booking[]).map((booking) => ({ ...booking, surpriseDetails: undefined }));
    if (req.user.role === "sales") {
      result.money = (result.money as MoneyEntry[]).filter((entry) => entry.kind !== "expense").map((entry) => ({ ...entry, note: "", performerId: undefined }));
      result.referrals = [];
      result.bookings = (result.bookings as Booking[]).map((booking) => ({ ...booking, surpriseDetails: undefined, availabilityResponses: {}, artistCompletion: {} }));
    }
    if (req.user.role === "accountant") {
      result.customers = (result.customers as Customer[]).map((customer) => ({ ...customer, children: [], contacts: [], notes: "", followUp: "", source: "" }));
      result.bookings = (result.bookings as Booking[]).map((booking) => ({
        ...booking, notes: "", venueNotes: "", checklist: [], customAnswers: undefined, giftDetails: undefined, surpriseDetails: undefined, certificate: undefined,
        availabilityResponses: {},
        artistCompletion: Object.fromEntries(Object.entries(booking.artistCompletion ?? {}).map(([key, completion]) => [key, { ...completion, notes: "", problems: "" }])),
      }));
      for (const kind of ["reminders", "reviews", "blocks", "guestGalleries", "enquiries"]) result[kind] = [];
    }
    if (req.user.role === "performer") {
      const assigned = (await store.all<Booking>(bid, "bookings")).filter((b) =>
        b.performerIds.includes(req.user.performerId ?? ""),
      );
      result.companyCalendar = req.user.viewCompanyCalendar
        ? (result.bookings as Booking[])
            .filter((b) => !b.performerIds.includes(req.user.performerId ?? ""))
            .map((b) => ({ date: b.date, time: b.time, status: b.status }))
        : [];
      const visiblePackageIds = new Set(assigned.flatMap((b) => b.packageIds));
      result.packages = (result.packages as Package[])
        .filter((p) => visiblePackageIds.has(p.id))
        .map((p) => ({ ...p, price: 0, bundleSnapshot: undefined }));
      result.performers = (result.performers as Performer[])
        .filter((p) => p.id === req.user.performerId);
      result.bookings = assigned.map((b) => ({
        ...b,
        quotes: [],
        acceptedQuoteId: "",
        customerId: "",
        notes: "",
        paymentTerms: undefined,
        packageSnapshot: undefined,
        customAnswers: undefined,
        giftDetails: undefined,
        surpriseDetails: undefined,
        backupPerformerIds: [],
        availabilityResponses: b.availabilityResponses?.[req.user.performerId ?? ""]
          ? { [req.user.performerId ?? ""]: b.availabilityResponses[req.user.performerId ?? ""] }
          : {},
        artistCompletion: b.artistCompletion?.[req.user.performerId ?? ""]
          ? { [req.user.performerId ?? ""]: b.artistCompletion[req.user.performerId ?? ""] }
          : {},
      }));
      for (const k of [
        "customers",
        "money",
        "reminders",
        "reviews",
        "referrals",
      ])
        result[k] = [];
      result.blocks = (
        await store.all<AvailabilityBlock>(bid, "blocks")
      ).filter((b) => b.performerId === req.user.performerId);
    }
    const visibleRevisions = new Map((result.bookings as Booking[]).map((booking) => [booking.id, booking.revision]));
    result.noticeStates = (await store.all<StaffNoticeState>(bid, "staffNoticeStates"))
      .filter((notice) => notice.userId === req.user.id && visibleRevisions.get(notice.bookingId) === notice.revision);
    result.actPlans = [];
    if (canSeeArtistPay(req.user.role)) {
      result.actPlans = (await store.all<ActPlan>(bid, "actPlans")).map((plan) => req.user.role === "accountant" ? { ...plan, notes: "" } : plan);
    }
    if (["owner", "admin"].includes(req.user.role)) {
      result.audit = (await store.all(bid, "audit")).slice(-200).reverse();
      result.users = (
        await store.db
          .prepare("SELECT data FROM users WHERE business_id=?")
          .all(bid)
      ).map((row) => JSON.parse(String(row.data)));
      result.visits = await store.db
        .prepare(
          "SELECT source,SUM(count) as count FROM visits WHERE business_id=? GROUP BY source",
        )
        .all(bid);
      result.interest = await store.db.prepare(
        "SELECT kind,item_key as key,SUM(count) as count FROM interest_clicks WHERE business_id=? AND day>=? GROUP BY kind,item_key ORDER BY count DESC",
      ).all(bid, new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10));
    } else {
      result.audit = [];
      result.users = [];
      result.visits = [];
      result.interest = [];
    }
    res.json(result);
  });
  writes.post("/api/manage/enquiries/:id/contacted", async (request, res) => {
    const req = request as Authed;
    requireThat(req.user.role !== "performer", "Not allowed to manage enquiries.", 403);
    const enquiry = await owned<ServiceEnquiry>(req.business.id, "enquiries", String(req.params.id));
    const revision = z.number().int().min(0).default(0).parse(req.body.revision);
    requireThat(revision === (enquiry.revision ?? 0), "This enquiry changed. Refresh before saving.", 409);
    const next: ServiceEnquiry = { ...enquiry, status: "contacted", revision: revision + 1, updatedAt: new Date().toISOString() };
    res.json(await writeRecord(req, "enquiries", next, "contacted"));
  });
  writes.put("/api/manage/enquiries/:id", async (request, res) => {
    const req = request as Authed;
    requireThat(req.user.role !== "performer", "Not allowed to manage enquiries.", 403);
    const old = await owned<ServiceEnquiry>(req.business.id, "enquiries", String(req.params.id));
    const input = z.object({
      service: short.min(2).max(100), name: short.min(2).max(120),
      phone: customerSchema.shape.phone, date: z.union([date, z.literal("")]),
      location: short.max(240), notes: z.string().trim().max(1500),
      revision: z.number().int().min(0),
    }).parse(req.body);
    requireThat(input.revision === (old.revision ?? 0), "This enquiry changed. Refresh before saving.", 409);
    res.json(await writeRecord(req, "enquiries", { ...old, ...input, revision: input.revision + 1, updatedAt: new Date().toISOString() }, "edited"));
  });
  writes.post("/api/manage/enquiries/:id/archive", async (request, res) => {
    const req = request as Authed;
    requireThat(req.user.role !== "performer", "Not allowed to manage enquiries.", 403);
    const old = await owned<ServiceEnquiry>(req.business.id, "enquiries", String(req.params.id));
    const input = z.object({ archived: z.boolean(), revision: z.number().int().min(0) }).parse(req.body);
    requireThat(input.revision === (old.revision ?? 0), "This enquiry changed. Refresh before saving.", 409);
    res.json(await writeRecord(req, "enquiries", { ...old, archivedAt: input.archived ? new Date().toISOString() : undefined, revision: input.revision + 1, updatedAt: new Date().toISOString() }, input.archived ? "archived" : "restored"));
  });
  writes.delete("/api/manage/enquiries/:id", async (request, res) => {
    const req = request as Authed;
    requireThat(["owner", "admin"].includes(req.user.role), "Only the owner or admin can permanently delete enquiries.", 403);
    const old = await owned<ServiceEnquiry>(req.business.id, "enquiries", String(req.params.id));
    const input = z.object({ name: z.string(), revision: z.number().int().min(0) }).parse(req.body);
    requireThat(input.revision === (old.revision ?? 0), "This enquiry changed. Refresh before deleting.", 409);
    requireThat(input.name === old.name, "Type the enquiry customer's exact name to confirm.", 400);
    await store.transaction(async () => {
      await store.db.prepare("DELETE FROM records WHERE business_id=? AND kind='enquiries' AND id=?").run(req.business.id, old.id);
      const audits = await store.all<{ id: string; entityId: string }>(req.business.id, "audit");
      for (const audit of audits.filter((entry) => entry.entityId === old.id))
        await store.db.prepare("DELETE FROM records WHERE business_id=? AND kind='audit' AND id=?").run(req.business.id, audit.id);
      await store.audit(req.business.id, req.user.email, "enquiry.permanently-deleted", old.id, null, null);
    });
    res.json({ ok: true });
  });
  writes.put("/api/manage/business", async (request, res) => {
    const req = request as Authed;
    canManage(req);
    const value = z
      .object({
        name: short.min(2),
        intro: z.string().max(3000),
        instagram: z.union([
          z.literal(""),
          z
            .url()
            .refine(
              (x) =>
                new URL(x).hostname === "www.instagram.com" ||
                new URL(x).hostname === "instagram.com",
            ),
        ]),
        whatsapp: z.string().regex(/^\+?[0-9]{7,16}$|^$/),
        contactEmail: z.union([z.email(), z.literal("")]).optional(),
        logo: z
          .union([
            z.literal(""),
            z.literal("/sam-logo.png"),
            z
              .url()
              .refine(
                (value) => value.startsWith("https://"),
                "Use an HTTPS image link",
              ),
          ])
          .optional(),
        characterNames: z.array(short.min(1).max(80)).max(100).optional(),
        otherShowNames: z.array(short.min(1).max(80)).max(100).optional(),
      })
      .parse(req.body);
    const next = { ...req.business, ...value };
    await store.transaction(async () => {
      await store.db
        .prepare("UPDATE businesses SET data=? WHERE id=?")
        .run(JSON.stringify(next), req.business.id);
      await store.audit(
        req.business.id,
        req.user.email,
        "business.updated",
        next.id,
        req.business,
        next,
      );
    });
    res.json(next);
  });
  writes.post("/api/manage/show-categories", async (request, res) => {
    const req = request as Authed;
    canManage(req);
    const input = z.discriminatedUnion("action", [
      z.object({ action: z.literal("add"), name: short.min(2).max(40) }),
      z.object({ action: z.literal("rename"), oldName: short.min(1).max(40), name: short.min(2).max(40) }),
      z.object({ action: z.literal("remove"), oldName: short.min(1).max(40) }),
    ]).parse(req.body);
    const packages = await store.all<Package>(req.business.id, "packages");
    const performers = await store.all<Performer>(req.business.id, "performers");
    const categories = [...new Set([
      ...(req.business.showCategories ?? []),
      ...packages.filter((item) => !item.bundleIds?.length).map((item) => item.category),
      ...performers.flatMap((item) => item.categories),
    ].filter((name) => name && name.toLowerCase() !== "bundle"))];
    const match = (name: string) => categories.find((item) => item.toLowerCase() === name.toLowerCase());
    if (input.action === "add") {
      requireThat(input.name.toLowerCase() !== "bundle", "Bundle is reserved for offers.");
      requireThat(!match(input.name), "This category already exists.");
      requireThat(categories.length < 30, "You can have up to 30 show categories.");
      categories.push(input.name);
    } else {
      const existing = match(input.oldName);
      requireThat(existing, "Category not found.", 404);
      if (input.action === "rename") {
        requireThat(input.name.toLowerCase() !== "bundle", "Bundle is reserved for offers.");
        requireThat(!match(input.name) || match(input.name) === existing, "This category already exists.");
        categories[categories.indexOf(existing)] = input.name;
      } else {
        requireThat(
          !packages.some((item) => item.category.toLowerCase() === existing.toLowerCase()) &&
            !performers.some((item) => item.categories.some((category) => category.toLowerCase() === existing.toLowerCase())),
          "Move shows and performers to another category before removing it.",
          409,
        );
        categories.splice(categories.indexOf(existing), 1);
      }
    }
    const next = { ...req.business, showCategories: categories };
    await store.transaction(async () => {
      if (input.action === "rename") {
        for (const item of packages.filter((item) => item.category.toLowerCase() === input.oldName.toLowerCase()))
          await store.put(req.business.id, "packages", { ...item, category: input.name });
        for (const item of performers.filter((item) => item.categories.some((category) => category.toLowerCase() === input.oldName.toLowerCase())))
          await store.put(req.business.id, "performers", {
            ...item,
            categories: item.categories.map((category) => category.toLowerCase() === input.oldName.toLowerCase() ? input.name : category),
          });
      }
      await store.db.prepare("UPDATE businesses SET data=? WHERE id=?").run(JSON.stringify(next), req.business.id);
      await store.audit(req.business.id, req.user.email, `show-category.${input.action}`, input.action === "add" ? input.name : input.oldName, req.business.showCategories ?? [], categories);
    });
    res.json({ categories });
  });
  writes.post("/api/manage/guest-services", async (request, res) => {
    const req = request as Authed;
    canManage(req);
    const input = z.discriminatedUnion("action", [
      z.object({ action: z.literal("add"), name: short.min(2).max(80) }),
      z.object({ action: z.literal("hide"), name: short.min(2).max(80) }),
      z.object({ action: z.literal("restore"), name: short.min(2).max(80) }),
    ]).parse(req.body);
    const allNames = guestServiceNames(req.business.otherShowNames);
    const existing = allNames.find((name) => name.toLowerCase() === input.name.toLowerCase());
    const hidden = [...(req.business.hiddenGuestServices ?? [])];
    const others = [...(req.business.otherShowNames ?? [])];
    if (input.action === "add") {
      requireThat(!existing, "This guest show already exists. Restore it if it is hidden.");
      requireThat(others.length < 100, "You can have up to 100 guest services.");
      others.push(input.name);
    } else {
      requireThat(existing, "Guest show not found.", 404);
      const index = hidden.findIndex((name) => name.toLowerCase() === existing.toLowerCase());
      if (input.action === "hide") {
        requireThat(index < 0, "This guest show is already hidden.");
        hidden.push(existing);
      } else {
        requireThat(index >= 0, "This guest show is already visible.");
        hidden.splice(index, 1);
      }
    }
    const next = { ...req.business, otherShowNames: others, hiddenGuestServices: hidden };
    await store.transaction(async () => {
      await store.db.prepare("UPDATE businesses SET data=? WHERE id=?").run(JSON.stringify(next), req.business.id);
      await store.audit(req.business.id, req.user.email, `guest-service.${input.action}`, existing ?? input.name, req.business, next);
    });
    res.json({ otherShowNames: others, hiddenGuestServices: hidden });
  });
  writes.put("/api/manage/site-media/:slot", async (request, res) => {
    const req = request as Authed;
    canManage(req);
    const slot = String(req.params.slot);
    requireThat(siteMediaSlots.some((entry) => entry.key === slot), "Photo location not found.", 404);
    const { value } = z.object({
      value: z.union([
        z.literal(""),
        z.url().max(2000).refine((url) => {
          const link = new URL(url);
          return link.protocol === "https:" && !link.username && !link.password;
        }, "Use a public HTTPS photo link without credentials"),
        z.null(),
      ]),
    }).parse(req.body);
    const siteMedia = { ...(req.business.siteMedia ?? {}) };
    if (value === null) delete siteMedia[slot];
    else siteMedia[slot] = value;
    requireThat(["heroMagic", "heroScience", "heroCharacters"].some((key) => siteMedia[key] !== ""), "Keep at least one homepage photo.");
    const next = { ...req.business, siteMedia };
    await store.transaction(async () => {
      await store.db.prepare("UPDATE businesses SET data=? WHERE id=?").run(JSON.stringify(next), req.business.id);
      await store.audit(req.business.id, req.user.email, "site-media.updated", slot, req.business.siteMedia?.[slot] ?? null, value);
    });
    res.json({ siteMedia });
  });
  writes.put("/api/manage/guest-galleries/:name", async (request, res) => {
    const req = request as Authed;
    canManage(req);
    const name = String(req.params.name);
    requireThat(guestServiceNames(req.business.otherShowNames).includes(name), "Show not found", 404);
    const id = name.toLocaleLowerCase("en");
    const input = z.object({
      gallery: z.array(z.object({
        url: z.url().refine((value) => value.startsWith("https://"), "Use an HTTPS image link"),
        caption: short.min(1),
        approved: z.literal(true),
      })).max(30),
      hiddenPhotoUrls: z.array(z.string().startsWith("/portfolio/")).max(30),
      videos: z.array(z.url().refine((value) => value.startsWith("https://"), "Use an HTTPS video link")).max(6).default([]),
      hiddenVideoUrls: z.array(z.string().regex(/^\/portfolio\/guest\/[a-z0-9-]+\.mp4$/)).max(10).default([]),
    }).parse(req.body);
    res.json(await writeRecord(req, "guestGalleries", { id, ...input }));
  });
  writes.post("/api/manage/users", async (request, res) => {
    const req = request as Authed;
    canManage(req);
    const input = z
      .object({
        name: short.min(2),
        email: z.email(),
        password: z.string().min(14).max(200),
        role: z.enum(["owner", "manager", "sales", "accountant", "assistant", "performer"]),
        performerId: short.optional(),
        viewCompanyCalendar: z.boolean().default(false),
      })
      .parse(req.body);
    if (input.role === "performer")
      requireThat(
        input.performerId &&
          (await store.get(req.business.id, "performers", input.performerId)),
        "Choose an existing performer.",
      );
    requireThat(
      !(await store.db
        .prepare("SELECT id FROM users WHERE email=?")
        .get(input.email.toLowerCase())),
      "This email already has an account.",
      409,
    );
    const user = await createUser(
      store,
      req.business.id,
      input.email,
      input.password,
      input.name,
      input.role,
      input.performerId,
    );
    if (input.role === "performer" && input.viewCompanyCalendar) {
      user.viewCompanyCalendar = true;
      await store.db.prepare("UPDATE users SET data=? WHERE id=?")
        .run(JSON.stringify(user), user.id);
    }
    await store.audit(
      req.business.id,
      req.user.email,
      "user.created",
      user.id,
      null,
      user,
    );
    res.status(201).json(user);
  });
  writes.post("/api/manage/password", async (req, res) => {
    const input = z
      .object({
        currentPassword: z.string().max(200),
        newPassword: z.string().min(14).max(200),
      })
      .parse(req.body);
    const row = (await store.db
      .prepare("SELECT password FROM users WHERE id=?")
      .get(req.user.id))!;
    requireThat(
      await passwordMatches(input.currentPassword, String(row.password)),
      "Current password is incorrect.",
      400,
    );
    const next = await passwordHash(input.newPassword);
    await store.transaction(async () => {
      await store.db
        .prepare("UPDATE users SET password=? WHERE id=?")
        .run(next, req.user.id);
      await store.db
        .prepare("DELETE FROM sessions WHERE user_id=?")
        .run(req.user.id);
      await store.audit(
        req.user.businessId,
        req.user.email,
        "user.password-changed",
        req.user.id,
        null,
        null,
      );
    });
    res.clearCookie("magic_session", { path: "/" }).json({ ok: true });
  });
  writes.put("/api/manage/users/:id", async (req, res) => {
    canManage(req);
    const key = String(req.params.id);
    const input = z
      .object({
        name: short.min(2),
        email: z.email(),
        role: z.enum(["owner", "manager", "sales", "accountant", "assistant", "performer", "admin"]),
        performerId: short.optional(),
        viewCompanyCalendar: z.boolean().default(false),
      })
      .parse(req.body);
    const row = await store.db
      .prepare("SELECT data FROM users WHERE id=? AND business_id=?")
      .get(key, req.business.id);
    requireThat(row, "User not found", 404);
    const old = JSON.parse(String(row.data)) as User;
    requireThat(
      input.role !== "admin" || old.role === "admin",
      "New platform administrators require an operational approval process.",
    );
    requireThat(
      old.role !== "admin" || input.role === "admin",
      "Keep platform administrator access for account recovery.",
    );
    requireThat(
      key !== req.user.id || input.role === old.role,
      "You cannot change your own access level.",
    );
    requireThat(
      !(await store.db
        .prepare("SELECT id FROM users WHERE email=? AND id<>?")
        .get(input.email.toLowerCase(), key)),
      "Email already has an account.",
      409,
    );
    if (input.role === "performer")
      requireThat(
        input.performerId &&
          (await store.get(req.business.id, "performers", input.performerId)),
        "Choose a performer profile.",
      );
    const next = { ...old, ...input, email: input.email.toLowerCase(),
      viewCompanyCalendar: input.role === "performer" && input.viewCompanyCalendar };
    await store.transaction(async () => {
      await store.db
        .prepare("UPDATE users SET email=?,data=? WHERE id=?")
        .run(next.email, JSON.stringify(next), key);
      await store.db.prepare("DELETE FROM sessions WHERE user_id=?").run(key);
      await store.audit(
        req.business.id,
        req.user.email,
        "user.updated",
        key,
        old,
        next,
      );
    });
    res.json(next);
  });
  writes.delete("/api/manage/users/:id", async (request, res) => {
    const req = request as Authed;
    canManage(req);
    const key = String(req.params.id);
    requireThat(key !== req.user.id, "You cannot remove your own access.");
    const row = await store.db
      .prepare("SELECT data FROM users WHERE id=? AND business_id=?")
      .get(key, req.business.id);
    requireThat(row, "User not found", 404);
    requireThat(
      (JSON.parse(String(row.data)) as User).role !== "admin",
      "Platform administrator removal requires an operational account recovery process.",
    );
    await store.transaction(async () => {
      await store.db.prepare("DELETE FROM sessions WHERE user_id=?").run(key);
      await store.db.prepare("DELETE FROM users WHERE id=?").run(key);
      for (const notice of (await store.all<StaffNoticeState>(req.business.id, "staffNoticeStates")).filter((item) => item.userId === key))
        await store.db.prepare("DELETE FROM records WHERE business_id=? AND kind='staffNoticeStates' AND id=?").run(req.business.id, notice.id);
      await store.audit(
        req.business.id,
        req.user.email,
        "user.removed",
        key,
        JSON.parse(String(row.data)),
        null,
      );
    });
    res.json({ ok: true });
  });
  writes.post("/api/manage/businesses", async (request, res) => {
    const req = request as Authed;
    requireThat(
      req.user.role === "admin",
      "Administrator access required.",
      403,
    );
    const value = z
      .object({
        name: short.min(2),
        slug: z.string().regex(/^[a-z0-9-]{2,60}$/),
        email: z.email(),
        password: z.string().min(14).max(200),
        timezone: short,
      })
      .parse(req.body);
    requireThat(
      DateTime.now().setZone(value.timezone).isValid,
      "Choose a valid timezone.",
    );
    requireThat(
      !(await store.business(value.slug, true)),
      "This public address is in use.",
      409,
    );
    requireThat(
      !(await store.db
        .prepare("SELECT id FROM users WHERE email=?")
        .get(value.email.toLowerCase())),
      "This email already has an account.",
      409,
    );
    const passwordValue = await passwordHash(value.password);
    const business = await store.transaction(async () => {
      const business = await store.createBusiness(
        value.name,
        value.slug,
        value.timezone,
      );
      await insertUser(
        store,
        business.id,
        value.email,
        passwordValue,
        value.name,
      );
      await store.audit(
        business.id,
        req.user.email,
        "business.created",
        business.id,
        null,
        business,
      );
      return business;
    });
    res.status(201).json(business);
  });
  app.get("/api/manage/businesses", async (request, res) => {
    const req = request as Authed;
    requireThat(
      req.user.role === "admin",
      "Administrator access required.",
      403,
    );
    res.json(await store.db.prepare("SELECT id,slug FROM businesses").all());
  });
  writes.put("/api/manage/:kind/:id", async (request, res, next) => {
    const req = request as Authed;
    const kind = String(req.params.kind);
    const key = String(req.params.id);
    if (
      ![
        "packages",
        "performers",
        "customers",
        "reminders",
        "blocks",
        "referrals",
      ].includes(kind)
    ) {
      next();
      return;
    }
    const previousPackage = kind === "packages" && key !== "new" ? await owned<Package>(req.business.id, kind, key) : undefined;
    const recordId = key === "new" ? id() : key;
    if (key !== "new") await owned(req.business.id, kind, key);
    if (["packages", "performers", "referrals"].includes(kind)) canManage(req);
    else
      requireThat(
        req.user.role !== "performer" || kind === "blocks",
        "Access denied",
        403,
      );
    let value: object;
    if (kind === "packages") {
      value = prepareBundle(
        packageSchema.parse(req.body),
        await store.all<Package>(req.business.id, "packages"),
        recordId,
      );
      // Each event/proposal keeps a package snapshot. Catalog edits apply to future requests.
    } else if (kind === "performers") value = performerSchema.parse(req.body);
    else if (kind === "customers") value = customerSchema.parse(req.body);
    else if (kind === "reminders") {
      const v = z
        .object({
          customerId: short,
          bookingId: short,
          title: short.min(2),
          date,
          done: z.boolean(),
          draft: z.string().trim().max(5000).default(""),
          marketing: z.boolean().default(false),
          revision: z.number().int().min(0).default(0),
        })
        .parse(req.body);
      if (v.customerId) await owned(req.business.id, "customers", v.customerId);
      if (v.bookingId) {
        const booking = await owned<Booking>(
          req.business.id,
          "bookings",
          v.bookingId,
        );
        requireThat(
          !v.customerId || booking.customerId === v.customerId,
          "Choose an event belonging to this customer.",
        );
      }
      const before =
        key === "new"
          ? undefined
          : await owned<Reminder>(req.business.id, "reminders", key);
      requireThat(
        v.revision === (before?.revision ?? 0),
        "This reminder changed. Reopen it before saving.",
        409,
      );
      value = { ...before, ...v, revision: v.revision + 1 };
    } else if (kind === "blocks") {
      const v = z
        .object({
          performerId: short,
          date,
          start: time,
          end: time,
          note: short,
        })
        .parse(req.body);
      requireThat(v.end > v.start, "End must follow start on the same day.");
      await owned(req.business.id, "performers", v.performerId);
      if (req.user.role === "performer") {
        requireThat(
          v.performerId === req.user.performerId,
          "Access denied",
          403,
        );
        if (key !== "new")
          requireThat(
            (await owned<AvailabilityBlock>(req.business.id, kind, key))
              .performerId === req.user.performerId,
            "Access denied",
            403,
          );
      }
      value = v;
    } else {
      const v = z
        .object({
          bookingId: short,
          performerId: short,
          fee: cents,
          status: z.enum(["offered", "accepted", "declined"]),
          note: short,
        })
        .parse(req.body);
      await owned(req.business.id, "bookings", v.bookingId);
      await owned(req.business.id, "performers", v.performerId);
      value = v;
    }
    const saved = await writeRecord(req, kind, { ...value, id: recordId });
    if (kind === "packages") {
      const show = saved as Package;
      const priceDrop = !!previousPackage && show.priceMode === "fixed" && previousPackage.priceMode === "fixed" && show.price < previousPackage.price;
      const publicChange = !previousPackage || !previousPackage.active || show.name !== previousPackage.name || show.description !== previousPackage.description || priceDrop;
      if (show.active && publicChange) {
        const title = priceDrop ? `New discount · ${show.name}` : !previousPackage || !previousPackage.active ? `${show.bundleIds?.length ? "New bundle" : "New show"} · ${show.name}` : `Show update · ${show.name}`;
        const description = show.description.slice(0, 180);
        await store.put(req.business.id, "bundleAnnouncements", { id: id(), packageId: show.id, title, description, at: new Date().toISOString() });
        await offerNotice(store, req.business, title, description, origin);
      }
    }
    res.json(saved);
  });
  writes.delete("/api/manage/:kind/:id", async (request, res) => {
    const req = request as Authed;
    canManage(req);
    const kind = String(req.params.kind),
      key = String(req.params.id);
    requireThat(
      [
        "packages",
        "performers",
        "customers",
        "reminders",
        "blocks",
        "referrals",
      ].includes(kind),
      "This record requires a logged correction or cancellation.",
    );
    const before = await owned<Record<string, unknown>>(
      req.business.id,
      kind,
      key,
    );
    const bookings = await store.all<Booking>(req.business.id, "bookings");
    const account = kind === "customers" ? await store.db.prepare("SELECT id FROM customer_accounts WHERE business_id=? AND customer_id=?").get(req.business.id, key) : undefined;
    if (kind === "customers") {
      requireThat(
        !bookings.some((b) => b.customerId === key) &&
          !(
            await store.all<{ customerId: string }>(
              req.business.id,
              "contactHistory",
            )
          ).some((n) => n.customerId === key) &&
          !(
            await store.all<{ customerId: string }>(
              req.business.id,
              "rewardAwards",
            )
          ).some((a) => a.customerId === key) &&
          !(await store.all<Reminder>(req.business.id, "reminders")).some(
            (r) => r.customerId === key,
          ) &&
          !(await store.all<{ referredBy: string }>(req.business.id, "customerExtras")).some((extra) => extra.referredBy === key),
        "This customer has history. Edit their details or mark Do not contact instead.",
        409,
      );
      const input = z.object({ name: z.string() }).parse(req.body);
      requireThat(input.name === before.name, "Enter the exact customer name to confirm removal.");
    }
    await store.transaction(async () => {
      if (["packages", "performers"].includes(kind))
        await store.put(req.business.id, kind, {
          ...before,
          id: key,
          active: false,
        });
      else {
        if (kind === "customers") {
          if (account) {
            await store.db.prepare("DELETE FROM customer_sessions WHERE account_id=?").run(account.id);
            await store.db.prepare("DELETE FROM customer_resets WHERE account_id=?").run(account.id);
            await store.db.prepare("DELETE FROM referral_codes WHERE account_id=?").run(account.id);
            await store.db.prepare("DELETE FROM customer_accounts WHERE id=? AND business_id=?").run(account.id, req.business.id);
          }
          for (const related of ["customerExtras", "pushDevices", "customerNotifications", "notificationDeliveries"]) {
            const records = await store.all<{ id: string; customerId?: string }>(req.business.id, related);
            for (const record of records.filter((item) => item.id === key || item.customerId === key))
              await store.db.prepare("DELETE FROM records WHERE business_id=? AND kind=? AND id=?").run(req.business.id, related, record.id);
          }
        }
        await store.db
          .prepare(
            "DELETE FROM records WHERE business_id=? AND kind=? AND id=?",
          )
          .run(req.business.id, kind, key);
      }
      await store.audit(
        req.business.id,
        req.user.email,
        `${kind}.removed`,
        key,
        kind === "customers" ? null : before,
        null,
      );
    });
    res.json({ ok: true });
  });
  writes.delete("/api/manage/bookings/:id/permanent", async (request, res) => {
    const req = request as Authed;
    canManage(req);
    const booking = await owned<Booking>(req.business.id, "bookings", String(req.params.id));
    const input = z.object({ name: z.string() }).parse(req.body);
    requireThat(booking.status === "cancelled", "Cancel the event before deleting it permanently.", 409);
    requireThat(input.name === booking.name, "Enter the exact event name to confirm deletion.");
    const linkedKinds = ["money", "referrals", "rewardAwards"];
    for (const kind of linkedKinds) {
      const records = await store.all<{ bookingId?: string; sourceEventIds?: string[] }>(req.business.id, kind);
      requireThat(!records.some((record) => record.bookingId === booking.id || record.sourceEventIds?.includes(booking.id)), "This event has payment, referral or reward history. It cannot be permanently deleted from Backstage.", 409);
    }
    requireThat(!booking.quotes.some((quote) => quote.reward), "This event has reward history. It cannot be permanently deleted from Backstage.", 409);
    await store.transaction(async () => {
      const linked = ["reviews", "reminders", "contactHistory", "customerNotifications", "staffNoticeStates"];
      const deletedIds = new Set([booking.id]);
      for (const kind of linked) {
        const records = await store.all<{ id: string; bookingId?: string }>(req.business.id, kind);
        for (const record of records.filter((item) => item.bookingId === booking.id)) {
          deletedIds.add(record.id);
          await store.db.prepare("DELETE FROM records WHERE business_id=? AND kind=? AND id=?").run(req.business.id, kind, record.id);
        }
      }
      for (const noticeId of deletedIds)
        await store.db.prepare("DELETE FROM records WHERE business_id=? AND kind='notificationDeliveries' AND id=?").run(req.business.id, noticeId);
      await store.db.prepare("DELETE FROM records WHERE business_id=? AND kind='actPlans' AND id=?").run(req.business.id, booking.id);
      await store.db.prepare("DELETE FROM links WHERE business_id=? AND booking_id=?").run(req.business.id, booking.id);
      await store.db.prepare("DELETE FROM records WHERE business_id=? AND kind='bookings' AND id=?").run(req.business.id, booking.id);
      const audits = await store.all<{ id: string; entityId: string }>(req.business.id, "audit");
      for (const audit of audits.filter((item) => deletedIds.has(item.entityId)))
        await store.db.prepare("DELETE FROM records WHERE business_id=? AND kind='audit' AND id=?").run(req.business.id, audit.id);
      await store.audit(req.business.id, req.user.email, "booking.permanently-deleted", booking.id, null, null);
    });
    res.json({ ok: true });
  });
  writes.post("/api/manage/bookings/:id/link", async (request, res) => {
    const req = request as Authed;
    requireThat(req.user.role !== "performer", "Access denied", 403);
    const b = await owned<Booking>(
      req.business.id,
      "bookings",
      String(req.params.id),
    );
    res.json({
      path: await store.transaction(async () => {
        const path = await issueLink(req.business.id, b.id);
        await store.audit(
          req.business.id,
          req.user.email,
          "event-link.rotated",
          b.id,
          null,
          null,
        );
        return path;
      }),
    });
  });
  async function editBooking(
    req: Authed,
    work: (booking: Booking) => Booking | Promise<Booking>,
    action: string,
  ) {
    const old = await owned<Booking>(
      req.business.id,
      "bookings",
      String(req.params.id),
    );
    requireThat(
      req.body.revision === old.revision,
      "Another change was saved. Refresh before editing.",
      409,
    );
    const next = await work(structuredClone(old));
    next.revision++;
    next.updatedAt = new Date().toISOString();
    return await writeRecord(req, "bookings", next, action);
  }
  writes.put("/api/manage/bookings/:id/details", async (request, res) => {
    const req = request as Authed;
    requireThat(req.user.role !== "performer", "Access denied", 403);
    const input = eventSchema
      .extend({
        packageIds: z.array(short.min(1)).max(12),
        customerId: short.min(1).optional(),
        travel: z.number().int().min(0).max(1440),
        breakMinutes: z.number().int().min(0).max(120),
        venueNotes: z.string().max(5000),
        backupPerformerIds: z.array(short).max(30),
        checklist: z
          .array(z.object({ text: short.min(1), done: z.boolean() }))
          .max(100),
      })
      .parse(req.body);
    if (input.customerId)
      await owned(req.business.id, "customers", input.customerId);
    await validateSelection(
      req.business.id,
      input.packageIds,
      input.performerIds,
    );
    await Promise.all(
      input.backupPerformerIds.map(
        async (p) => await owned(req.business.id, "performers", p),
      ),
    );
    validEventDate(req.business, input, false);
    const before = await owned<Booking>(req.business.id, "bookings", String(req.params.id));
    if (req.user.role === "sales") {
      requireThat(input.surpriseDetails === undefined, "Private surprise plans are managed by the owner or manager.", 403);
      requireThat(JSON.stringify(input.performerIds) === JSON.stringify(before.performerIds) && JSON.stringify(input.backupPerformerIds) === JSON.stringify(before.backupPerformerIds), "Artist assignments are managed by the owner or manager.", 403);
      requireThat(JSON.stringify(input.checklist) === JSON.stringify(before.checklist), "Preparation checklists are managed by the event team.", 403);
      input.surpriseDetails = before.surpriseDetails;
    }
    const saved = await editBooking(
        req,
        async (b) => {
          requireThat(
            !["completed", "cancelled"].includes(b.status),
            "Closed bookings retain their event history.",
          );
          requireThat(input.packageIds.length > 0 || !!b.requestedServices?.length, "Choose at least one show.");
          const paidArtists = (await store.all<MoneyEntry>(req.business.id, "money"))
            .filter((entry) => entry.bookingId === b.id && entry.performerId && entry.kind === "expense")
            .map((entry) => entry.performerId!);
          requireThat(paidArtists.every((performerId) => input.performerIds.includes(performerId)), "Keep artists with recorded payments on the event. Correct the payments first.");
          const scheduleChanged =
            b.travel !== input.travel ||
            b.breakMinutes !== input.breakMinutes ||
            b.date !== input.date ||
            b.time !== input.time ||
            b.location !== input.location ||
            JSON.stringify(b.performerIds) !==
              JSON.stringify(input.performerIds);
          const packageChanged =
            JSON.stringify(b.packageIds) !== JSON.stringify(input.packageIds);
          return {
            ...b,
            ...input,
            runningOrder: packageChanged ? undefined : b.runningOrder,
            packageSnapshot: packageChanged
              ? await Promise.all(
                  input.packageIds.map(
                    async (p) =>
                      await owned<Package>(req.business.id, "packages", p),
                  ),
                )
              : b.packageSnapshot,
            status: packageChanged
              ? "availability_pending"
              : b.status === "confirmed"
                ? "accepted"
                : b.status,
            quotes: packageChanged ? [] : b.quotes,
            acceptedQuoteId: packageChanged ? "" : b.acceptedQuoteId,
            availability: Object.fromEntries(
              input.performerIds.map((p) => [
                p,
                scheduleChanged || packageChanged
                  ? "pending"
                  : (b.availability[p] ?? "pending"),
              ]),
            ),
            availabilityResponses: scheduleChanged || packageChanged
              ? {}
              : Object.fromEntries(input.performerIds.flatMap((p) =>
                  b.availabilityResponses?.[p] ? [[p, b.availabilityResponses[p]]] : [],
                )),
            artistCompletion: scheduleChanged || packageChanged
              ? {}
              : Object.fromEntries(input.performerIds.flatMap((p) =>
                  b.artistCompletion?.[p] ? [[p, b.artistCompletion[p]]] : [],
                )),
          };
        },
        "details.updated-recheck-required",
      );
    const delivery = await eventNotice(store, req.business, saved, "updated", origin);
    res.json({ ...saved, delivery, priorStatus: before.status });
  });
  app.get("/api/manage/bookings/:id/act-plan", async (req, res) => {
    canManage(req);
    const b = await owned<Booking>(
      req.business.id,
      "bookings",
      String(req.params.id),
    );
    const plan = (await store.get<ActPlan>(req.business.id, "actPlans", b.id)) ?? {
        id: b.id,
        rows: [],
        notes: "",
      };
    res.json({
      plan: req.user.role === "accountant" ? { ...plan, notes: "" } : plan,
      revision: b.revision,
      shows: selectedPackages(
        b,
        await store.all<Package>(req.business.id, "packages"),
      ),
    });
  });
  writes.put("/api/manage/bookings/:id/act-plan", async (req, res) => {
    canManage(req);
    const input = z
      .object({
        rows: z
          .array(
            z.object({
              packageId: short.min(1),
              performerId: short.min(1),
              agreedPay: cents,
            }),
          )
          .max(30),
        notes: z.string().max(3000),
      })
      .parse(req.body);
    res.json(
      await store.transaction(async () => {
        const b = await owned<Booking>(
          req.business.id,
          "bookings",
          String(req.params.id),
        );
        requireThat(
          req.body.revision === b.revision,
          "Another change was saved. Refresh before editing.",
          409,
        );
        requireThat(
          ["accepted", "confirmed"].includes(b.status),
          "Staffing plans can be edited after quote acceptance and before closure.",
        );
        const shows = selectedPackages(
          b,
          await store.all<Package>(req.business.id, "packages"),
        );
        requireThat(
          new Set(input.rows.map((r) => r.packageId)).size ===
            input.rows.length,
          "Assign each show once.",
        );
        await Promise.all(
          input.rows.map(async (row) => {
            requireThat(
              shows.some((p) => p.id === row.packageId),
              "Choose an agreed show.",
            );
            requireThat(
              b.performerIds.includes(row.performerId),
              "Choose a performer already assigned to this event.",
            );
            await owned<Performer>(
              req.business.id,
              "performers",
              row.performerId,
            );
          }),
        );
        const before =
          (await store.get<ActPlan>(req.business.id, "actPlans", b.id)) ?? null;
        const payments = (await store.all<MoneyEntry>(req.business.id, "money"))
          .filter((entry) => entry.bookingId === b.id && entry.performerId && entry.kind === "expense");
        for (const performerId of new Set(payments.map((entry) => entry.performerId!))) {
          const paid = payments.filter((entry) => entry.performerId === performerId).reduce((sum, entry) => sum + entry.amount, 0);
          const agreed = input.rows.filter((row) => row.performerId === performerId).reduce((sum, row) => sum + row.agreedPay, 0);
          requireThat(agreed >= paid, "An artist's agreed fee cannot be lower than payments already recorded.");
        }
        const plan = { id: b.id, ...input };
        await store.put(req.business.id, "actPlans", plan);
        await store.audit(
          req.business.id,
          req.user.email,
          "staffing-plan.updated",
          b.id,
          before,
          plan,
        );
        const next: Booking = {
          ...b,
          revision: b.revision + 1,
          updatedAt: new Date().toISOString(),
          status: "accepted",
          availability: Object.fromEntries(
            b.performerIds.map((p) => [p, "pending" as const]),
          ),
          availabilityResponses: {},
          artistCompletion: {},
        };
        await store.put(req.business.id, "bookings", next);
        await store.audit(
          req.business.id,
          req.user.email,
          "bookings.staffing-plan.recheck-required",
          b.id,
          b,
          next,
        );
        return next;
      }),
    );
  });
  writes.put("/api/manage/bookings/:id/running-order", async (req, res) => {
    canManage(req);
    const input = z
      .object({
        runningOrder: z
          .array(
            z.object({
              packageId: short.min(1),
              breakAfter: z.number().int().min(0).max(120),
            }),
          )
          .min(1)
          .max(30),
        teardown: z.number().int().min(0).max(240),
      })
      .parse(req.body);
    res.json(
      await editBooking(
        req,
        async (b) => {
          requireThat(
            ["accepted", "confirmed"].includes(b.status),
            "Edit the running order after the customer accepts a quote.",
          );
          const chosen = selectedPackages(
            b,
            await store.all<Package>(req.business.id, "packages"),
          );
          const ids = input.runningOrder.map((row) => row.packageId);
          requireThat(
            ids.length === chosen.length &&
              new Set(ids).size === ids.length &&
              chosen.every((p) => ids.includes(p.id)),
            "Include each agreed show exactly once.",
          );
          requireThat(
            input.runningOrder.at(-1)!.breakAfter === 0,
            "The final show has no changeover; use pack-down time instead.",
          );
          return {
            ...b,
            ...input,
            status: "accepted",
            availability: Object.fromEntries(
              b.performerIds.map((p) => [p, "pending" as const]),
            ),
            availabilityResponses: {},
            artistCompletion: {},
          };
        },
        "running-order.updated-recheck-required",
      ),
    );
  });
  writes.put("/api/manage/bookings/:id/checklist", async (request, res) => {
    const req = request as Authed;
    const input = z
      .array(z.object({ text: short.min(1), done: z.boolean() }))
      .max(100)
      .parse(req.body.checklist);
    res.json(
      await editBooking(
        req,
        (b) => {
          if (req.user.role === "performer")
            requireThat(
              b.performerIds.includes(req.user.performerId ?? ""),
              "Access denied",
              403,
            );
          return { ...b, checklist: input };
        },
        "checklist.updated",
      ),
    );
  });
  writes.post("/api/manage/bookings/:id/availability", async (request, res) => {
    const req = request as Authed;
    const input = z
      .object({
        performerId: short,
        state: z.enum(["pending", "available", "declined"]),
      })
      .parse(req.body);
    res.json(
      await editBooking(
        req,
        (b) => {
          requireThat(
            b.performerIds.includes(input.performerId),
            "Performer is not assigned.",
          );
          if (req.user.role === "performer")
            requireThat(
              input.performerId === req.user.performerId,
              "Access denied",
              403,
            );
          if (req.user.role === "performer")
            requireThat(b.date >= DateTime.now().setZone(req.business.timezone).toISODate()!, "Past job responses are closed. Contact the organizer.", 409);
          requireThat(
            !["completed", "cancelled"].includes(b.status),
            "The event is closed.",
          );
          b.availability[input.performerId] = input.state;
          if (input.state === "pending") {
            delete b.availabilityResponses?.[input.performerId];
          } else {
            b.availabilityResponses ??= {};
            b.availabilityResponses[input.performerId] = {
              at: new Date().toISOString(),
              by: req.user.email,
            };
          }
          if (input.state !== "available") delete b.artistCompletion?.[input.performerId];
          if (b.status === "requested") b.status = "availability_pending";
          if (b.status === "confirmed" && input.state !== "available")
            b.status = "accepted";
          return b;
        },
        "availability.updated",
      ),
    );
  });
  writes.post("/api/manage/bookings/:id/artist-completion", async (request, res) => {
    const req = request as Authed;
    requireThat(req.user.role === "performer" && req.user.performerId, "Only the assigned artist can complete this job.", 403);
    const input = z.object({
      notes: z.string().max(3000).default(""),
      problems: z.string().max(3000).default(""),
      extraExpense: cents.max(10_000_000).default(0),
    }).parse(req.body);
    res.json(await editBooking(req, (b) => {
      const performerId = req.user.performerId!;
      requireThat(b.performerIds.includes(performerId), "This job is not assigned to you.", 403);
      requireThat(["confirmed", "completed"].includes(b.status), "The event is not confirmed.", 409);
      requireThat(b.date <= DateTime.now().setZone(req.business.timezone).toISODate()!, "Mark the job complete on or after the event date.", 409);
      requireThat(b.availability[performerId] === "available", "Confirm this job before completing it.", 409);
      requireThat(!b.artistCompletion?.[performerId], "This job was already completed.", 409);
      b.artistCompletion ??= {};
      b.artistCompletion[performerId] = { at: new Date().toISOString(), ...input };
      return b;
    }, "artist.job-completed"));
  });
  writes.post("/api/manage/bookings/:id/quotes", async (request, res) => {
    const req = request as Authed;
    canManage(req);
    const options = z
      .array(
        z
          .object({
            name: short.min(2),
            packageIds: z.array(short).min(1).max(12),
            amount: cents,
            deposit: cents,
            notes: z.string().max(3000),
          })
          .refine(
            (q) => q.deposit <= q.amount,
            "Deposit cannot exceed the total",
          ),
      )
      .min(1)
      .max(3)
      .parse(req.body.options);
    await Promise.all(
      options.map(
        async (q) => await validateSelection(req.business.id, q.packageIds, []),
      ),
    );
    res.json(
      await editBooking(
        req,
        async (b) => {
          requireThat(
            !["completed", "cancelled", "confirmed"].includes(b.status),
            "Reopen a confirmed booking by editing details before replacing its proposal.",
          );
          const previouslyPaid = totals(
            b,
            await store.all(req.business.id, "money"),
          ).paid;
          requireThat(
            options.every((q) => q.amount >= previouslyPaid),
            "Refund or correct collected payments before proposing a lower total.",
          );
          b.quotes = await Promise.all(
            options.map(
              async (q) =>
                ({
                  ...q,
                  id: id(),
                  packageSnapshot: await Promise.all(
                    q.packageIds.map(
                      async (p) =>
                        await owned<Package>(req.business.id, "packages", p),
                    ),
                  ),
                }) as Quote,
            ),
          );
          b.acceptedQuoteId = "";
          b.runningOrder = undefined;
          b.status = "quoted";
          return b;
        },
        "quotes.replaced",
      ),
    );
  });
  writes.post("/api/manage/bookings/:id/status", async (request, res) => {
    const req = request as Authed;
    canManage(req);
    const input = z
      .object({
        status: z.enum(["confirmed", "completed", "cancelled"]),
        reason: short.min(3),
        declined: z.boolean().optional(),
      })
      .parse(req.body);
    const saved = await editBooking(
        req,
        async (b) => {
          requireThat(
            !["completed", "cancelled"].includes(b.status),
            "This event is already closed.",
          );
          if (input.status === "confirmed") {
            const selected = b.quotes.find((q) => q.id === b.acceptedQuoteId);
            if (selected)
              await validateQuoteReward(store, req.business.id, b, selected);
            requireThat(
              b.status === "accepted",
              "The customer must accept a current quote first.",
            );
            requireThat(
              b.performerIds.length &&
                b.performerIds.every((p) => b.availability[p] === "available"),
              "All assigned performers must confirm availability.",
            );
            const packages = await store.all<Package>(
              req.business.id,
              "packages",
            );
            const issues = [
              ...compatibility(b, selectedPackages(b, packages)),
              ...conflicts(
                b,
                await store.all(req.business.id, "bookings"),
                packages,
                await store.all(req.business.id, "blocks"),
                req.business.timezone,
              ),
            ];
            requireThat(!issues.length, issues.join(" "), 409);
            validEventDate(req.business, b);
            b.checklist = preparationChecklist(b, selectedPackages(b, packages));
          }
          if (input.status === "completed") {
            requireThat(
              b.status === "confirmed",
              "Only a confirmed event can be completed.",
            );
            requireThat(
              DateTime.fromISO(`${b.date}T${b.time}`, {
                zone: req.business.timezone,
              }).toMillis() < Date.now(),
              "This event has not started yet.",
            );
          }
          b.status = input.status;
          if (input.status === "cancelled") b.declined = !!input.declined;
          await store.audit(
            req.business.id,
            req.user.email,
            "booking.status-reason",
            b.id,
            null,
            { reason: input.reason },
          );
          return b;
        },
        input.status,
      );
    const delivery = input.status === "completed" ? null : await eventNotice(store, req.business, saved, input.status === "cancelled" && input.declined ? "declined" : input.status, origin);
    res.json({ ...saved, delivery });
  });
  writes.post("/api/manage/bookings/:id/accept", async (request, res) => {
    const req = request as Authed;
    canManage(req);
    const input = z.object({
      revision: z.number().int().min(1),
      agreedAmount: cents,
      receivedAmount: cents,
      paymentTerms: short.min(3),
      reason: short.min(3),
    }).parse(req.body);
    requireThat(input.receivedAmount === 0 || canStaffAction(req.user.role, "money"), "Ask the owner or accountant to record received payments first.", 403);
    const old = await owned<Booking>(req.business.id, "bookings", String(req.params.id));
    requireThat(old.revision === input.revision, "This event changed. Refresh before accepting.", 409);
    requireThat(!["confirmed", "completed", "cancelled"].includes(old.status), "This event is already closed or confirmed.", 409);
    requireThat((old.packageIds.length === 0 || old.performerIds.length > 0) && old.performerIds.every((performerId) => old.availability[performerId] === "available"), "Confirm every assigned performer's availability first.", 409);
    const packages = await store.all<Package>(req.business.id, "packages");
    const issues = [
      ...compatibility(old, selectedPackages(old, packages)),
      ...conflicts(old, await store.all(req.business.id, "bookings"), packages, await store.all(req.business.id, "blocks"), req.business.timezone),
    ];
    requireThat(!issues.length, issues.join(" "), 409);
    validEventDate(req.business, old);
    const existingPaid = totals(old, await store.all(req.business.id, "money")).paid;
    requireThat(existingPaid + input.receivedAmount <= input.agreedAmount, "Received payments cannot exceed the agreed total.", 409);
    const next = structuredClone(old);
    const selected = next.quotes.find((quote) => quote.id === next.acceptedQuoteId);
    if (selected?.reward) requireThat(selected.amount === input.agreedAmount, "Edit the rewarded proposal before changing its amount.", 409);
    if (!selected || selected.amount !== input.agreedAmount) {
      const agreed: Quote = {
        id: id(), name: "Agreed event plan", packageIds: next.packageIds,
        amount: input.agreedAmount, deposit: input.receivedAmount,
        notes: input.paymentTerms, packageSnapshot: next.packageSnapshot,
      };
      next.quotes.push(agreed);
      next.acceptedQuoteId = agreed.id;
    }
    next.status = "confirmed";
    next.paymentTerms = input.paymentTerms;
    next.declined = false;
    next.revision++;
    next.updatedAt = new Date().toISOString();
    next.checklist = preparationChecklist(next, selectedPackages(next, packages));
    await store.transaction(async () => {
      const latest = await owned<Booking>(req.business.id, "bookings", old.id);
      requireThat(latest.revision === old.revision, "This event changed. Refresh before accepting.", 409);
      await store.put(req.business.id, "bookings", next);
      if (input.receivedAmount > 0) {
        const payment = { id: id(), bookingId: old.id, kind: "payment" as const, amount: input.receivedAmount, category: "acceptance", note: input.paymentTerms, date: DateTime.now().setZone(req.business.timezone).toISODate()! };
        await store.put(req.business.id, "money", payment);
        await store.audit(req.business.id, req.user.email, "money.recorded", payment.id, null, payment);
      }
      await store.audit(req.business.id, req.user.email, "booking.accepted-and-confirmed", old.id, old, { ...next, reason: input.reason });
    });
    const delivery = await eventNotice(store, req.business, next, "confirmed", origin);
    res.json({ booking: next, delivery });
  });
  app.get("/api/manage/bookings/:id/checks", async (request, res) => {
    const req = request as Authed;
    const b = await owned<Booking>(
      req.business.id,
      "bookings",
      String(req.params.id),
    );
    if (req.user.role === "performer")
      requireThat(
        b.performerIds.includes(req.user.performerId ?? ""),
        "Access denied",
        403,
      );
    const packages = await store.all<Package>(req.business.id, "packages");
    const issues = [
        ...compatibility(b, selectedPackages(b, packages)),
        ...conflicts(
          b,
          await store.all(req.business.id, "bookings"),
          packages,
          await store.all(req.business.id, "blocks"),
          req.business.timezone,
        ),
      ];
    res.json({
      issues: req.user.role === "performer"
        ? [...new Set(issues.map((issue) => issue.startsWith("Conflicts with ")
            ? "Scheduling conflict with another event. Contact the organizer."
            : issue))]
        : issues,
      timetable: timetable(b, packages, req.business.timezone),
      ...(req.user.role === "performer"
        ? {
            assignments: performerAssignments(
              b,
              packages,
              req.business.timezone,
              req.user.performerId ?? "",
              await store.get<ActPlan>(req.business.id, "actPlans", b.id),
            ),
          }
        : {}),
      ...(req.user.role !== "performer"
        ? { totals: totals(b, await store.all(req.business.id, "money")) }
        : {}),
    });
  });
  writes.post("/api/manage/money", async (request, res) => {
    const req = request as Authed;
    canManage(req);
    const input = z
      .object({
        bookingId: short,
        kind: z.enum(["payment", "refund", "expense"]),
        amount: cents.refine((n) => n > 0),
        category: short.min(1),
        note: short,
        date,
        performerId: short.optional(),
      })
      .parse(req.body);
    const booking = await owned<Booking>(
      req.business.id,
      "bookings",
      input.bookingId,
    );
    const balance = totals(booking, await store.all(req.business.id, "money"));
    if (input.performerId) {
      requireThat(input.kind === "expense", "Artist payments must be recorded as expenses.");
      requireThat(booking.performerIds.includes(input.performerId), "The artist is not assigned to this event.");
      const plan = await store.get<ActPlan>(req.business.id, "actPlans", booking.id);
      const agreed = plan?.rows.filter((r) => r.performerId === input.performerId).reduce((sum, r) => sum + r.agreedPay, 0) ?? 0;
      requireThat(agreed > 0, "Set the artist's agreed pay in the staffing plan first.");
      const recorded = (await store.all<MoneyEntry>(req.business.id, "money"))
        .filter((m) => m.bookingId === booking.id && m.performerId === input.performerId && m.kind === "expense")
        .reduce((sum, m) => sum + m.amount, 0);
      requireThat(recorded + input.amount <= agreed, "Artist payments cannot exceed the agreed fee.");
    }
    if (input.kind === "refund")
      requireThat(
        input.amount <= balance.paid,
        "Refund cannot exceed collected payments.",
      );
    if (input.kind === "payment") {
      requireThat(
        booking.acceptedQuoteId,
        "Record payments after a quote has been accepted.",
      );
      requireThat(
        input.amount <= balance.balance,
        "Payment exceeds the outstanding balance.",
      );
    }
    const result = await store.transaction(async () => {
      const entry = { ...input, id: id() };
      await store.put(req.business.id, "money", entry);
      await store.audit(
        req.business.id,
        req.user.email,
        "money.recorded",
        entry.id,
        null,
        entry,
      );
      if (
        input.kind === "refund" &&
        booking.status === "confirmed" &&
        balance.paid - input.amount < balance.deposit
      ) {
        const next = {
          ...booking,
          status: "accepted" as const,
          revision: booking.revision + 1,
        };
        await store.put(req.business.id, "bookings", next);
        await store.audit(
          req.business.id,
          req.user.email,
          "booking.deposit-recheck",
          booking.id,
          booking,
          next,
        );
      }
      return entry;
    });
    res.status(201).json(result);
  });
  writes.post("/api/manage/reviews/:id/moderate", async (request, res) => {
    const req = request as Authed;
    canManage(req);
    const input = z
      .object({ published: z.boolean(), reason: short.min(3) })
      .parse(req.body);
    const review = await owned<Review>(
      req.business.id,
      "reviews",
      String(req.params.id),
    );
    requireThat(
      !input.published || review.publishConsent,
      "The customer has not permitted publication.",
    );
    await writeRecord(
      req,
      "reviews",
      { ...review, published: input.published },
      `moderated: ${input.reason}`,
    );
    res.json({ ok: true });
  });
  writes.post("/api/manage/money/:id/correct", async (request, res) => {
    const req = request as Authed;
    canManage(req);
    const input = z
      .object({
        amount: cents,
        category: short.min(1),
        note: short,
        date,
        reason: short.min(3),
      })
      .parse(req.body);
    const old = await owned<MoneyEntry>(
      req.business.id,
      "money",
      String(req.params.id),
    );
    const booking = await owned<Booking>(
      req.business.id,
      "bookings",
      old.bookingId,
    );
    const corrected = {
      ...old,
      amount: input.amount,
      category: input.category,
      note: input.note,
      date: input.date,
    };
    const entries = (await store.all<MoneyEntry>(req.business.id, "money")).map(
      (m) => (m.id === old.id ? corrected : m),
    );
    if (old.performerId) {
      const plan = await store.get<ActPlan>(req.business.id, "actPlans", booking.id);
      const agreed = plan?.rows.filter((r) => r.performerId === old.performerId).reduce((sum, r) => sum + r.agreedPay, 0) ?? 0;
      const recorded = entries.filter((m) => m.bookingId === booking.id && m.performerId === old.performerId && m.kind === "expense").reduce((sum, m) => sum + m.amount, 0);
      requireThat(recorded <= agreed, "Artist payments cannot exceed the agreed fee.");
    }
    const t = totals(booking, entries);
    requireThat(t.paid >= 0, "Correction would make refunds exceed payments.");
    requireThat(t.paid <= t.agreed, "Correction would create an overpayment.");
    await store.transaction(async () => {
      await store.put(req.business.id, "money", corrected);
      await store.audit(
        req.business.id,
        req.user.email,
        `money.corrected: ${input.reason}`,
        old.id,
        old,
        corrected,
      );
      if (booking.status === "confirmed" && t.paid < t.deposit) {
        const next = {
          ...booking,
          status: "accepted" as const,
          revision: booking.revision + 1,
        };
        await store.put(req.business.id, "bookings", next);
        await store.audit(
          req.business.id,
          req.user.email,
          "booking.deposit-recheck",
          booking.id,
          booking,
          next,
        );
      }
    });
    res.json(corrected);
  });
  writes.post("/api/manage/import/customers", async (request, res) => {
    const req = request as Authed;
    canManage(req);
    const input = z
      .object({
        rows: z.array(customerSchema).min(1).max(500),
        commit: z.boolean(),
      })
      .parse(req.body);
    const existing = await store.all<Customer>(req.business.id, "customers");
    const seen = new Set(existing.map((c) => normalizePhone(c.phone)));
    const emails = new Set(
      existing.filter((c) => c.email).map((c) => c.email.toLowerCase()),
    );
    const rows = input.rows.map((c) => {
      const duplicate =
        seen.has(normalizePhone(c.phone)) ||
        (!!c.email && emails.has(c.email.toLowerCase()));
      seen.add(normalizePhone(c.phone));
      if (c.email) emails.add(c.email.toLowerCase());
      return { ...c, duplicate };
    });
    if (input.commit)
      await store.transaction(async () => {
        await Promise.all(
          rows
            .filter((c) => !c.duplicate)
            .map(async ({ duplicate: _, ...c }) => {
              void _;
              const customer = { ...c, id: id() };
              await store.put(req.business.id, "customers", customer);
              await store.audit(
                req.business.id,
                req.user.email,
                "customer.imported",
                customer.id,
                null,
                customer,
              );
            }),
        );
      });
    res.json({
      rows,
      added: input.commit ? rows.filter((c) => !c.duplicate).length : 0,
    });
  });
  app.get("/api/manage/export", async (request, res) => {
    const req = request as Authed;
    canManage(req);
    const data: Record<string, unknown> = {
      version: 1,
      exportedAt: new Date().toISOString(),
      business: req.business,
    };
    await Promise.all(
      [
        ...kinds,
        "audit",
        "rewardSettings",
        "rewardAwards",
        "customerExtras",
        "contactHistory",
        "actPlans",
        "customerMerges",
        "followupSettings",
        "followupRuns",
        "customFields",
      ].map(async (kind) => {
        data[kind] = await store.all(req.business.id, kind);
      }),
    );
    await store.audit(
      req.business.id,
      req.user.email,
      "business.exported",
      req.business.id,
      null,
      { at: data.exportedAt },
    );
    res
      .set(
        "Content-Disposition",
        'attachment; filename="magic-business-export.json"',
      )
      .json(data);
  });
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "Endpoint not found" }),
  );
  app.use(express.static(resolve("dist/public"), { index: false }));
  app.get("/manage.", (_req, res) => res.redirect(302, "/manage"));
  app.get(["/", "/b/:slug", "/manage", "/event"], (_req, res) =>
    res.sendFile(resolve("public/index.html")),
  );
  app.use(
    (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
      void _next;
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
        });
        return;
      }
      if (error instanceof Problem) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      if (error instanceof SyntaxError) {
        res.status(400).json({ error: "Invalid JSON request." });
        return;
      }
      console.error(
        error instanceof Error ? error.message : "Unexpected server error",
      );
      res
        .status(500)
        .json({ error: "Unable to save this change. Please try again." });
    },
  );
  return app;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const origin = applicationOrigin();
  if (process.env.NODE_ENV === "production" && !origin.startsWith("https://"))
    throw new Error("Production requires an HTTPS APP_ORIGIN.");
  const store = storeFromEnvironment();
  const server = createApp(store, origin).listen(
    Number(process.env.PORT ?? 3000),
    process.env.HOST ?? "127.0.0.1",
    () => console.log(`Magic App listening at ${origin}`),
  );
  const close = () =>
    server.close(() => {
      store.db.close();
      process.exit(0);
    });
  process.on("SIGINT", close);
  process.on("SIGTERM", close);
}

// Vercel imports the app; local commands and tests retain explicit setup.
export default process.env.VERCEL
  ? createApp(storeFromEnvironment(), applicationOrigin())
  : undefined;
