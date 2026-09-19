import type { Express, Request, Response } from "express";
import { z } from "zod";
import { Store, id } from "./store.js";
import { hash, token, passwordHash, passwordMatches } from "./auth.js";
import { customerSchema, requireThat, short } from "./domain.js";
import type { Booking, Customer } from "./models.js";
import { customerRewards, type CustomerExtras } from "./rewards.js";
import { rewardView, type RewardAward } from "./reward-ledger.js";

export function customerAccounts(
  app: Express,
  store: Store,
  origin: string,
  limited: (req: Request, key: string, max?: number) => void,
  issueLink: (businessId: string, bookingId: string) => string,
) {
  store.db.exec(`CREATE TABLE IF NOT EXISTS customer_accounts (
    id TEXT PRIMARY KEY, business_id TEXT NOT NULL REFERENCES businesses(id),
    customer_id TEXT NOT NULL, username TEXT NOT NULL, password TEXT NOT NULL,
    UNIQUE(business_id, username));
    CREATE TABLE IF NOT EXISTS customer_sessions (
    hash TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES customer_accounts(id), expires INTEGER NOT NULL);`);
  const session = (req: Request, businessId: string) => {
    const cookie = req.headers.cookie?.match(
      /(?:^|;\s*)magic_customer=([a-f0-9]{64})(?:;|$)/,
    )?.[1];
    const row =
      cookie &&
      store.db
        .prepare(
          `SELECT a.* FROM customer_sessions s JOIN customer_accounts a ON a.id=s.account_id WHERE s.hash=? AND s.expires>? AND a.business_id=?`,
        )
        .get(hash(cookie), Date.now(), businessId);
    requireThat(row, "Please sign in to your customer account.", 401);
    return {
      id: String(row.id),
      customerId: String(row.customer_id),
      username: String(row.username),
    };
  };
  const business = (req: Request) => {
    const b = store.business(String(req.params.slug), true);
    requireThat(b, "Business not found", 404);
    return b;
  };
  const signIn = (res: Response, accountId: string) => {
    const value = token();
    store.db
      .prepare("DELETE FROM customer_sessions WHERE expires<?")
      .run(Date.now());
    store.db
      .prepare(
        "INSERT INTO customer_sessions(hash,account_id,expires) VALUES(?,?,?)",
      )
      .run(hash(value), accountId, Date.now() + 8 * 3600_000);
    res.cookie("magic_customer", value, {
      httpOnly: true,
      sameSite: "strict",
      secure: origin.startsWith("https:"),
      maxAge: 8 * 3600_000,
      path: "/",
    });
  };
  app.post("/api/customer/:slug/register", async (req, res) => {
    limited(req, "customer-register", 10);
    const b = business(req);
    const input = customerSchema
      .pick({ name: true, phone: true, email: true })
      .extend({
        password: z.string().min(12).max(200),
        username: z
          .string()
          .trim()
          .toLowerCase()
          .regex(/^[a-z0-9][a-z0-9_-]{2,39}$/)
          .optional(),
        referralCode: z.string().max(64).default(""),
      })
      .parse(req.body);
    const referrer = input.referralCode
      ? store.db
          .prepare(
            "SELECT customer_id FROM customer_accounts WHERE business_id=? AND id=?",
          )
          .get(b.id, input.referralCode)
      : undefined;
    requireThat(
      !input.referralCode || referrer,
      "Referral code not found for this business.",
    );
    const password = await passwordHash(input.password);
    const accountId = id();
    const username = input.username ?? `guest-${token().slice(0, 12)}`;
    const customerId = id();
    store.transaction(() => {
      requireThat(
        !store.db
          .prepare(
            "SELECT id FROM customer_accounts WHERE business_id=? AND username=?",
          )
          .get(b.id, username),
        "That username is already taken.",
        409,
      );
      // A supplied phone is not proof of ownership: never attach historical records by phone.
      store.put(b.id, "customers", {
        ...customerSchema.parse(input),
        id: customerId,
      });
      store.put<CustomerExtras>(b.id, "customerExtras", {
        id: customerId,
        childrenAges: [],
        referredBy: referrer ? String(referrer.customer_id) : "",
      });
      store.db
        .prepare(
          "INSERT INTO customer_accounts(id,business_id,customer_id,username,password) VALUES(?,?,?,?,?)",
        )
        .run(accountId, b.id, customerId, username, password);
      store.audit(b.id, accountId, "customer.registered", customerId, null, {
        username,
        phoneVerified: false,
      });
    });
    signIn(res, accountId);
    res.status(201).json({ username });
  });
  app.post("/api/customer/:slug/login", async (req, res) => {
    limited(req, "customer-login", 10);
    const b = business(req);
    const input = z
      .object({ username: short.min(1), password: z.string().min(1).max(200) })
      .parse(req.body);
    const row = store.db
      .prepare(
        "SELECT * FROM customer_accounts WHERE business_id=? AND username=?",
      )
      .get(b.id, input.username.toLowerCase());
    const valid = await passwordMatches(
      input.password,
      row ? String(row.password) : `${"0".repeat(32)}:${"0".repeat(128)}`,
    );
    requireThat(row && valid, "Username or password is incorrect.", 401);
    signIn(res, String(row.id));
    res.json({ ok: true });
  });
  app.post("/api/customer/:slug/logout", (req, res) => {
    const cookie = req.headers.cookie?.match(
      /(?:^|;\s*)magic_customer=([a-f0-9]{64})(?:;|$)/,
    )?.[1];
    if (cookie)
      store.db
        .prepare("DELETE FROM customer_sessions WHERE hash=?")
        .run(hash(cookie));
    res.clearCookie("magic_customer", { path: "/" }).json({ ok: true });
  });
  app.get("/api/customer/:slug/me", (req, res) => {
    const b = business(req),
      account = session(req, b.id);
    const c = store.get<Customer>(b.id, "customers", account.customerId);
    requireThat(c, "Customer record unavailable", 404);
    res.json({
      username: account.username,
      referralCode: account.id,
      rewards: {
        ...customerRewards(store, b.id, c),
        awards: store
          .all<RewardAward>(b.id, "rewardAwards")
          .filter((a) => a.customerId === c.id)
          .map((a) => ({
            id: a.id,
            kind: a.kind,
            percent: a.percent,
            terms: a.settings.terms,
            status: rewardView(store, b.id, a).status,
          })),
      },
      profile: {
        name: c.name,
        phone: c.phone,
        email: c.email,
        phoneVerified: false,
        childrenAges:
          store.get<CustomerExtras>(b.id, "customerExtras", c.id)
            ?.childrenAges ?? [],
      },
      bookings: store
        .all<Booking>(b.id, "bookings")
        .filter((x) => x.customerId === c.id)
        .map((x) => ({
          id: x.id,
          name: x.name,
          date: x.date,
          status: x.status,
        })),
    });
  });
  app.put("/api/customer/:slug/profile", (req, res) => {
    const b = business(req),
      account = session(req, b.id);
    const input = customerSchema
      .pick({ name: true, phone: true, email: true })
      .extend({
        username: z
          .string()
          .trim()
          .toLowerCase()
          .regex(/^[a-z0-9][a-z0-9_-]{2,39}$/),
        childrenAges: z
          .array(z.number().int().min(0).max(25))
          .max(20)
          .default([]),
      })
      .parse(req.body);
    const before = store.get<Customer>(b.id, "customers", account.customerId);
    requireThat(before, "Customer record unavailable", 404);
    const taken = store.db
      .prepare(
        "SELECT id FROM customer_accounts WHERE business_id=? AND username=? AND id<>?",
      )
      .get(b.id, input.username, account.id);
    requireThat(!taken, "That username is already taken.", 409);
    store.transaction(() => {
      const { username, childrenAges, ...contact } = input;
      store.put(b.id, "customers", { ...before, ...contact });
      const extras = store.get<CustomerExtras>(
        b.id,
        "customerExtras",
        before.id,
      );
      store.put<CustomerExtras>(b.id, "customerExtras", {
        id: before.id,
        referredBy: extras?.referredBy ?? "",
        childrenAges,
      });
      store.db
        .prepare("UPDATE customer_accounts SET username=? WHERE id=?")
        .run(username, account.id);
      store.audit(
        b.id,
        account.id,
        "customer.profile-updated",
        before.id,
        {
          name: before.name,
          phone: before.phone,
          email: before.email,
          username: account.username,
          childrenAges: extras?.childrenAges ?? [],
        },
        input,
      );
    });
    res.json({ ok: true });
  });
  app.post("/api/customer/:slug/password", async (req, res) => {
    limited(req, "customer-password", 10);
    const b = business(req),
      account = session(req, b.id);
    const input = z
      .object({
        currentPassword: z.string().max(200),
        password: z.string().min(12).max(200),
      })
      .parse(req.body);
    const before = String(
      store.db
        .prepare("SELECT password FROM customer_accounts WHERE id=?")
        .get(account.id)!.password,
    );
    requireThat(
      await passwordMatches(input.currentPassword, before),
      "Current password is incorrect.",
      403,
    );
    const next = await passwordHash(input.password);
    store.transaction(() => {
      // Do not allow concurrent stale password changes to overwrite a newer one.
      const result = store.db
        .prepare(
          "UPDATE customer_accounts SET password=? WHERE id=? AND password=?",
        )
        .run(next, account.id, before);
      requireThat(
        result.changes === 1,
        "Password changed elsewhere. Sign in again.",
        409,
      );
      store.db
        .prepare("DELETE FROM customer_sessions WHERE account_id=?")
        .run(account.id);
      store.db
        .prepare("DELETE FROM customer_resets WHERE account_id=?")
        .run(account.id);
      store.audit(
        b.id,
        account.id,
        "customer.password-changed",
        account.customerId,
        null,
        { sessionsRevoked: true },
      );
    });
    res.clearCookie("magic_customer", { path: "/" }).json({ ok: true });
  });
  app.post("/api/customer/:slug/bookings/:id/open", (req, res) => {
    const b = business(req),
      account = session(req, b.id);
    const booking = store.get<Booking>(b.id, "bookings", String(req.params.id));
    requireThat(
      booking && booking.customerId === account.customerId,
      "Event not found",
      404,
    );
    const path = store.transaction(() => {
      const path = issueLink(b.id, booking.id);
      store.audit(
        b.id,
        account.id,
        "customer.event-link-rotated",
        booking.id,
        null,
        { previousLinkRevoked: true },
      );
      return path;
    });
    res.json({ path });
  });
  return session;
}
