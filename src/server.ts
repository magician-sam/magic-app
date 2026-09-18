import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import helmet from "helmet";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { DateTime } from "luxon";
import { z } from "zod";
import { Store, id } from "./store.js";
import { customerAccounts } from "./customer-accounts.js";
import { customerRecovery } from "./customer-recovery.js";
import { rewardSettings, rewardSchema } from "./rewards.js";
import {
  customFieldSchema,
  customAnswers,
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
  app.disable("x-powered-by");
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", "https:", "data:"],
          connectSrc: ["'self'"],
          frameSrc: ["'none'"],
          formAction: ["'self'"],
          upgradeInsecureRequests: origin.startsWith("https:") ? [] : null,
        },
      },
      referrerPolicy: { policy: "no-referrer" },
    }),
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
  const limits = new Map<string, { count: number; until: number }>();
  function limited(req: Request, key: string, max = 30) {
    const now = Date.now();
    if (limits.size > 10000)
      for (const [key, value] of limits)
        if (value.until < now) limits.delete(key);
    const k = `${key}:${req.ip}`;
    const state = limits.get(k);
    if (!state || state.until < now)
      limits.set(k, { count: 1, until: now + 15 * 60_000 });
    else {
      requireThat(
        state.count < max,
        "Too many attempts. Try again in 15 minutes.",
        429,
      );
      state.count++;
    }
  }
  const owned = <T>(businessId: string, kind: string, key: string) => {
    const value = store.get<T>(businessId, kind, key);
    requireThat(value, "Record not found", 404);
    return value;
  };
  function businessBySlug(slug: string) {
    const business = store.business(slug, true);
    requireThat(business, "Business not found", 404);
    return business;
  }
  function writeRecord<T extends { id: string }>(
    req: Authed,
    kind: string,
    record: T,
    action = "updated",
  ) {
    return store.transaction(() => {
      const before = store.get(req.business.id, kind, record.id);
      store.put(req.business.id, kind, record);
      store.audit(
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
  function validateSelection(
    businessId: string,
    packageIds: string[],
    performerIds: string[],
  ) {
    requireThat(
      new Set(packageIds).size === packageIds.length,
      "Choose each package once.",
    );
    requireThat(
      new Set(performerIds).size === performerIds.length,
      "Choose each performer once.",
    );
    packageIds.forEach((key) =>
      requireThat(
        owned<Package>(businessId, "packages", key).active,
        "A selected package is unavailable.",
      ),
    );
    performerIds.forEach((key) =>
      requireThat(
        owned<Performer>(businessId, "performers", key).active,
        "A selected performer is unavailable.",
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
  function issueLink(businessId: string, bookingId: string) {
    const value = token();
    store.db
      .prepare("DELETE FROM links WHERE business_id=? AND booking_id=?")
      .run(businessId, bookingId);
    store.db
      .prepare(
        "INSERT INTO links(hash,business_id,booking_id,expires) VALUES(?,?,?,?)",
      )
      .run(hash(value), businessId, bookingId, Date.now() + 180 * 86400_000);
    return `/event#${value}`;
  }
  function eventAccess(req: Request) {
    const value = req.headers["x-event-token"];
    requireThat(
      typeof value === "string" && value.length === 64,
      "Event link is missing or expired.",
      404,
    );
    const row = store.db
      .prepare("SELECT * FROM links WHERE hash=? AND expires>?")
      .get(hash(value), Date.now());
    requireThat(row, "Event link is missing or expired.", 404);
    return {
      business: store.business(String(row.business_id))!,
      booking: owned<Booking>(
        String(row.business_id),
        "bookings",
        String(row.booking_id),
      ),
    };
  }
  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.get("/api/default-business", (_req, res) => {
    const row = store.db
      .prepare("SELECT slug FROM businesses ORDER BY rowid LIMIT 1")
      .get();
    requireThat(row, "The business has not been set up yet.", 503);
    res.json({ slug: String(row.slug) });
  });
  app.post("/api/login", async (req, res) => {
    limited(req, "login", 10);
    const data = z
      .object({ email: z.email(), password: z.string().min(1).max(200) })
      .parse(req.body);
    const row = store.db
      .prepare("SELECT * FROM users WHERE email=?")
      .get(data.email.toLowerCase());
    // A real scrypt even for unknown users reduces account enumeration through timing.
    const valid = await passwordMatches(
      data.password,
      row ? String(row.password) : `${"0".repeat(32)}:${"0".repeat(128)}`,
    );
    requireThat(row && valid, "Email or password is incorrect.", 401);
    const value = token();
    store.db.prepare("DELETE FROM sessions WHERE expires<?").run(Date.now());
    store.db
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
  app.post("/api/logout", (req, res) => {
    const cookie = req.headers.cookie?.match(
      /(?:^|;\s*)magic_session=([a-f0-9]{64})(?:;|$)/,
    )?.[1];
    if (cookie)
      store.db.prepare("DELETE FROM sessions WHERE hash=?").run(hash(cookie));
    res.clearCookie("magic_session", { path: "/" }).json({ ok: true });
  });
  app.get("/api/public/:slug", (req, res) => {
    const business = businessBySlug(String(req.params.slug));
    const reviews = store
      .all<Review>(business.id, "reviews")
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
      packages: store
        .all<Package>(business.id, "packages")
        .filter((p) => p.active),
      performers: store
        .all<Performer>(business.id, "performers")
        .filter((p) => p.active),
      reviews,
      customFields: store
        .all<CustomField>(business.id, "customFields")
        .filter((f) => f.active),
    });
  });
  app.post("/api/public/:slug/visit", (req, res) => {
    limited(req, "visit", 100);
    const business = businessBySlug(String(req.params.slug));
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
    store.db
      .prepare(
        "INSERT INTO visits(business_id,source,day,count) VALUES(?,?,?,1) ON CONFLICT(business_id,source,day) DO UPDATE SET count=count+1",
      )
      .run(business.id, source, new Date().toISOString().slice(0, 10));
    res.json({ ok: true });
  });
  const customerSession = customerAccounts(
    app,
    store,
    origin,
    limited,
    issueLink,
  );
  app.post("/api/public/:slug/requests", (req, res) => {
    limited(req, "request", 20);
    const business = businessBySlug(String(req.params.slug));
    const account = customerSession(req, business.id);
    const input = z
      .object({ event: eventSchema, customAnswers: z.unknown().optional() })
      .parse(req.body);
    validateSelection(
      business.id,
      input.event.packageIds,
      input.event.performerIds,
    );
    validEventDate(business, input.event);
    const answers = customAnswers(
      store.all<CustomField>(business.id, "customFields"),
      input.customAnswers,
    );
    const result = store.transaction(() => {
      const customer = owned<Customer>(
        business.id,
        "customers",
        account.customerId,
      );
      const now = new Date().toISOString();
      const booking: Booking = {
        customAnswers: answers,
        ...input.event,
        packageSnapshot: input.event.packageIds.map((p) =>
          owned<Package>(business.id, "packages", p),
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
      store.put(business.id, "bookings", booking);
      store.audit(
        business.id,
        "customer",
        "booking.requested",
        booking.id,
        null,
        booking,
      );
      return {
        id: booking.id,
        path: issueLink(business.id, booking.id),
        status: booking.status,
      };
    });
    res.status(201).json(result);
  });
  app.get("/api/event", (req, res) => {
    const { business, booking } = eventAccess(req);
    const packages = [
      ...new Map(
        [
          ...store
            .all<Package>(business.id, "packages")
            .filter(
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
      performers: store
        .all<Performer>(business.id, "performers")
        .filter((p) => performerIds.includes(p.id)),
      totals: ((t) => ({
        agreed: t.agreed,
        paid: t.paid,
        balance: t.balance,
        deposit: t.deposit,
      }))(totals(booking, store.all(business.id, "money"))),
      timetable: timetable(booking, packages, business.timezone),
      reviewed: store
        .all<Review>(business.id, "reviews")
        .filter((r) => r.bookingId === id)
        .map((r) => r.performerId),
    });
  });
  app.post("/api/event/accept", (req, res) => {
    const { business, booking } = eventAccess(req);
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
    store.transaction(() => {
      store.put(business.id, "bookings", next);
      store.audit(
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
  app.post("/api/event/details", (req, res) => {
    const { business, booking } = eventAccess(req);
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
    store.transaction(() => {
      store.put(business.id, "bookings", next);
      store.audit(
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
  app.post("/api/event/reviews", (req, res) => {
    const { business, booking } = eventAccess(req);
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
      !store
        .all<Review>(business.id, "reviews")
        .some(
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
    store.transaction(() => {
      store.put(business.id, "reviews", review);
      store.audit(
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
  app.use("/api/manage", (req, _res, next) => {
    try {
      const cookie = req.headers.cookie?.match(
        /(?:^|;\s*)magic_session=([a-f0-9]{64})(?:;|$)/,
      )?.[1];
      requireThat(cookie, "Please sign in.", 401);
      const row = store.db
        .prepare(
          "SELECT u.data FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.hash=? AND s.expires>?",
        )
        .get(hash(cookie), Date.now());
      requireThat(row, "Please sign in.", 401);
      const user = JSON.parse(String(row.data)) as User;
      const target = req.headers["x-support-business"];
      let business = store.business(user.businessId)!;
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
        business = store.business(target)!;
        requireThat(business, "Business not found", 404);
        store.audit(
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
  app.get("/api/manage/reward-settings", (req, res) => {
    canManage(req);
    res.json(rewardSettings(store, req.business.id));
  });
  customerRecovery(app, store, limited, canManage);
  app.put("/api/manage/bookings/:id/custom-answers", (req, res) => {
    canManage(req);
    const booking = owned<Booking>(
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
      writeRecord(
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
  app.get("/api/manage/custom-fields", (req, res) => {
    canManage(req);
    res.json(store.all(req.business.id, "customFields"));
  });
  app.post("/api/manage/custom-fields", (req, res) => {
    canManage(req);
    const input = customFieldSchema.parse(req.body);
    requireThat(
      store.get(req.business.id, "customFields", input.id) ||
        store.all(req.business.id, "customFields").length < 50,
      "Maximum 50 questions. Edit an existing question.",
    );
    res.json(writeRecord(req, "customFields", input));
  });
  app.put("/api/manage/reward-settings", (req, res) => {
    canManage(req);
    res.json(
      writeRecord(req, "rewardSettings", {
        ...rewardSchema.parse(req.body),
        id: "program",
      }),
    );
  });
  app.get("/api/manage/state", (request, res) => {
    const req = request as Authed;
    const bid = req.business.id;
    const result: Record<string, unknown> = {
      business: req.business,
      user: req.user,
    };
    kinds.forEach((kind) => {
      result[kind] = store.all(bid, kind);
    });
    if (req.user.role === "performer") {
      const assigned = store
        .all<Booking>(bid, "bookings")
        .filter((b) => b.performerIds.includes(req.user.performerId ?? ""));
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
      result.blocks = store
        .all<AvailabilityBlock>(bid, "blocks")
        .filter((b) => b.performerId === req.user.performerId);
    }
    if (["owner", "admin"].includes(req.user.role)) {
      result.audit = store.all(bid, "audit").slice(-200).reverse();
      result.users = store.db
        .prepare("SELECT data FROM users WHERE business_id=?")
        .all(bid)
        .map((row) => JSON.parse(String(row.data)));
      result.visits = store.db
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
  app.put("/api/manage/business", (request, res) => {
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
      })
      .parse(req.body);
    const next = { ...req.business, ...value };
    store.transaction(() => {
      store.db
        .prepare("UPDATE businesses SET data=? WHERE id=?")
        .run(JSON.stringify(next), req.business.id);
      store.audit(
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
  app.post("/api/manage/users", async (request, res) => {
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
          store.get(req.business.id, "performers", input.performerId),
        "Choose an existing performer.",
      );
    requireThat(
      !store.db
        .prepare("SELECT id FROM users WHERE email=?")
        .get(input.email.toLowerCase()),
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
    store.audit(
      req.business.id,
      req.user.email,
      "user.created",
      user.id,
      null,
      user,
    );
    res.status(201).json(user);
  });
  app.post("/api/manage/password", async (req, res) => {
    const input = z
      .object({
        currentPassword: z.string().max(200),
        newPassword: z.string().min(14).max(200),
      })
      .parse(req.body);
    limited(req, "password", 10);
    const row = store.db
      .prepare("SELECT password FROM users WHERE id=?")
      .get(req.user.id)!;
    requireThat(
      await passwordMatches(input.currentPassword, String(row.password)),
      "Current password is incorrect.",
      400,
    );
    const next = await passwordHash(input.newPassword);
    store.transaction(() => {
      store.db
        .prepare("UPDATE users SET password=? WHERE id=?")
        .run(next, req.user.id);
      store.db.prepare("DELETE FROM sessions WHERE user_id=?").run(req.user.id);
      store.audit(
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
  app.put("/api/manage/users/:id", (req, res) => {
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
    const row = store.db
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
      !store.db
        .prepare("SELECT id FROM users WHERE email=? AND id<>?")
        .get(input.email.toLowerCase(), key),
      "Email already has an account.",
      409,
    );
    if (input.role === "performer")
      requireThat(
        input.performerId &&
          store.get(req.business.id, "performers", input.performerId),
        "Choose a performer profile.",
      );
    const next = { ...old, ...input, email: input.email.toLowerCase() };
    store.transaction(() => {
      store.db
        .prepare("UPDATE users SET email=?,data=? WHERE id=?")
        .run(next.email, JSON.stringify(next), key);
      store.db.prepare("DELETE FROM sessions WHERE user_id=?").run(key);
      store.audit(
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
  app.delete("/api/manage/users/:id", (request, res) => {
    const req = request as Authed;
    canManage(req);
    const key = String(req.params.id);
    requireThat(key !== req.user.id, "You cannot remove your own access.");
    const row = store.db
      .prepare("SELECT data FROM users WHERE id=? AND business_id=?")
      .get(key, req.business.id);
    requireThat(row, "User not found", 404);
    requireThat(
      (JSON.parse(String(row.data)) as User).role !== "admin",
      "Platform administrator removal requires an operational account recovery process.",
    );
    store.transaction(() => {
      store.db.prepare("DELETE FROM sessions WHERE user_id=?").run(key);
      store.db.prepare("DELETE FROM users WHERE id=?").run(key);
      store.audit(
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
  app.post("/api/manage/businesses", async (request, res) => {
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
      !store.business(value.slug, true),
      "This public address is in use.",
      409,
    );
    requireThat(
      !store.db
        .prepare("SELECT id FROM users WHERE email=?")
        .get(value.email.toLowerCase()),
      "This email already has an account.",
      409,
    );
    const passwordValue = await passwordHash(value.password);
    const business = store.transaction(() => {
      const business = store.createBusiness(
        value.name,
        value.slug,
        value.timezone,
      );
      insertUser(store, business.id, value.email, passwordValue, value.name);
      store.audit(
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
  app.get("/api/manage/businesses", (request, res) => {
    const req = request as Authed;
    requireThat(
      req.user.role === "admin",
      "Administrator access required.",
      403,
    );
    res.json(store.db.prepare("SELECT id,slug FROM businesses").all());
  });
  app.put("/api/manage/:kind/:id", (request, res, next) => {
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
    if (key !== "new") owned(req.business.id, kind, key);
    if (["packages", "performers", "referrals"].includes(kind)) canManage(req);
    else
      requireThat(
        req.user.role !== "performer" || kind === "blocks",
        "Access denied",
        403,
      );
    let value: object;
    if (kind === "packages") {
      value = packageSchema.parse(req.body);
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
        })
        .parse(req.body);
      if (v.customerId) owned(req.business.id, "customers", v.customerId);
      if (v.bookingId) owned(req.business.id, "bookings", v.bookingId);
      value = v;
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
      owned(req.business.id, "performers", v.performerId);
      if (req.user.role === "performer") {
        requireThat(
          v.performerId === req.user.performerId,
          "Access denied",
          403,
        );
        if (key !== "new")
          requireThat(
            owned<AvailabilityBlock>(req.business.id, kind, key).performerId ===
              req.user.performerId,
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
      owned(req.business.id, "bookings", v.bookingId);
      owned(req.business.id, "performers", v.performerId);
      value = v;
    }
    res.json(writeRecord(req, kind, { ...value, id: recordId }));
  });
  app.delete("/api/manage/:kind/:id", (request, res) => {
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
    const before = owned<Record<string, unknown>>(req.business.id, kind, key);
    const bookings = store.all<Booking>(req.business.id, "bookings");
    if (kind === "customers")
      requireThat(
        !store.db
          .prepare(
            "SELECT id FROM customer_accounts WHERE business_id=? AND customer_id=?",
          )
          .get(req.business.id, key) &&
          !bookings.some((b) => b.customerId === key) &&
          !store
            .all<Reminder>(req.business.id, "reminders")
            .some((r) => r.customerId === key),
        "This customer has history. Edit their details or mark Do not contact instead.",
        409,
      );
    store.transaction(() => {
      if (["packages", "performers"].includes(kind))
        store.put(req.business.id, kind, { ...before, id: key, active: false });
      else
        store.db
          .prepare(
            "DELETE FROM records WHERE business_id=? AND kind=? AND id=?",
          )
          .run(req.business.id, kind, key);
      store.audit(
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
  app.post("/api/manage/bookings/:id/link", (request, res) => {
    const req = request as Authed;
    requireThat(req.user.role !== "performer", "Access denied", 403);
    const b = owned<Booking>(
      req.business.id,
      "bookings",
      String(req.params.id),
    );
    res.json({
      path: store.transaction(() => {
        const path = issueLink(req.business.id, b.id);
        store.audit(
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
  function editBooking(
    req: Authed,
    work: (booking: Booking) => Booking,
    action: string,
  ) {
    const old = owned<Booking>(
      req.business.id,
      "bookings",
      String(req.params.id),
    );
    requireThat(
      req.body.revision === old.revision,
      "Another change was saved. Refresh before editing.",
      409,
    );
    const next = work(structuredClone(old));
    next.revision++;
    next.updatedAt = new Date().toISOString();
    return writeRecord(req, "bookings", next, action);
  }
  app.put("/api/manage/bookings/:id/details", (request, res) => {
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
    if (input.customerId) owned(req.business.id, "customers", input.customerId);
    validateSelection(req.business.id, input.packageIds, input.performerIds);
    input.backupPerformerIds.forEach((p) =>
      owned(req.business.id, "performers", p),
    );
    validEventDate(req.business, input, false);
    res.json(
      editBooking(
        req,
        (b) => {
          requireThat(
            !["completed", "cancelled"].includes(b.status),
            "Closed bookings retain their event history.",
          );
          const scheduleChanged =
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
            packageSnapshot: packageChanged
              ? input.packageIds.map((p) =>
                  owned<Package>(req.business.id, "packages", p),
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
  app.put("/api/manage/bookings/:id/checklist", (request, res) => {
    const req = request as Authed;
    const input = z
      .array(z.object({ text: short.min(1), done: z.boolean() }))
      .max(100)
      .parse(req.body.checklist);
    res.json(
      editBooking(
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
  app.post("/api/manage/bookings/:id/availability", (request, res) => {
    const req = request as Authed;
    const input = z
      .object({
        performerId: short,
        state: z.enum(["pending", "available", "declined"]),
      })
      .parse(req.body);
    res.json(
      editBooking(
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
  app.post("/api/manage/bookings/:id/quotes", (request, res) => {
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
    options.forEach((q) =>
      validateSelection(req.business.id, q.packageIds, []),
    );
    res.json(
      editBooking(
        req,
        (b) => {
          requireThat(
            !["completed", "cancelled", "confirmed"].includes(b.status),
            "Reopen a confirmed booking by editing details before replacing its proposal.",
          );
          const previouslyPaid = totals(
            b,
            store.all(req.business.id, "money"),
          ).paid;
          requireThat(
            options.every((q) => q.amount >= previouslyPaid),
            "Refund or correct collected payments before proposing a lower total.",
          );
          b.quotes = options.map(
            (q) =>
              ({
                ...q,
                id: id(),
                packageSnapshot: q.packageIds.map((p) =>
                  owned<Package>(req.business.id, "packages", p),
                ),
              }) as Quote,
          );
          b.acceptedQuoteId = "";
          b.status = "quoted";
          return b;
        },
        "quotes.replaced",
      ),
    );
  });
  app.post("/api/manage/bookings/:id/status", (request, res) => {
    const req = request as Authed;
    canManage(req);
    const input = z
      .object({
        status: z.enum(["confirmed", "completed", "cancelled"]),
        reason: short.min(3),
      })
      .parse(req.body);
    res.json(
      editBooking(
        req,
        (b) => {
          requireThat(
            !["completed", "cancelled"].includes(b.status),
            "This event is already closed.",
          );
          if (input.status === "confirmed") {
            requireThat(
              b.status === "accepted",
              "The customer must accept a current quote first.",
            );
            requireThat(
              b.performerIds.length &&
                b.performerIds.every((p) => b.availability[p] === "available"),
              "All assigned performers must confirm availability.",
            );
            const packages = store.all<Package>(req.business.id, "packages");
            const issues = [
              ...compatibility(b, selectedPackages(b, packages)),
              ...conflicts(
                b,
                store.all(req.business.id, "bookings"),
                packages,
                store.all(req.business.id, "blocks"),
                req.business.timezone,
              ),
            ];
            requireThat(!issues.length, issues.join(" "), 409);
            const money = totals(b, store.all(req.business.id, "money"));
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
          store.audit(
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
  app.get("/api/manage/bookings/:id/checks", (request, res) => {
    const req = request as Authed;
    const b = owned<Booking>(
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
    const packages = store.all<Package>(req.business.id, "packages");
    res.json({
      issues: [
        ...compatibility(b, selectedPackages(b, packages)),
        ...conflicts(
          b,
          store.all(req.business.id, "bookings"),
          packages,
          store.all(req.business.id, "blocks"),
          req.business.timezone,
        ),
      ],
      timetable: timetable(b, packages, req.business.timezone),
      ...(req.user.role !== "performer"
        ? { totals: totals(b, store.all(req.business.id, "money")) }
        : {}),
    });
  });
  app.post("/api/manage/money", (request, res) => {
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
    const booking = owned<Booking>(
      req.business.id,
      "bookings",
      input.bookingId,
    );
    const balance = totals(booking, store.all(req.business.id, "money"));
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
    const result = store.transaction(() => {
      const entry = { ...input, id: id() };
      store.put(req.business.id, "money", entry);
      store.audit(
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
        store.put(req.business.id, "bookings", next);
        store.audit(
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
  app.post("/api/manage/reviews/:id/moderate", (request, res) => {
    const req = request as Authed;
    canManage(req);
    const input = z
      .object({ published: z.boolean(), reason: short.min(3) })
      .parse(req.body);
    const review = owned<Review>(
      req.business.id,
      "reviews",
      String(req.params.id),
    );
    requireThat(
      !input.published || review.publishConsent,
      "The customer has not permitted publication.",
    );
    writeRecord(
      req,
      "reviews",
      { ...review, published: input.published },
      `moderated: ${input.reason}`,
    );
    res.json({ ok: true });
  });
  app.post("/api/manage/money/:id/correct", (request, res) => {
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
    const old = owned<MoneyEntry>(
      req.business.id,
      "money",
      String(req.params.id),
    );
    const booking = owned<Booking>(req.business.id, "bookings", old.bookingId);
    const corrected = {
      ...old,
      amount: input.amount,
      category: input.category,
      note: input.note,
      date: input.date,
    };
    const entries = store
      .all<MoneyEntry>(req.business.id, "money")
      .map((m) => (m.id === old.id ? corrected : m));
    const t = totals(booking, entries);
    requireThat(t.paid >= 0, "Correction would make refunds exceed payments.");
    requireThat(t.paid <= t.agreed, "Correction would create an overpayment.");
    store.transaction(() => {
      store.put(req.business.id, "money", corrected);
      store.audit(
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
        store.put(req.business.id, "bookings", next);
        store.audit(
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
  app.post("/api/manage/import/customers", (request, res) => {
    const req = request as Authed;
    canManage(req);
    const input = z
      .object({
        rows: z.array(customerSchema).min(1).max(500),
        commit: z.boolean(),
      })
      .parse(req.body);
    const existing = store.all<Customer>(req.business.id, "customers");
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
      store.transaction(() => {
        rows
          .filter((c) => !c.duplicate)
          .forEach(({ duplicate: _, ...c }) => {
            void _;
            const customer = { ...c, id: id() };
            store.put(req.business.id, "customers", customer);
            store.audit(
              req.business.id,
              req.user.email,
              "customer.imported",
              customer.id,
              null,
              customer,
            );
          });
      });
    res.json({
      rows,
      added: input.commit ? rows.filter((c) => !c.duplicate).length : 0,
    });
  });
  app.get("/api/manage/export", (request, res) => {
    const req = request as Authed;
    canManage(req);
    const data: Record<string, unknown> = {
      version: 1,
      exportedAt: new Date().toISOString(),
      business: req.business,
    };
    [
      ...kinds,
      "audit",
      "rewardSettings",
      "customerExtras",
      "customFields",
    ].forEach((kind) => {
      data[kind] = store.all(req.business.id, kind);
    });
    store.audit(
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
    res.sendFile(resolve("dist/public/index.html")),
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
  const origin = process.env.APP_ORIGIN ?? "http://localhost:3000";
  if (process.env.NODE_ENV === "production" && !origin.startsWith("https://"))
    throw new Error("Production requires an HTTPS APP_ORIGIN.");
  const store = new Store(process.env.DATABASE_PATH ?? "./data/magic.sqlite");
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
