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
        connectSrc: ["'self'"],
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
      ["owner", "admin"].includes(req.user.role),
      "Only the business owner can perform this action.",
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
        photo: r.photoConsent ? r.photo : "",
      }));
    res.json({
      business,
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
      .object({ event: eventSchema, customAnswers: z.unknown().optional() })
      .parse(req.body);
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
        quotes,
        acceptedQuoteId,
        packageIds,
        performerIds,
        revision,
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
    });
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
  app.use("/api/manage", async (req, _res, next) => {
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
  app.get("/api/manage/reward-settings", async (req, res) => {
    canManage(req);
    res.json(await rewardSettings(store, req.business.id));
  });
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
    if (req.user.role === "performer") {
      const assigned = (await store.all<Booking>(bid, "bookings")).filter((b) =>
        b.performerIds.includes(req.user.performerId ?? ""),
      );
      result.bookings = assigned.map((b) => ({
        ...b,
        quotes: [],
        acceptedQuoteId: "",
        customerId: "",
        notes: "",
        backupPerformerIds: [],
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
    } else {
      result.audit = [];
      result.users = [];
      result.visits = [];
    }
    res.json(result);
  });
  writes.post("/api/manage/enquiries/:id/contacted", async (request, res) => {
    const req = request as Authed;
    requireThat(req.user.role !== "performer", "Not allowed to manage enquiries.", 403);
    const enquiry = await owned<ServiceEnquiry>(req.business.id, "enquiries", String(req.params.id));
    const next: ServiceEnquiry = { ...enquiry, status: "contacted" };
    res.json(await writeRecord(req, "enquiries", next, "contacted"));
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
  writes.post("/api/manage/users", async (request, res) => {
    const req = request as Authed;
    canManage(req);
    const input = z
      .object({
        name: short.min(2),
        email: z.email(),
        password: z.string().min(14).max(200),
        role: z.enum(["owner", "assistant", "performer"]),
        performerId: short.optional(),
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
        role: z.enum(["owner", "assistant", "performer", "admin"]),
        performerId: short.optional(),
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
    const next = { ...old, ...input, email: input.email.toLowerCase() };
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
    if (kind === "packages" && key === "new") {
      const bundle = saved as Package;
      if (bundle.active && bundle.bundleIds?.length) {
        await store.put(req.business.id, "bundleAnnouncements", {
          id: id(), packageId: bundle.id, title: bundle.name,
          description: bundle.description.slice(0, 180),
          at: new Date().toISOString(),
        });
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
    if (kind === "customers")
      requireThat(
        !(await store.db
          .prepare(
            "SELECT id FROM customer_accounts WHERE business_id=? AND customer_id=?",
          )
          .get(req.business.id, key)) &&
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
          ),
        "This customer has history. Edit their details or mark Do not contact instead.",
        409,
      );
    await store.transaction(async () => {
      if (["packages", "performers"].includes(kind))
        await store.put(req.business.id, kind, {
          ...before,
          id: key,
          active: false,
        });
      else
        await store.db
          .prepare(
            "DELETE FROM records WHERE business_id=? AND kind=? AND id=?",
          )
          .run(req.business.id, kind, key);
      await store.audit(
        req.business.id,
        req.user.email,
        `${kind}.removed`,
        key,
        before,
        null,
      );
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
    res.json(
      await editBooking(
        req,
        async (b) => {
          requireThat(
            !["completed", "cancelled"].includes(b.status),
            "Closed bookings retain their event history.",
          );
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
          };
        },
        "details.updated-recheck-required",
      ),
    );
  });
  app.get("/api/manage/bookings/:id/act-plan", async (req, res) => {
    canManage(req);
    const b = await owned<Booking>(
      req.business.id,
      "bookings",
      String(req.params.id),
    );
    res.json({
      plan: (await store.get<ActPlan>(req.business.id, "actPlans", b.id)) ?? {
        id: b.id,
        rows: [],
        notes: "",
      },
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
          requireThat(
            !["completed", "cancelled"].includes(b.status),
            "The event is closed.",
          );
          b.availability[input.performerId] = input.state;
          if (b.status === "requested") b.status = "availability_pending";
          if (b.status === "confirmed" && input.state !== "available")
            b.status = "accepted";
          return b;
        },
        "availability.updated",
      ),
    );
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
      })
      .parse(req.body);
    res.json(
      await editBooking(
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
            const money = totals(b, await store.all(req.business.id, "money"));
            requireThat(
              money.paid >= money.deposit,
              "The agreed deposit must be recorded first.",
            );
            validEventDate(req.business, b);
            if (!b.checklist.length)
              b.checklist = selectedPackages(b, packages).flatMap((p) =>
                p.checklist.map((text) => ({ text, done: false })),
              );
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
      ),
    );
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
    res.json({
      issues: [
        ...compatibility(b, selectedPackages(b, packages)),
        ...conflicts(
          b,
          await store.all(req.business.id, "bookings"),
          packages,
          await store.all(req.business.id, "blocks"),
          req.business.timezone,
        ),
      ],
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
      })
      .parse(req.body);
    const booking = await owned<Booking>(
      req.business.id,
      "bookings",
      input.bookingId,
    );
    const balance = totals(booking, await store.all(req.business.id, "money"));
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

