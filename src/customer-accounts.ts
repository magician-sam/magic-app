import { writeRoutes } from "./write-routes.js";
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { Store, id } from "./store.js";
import { hash, token, passwordHash, passwordMatches } from "./auth.js";
import { customerSchema, requireThat, short } from "./domain.js";
import type { Booking, Customer } from "./models.js";
import { customerRewards, type CustomerExtras } from "./rewards.js";
import { rewardView, type RewardAward } from "./reward-ledger.js";
import { tokenWallet } from "./tokens.js";
import { referralCodeFor, resolveReferral } from "./referral-codes.js";

export function customerAccounts(
  app: Express,
  store: Store,
  origin: string,
  issueLink: (businessId: string, bookingId: string) => Promise<string>,
) {
  const writes = writeRoutes(app, store);
  const session = async (req: Request, businessId: string) => {
    const cookie = req.headers.cookie?.match(
      /(?:^|;\s*)magic_customer=([a-f0-9]{64})(?:;|$)/,
    )?.[1];
    const row =
      cookie &&
      (await store.db
        .prepare(
          `SELECT a.* FROM customer_sessions s JOIN customer_accounts a ON a.id=s.account_id WHERE s.hash=? AND s.expires>? AND a.business_id=?`,
        )
        .get(hash(cookie), Date.now(), businessId));
    requireThat(row, "Please sign in to your customer account.", 401);
    return {
      id: String(row.id),
      customerId: String(row.customer_id),
      username: String(row.username),
    };
  };
  const business = async (req: Request) => {
    const b = await store.business(String(req.params.slug), true);
    requireThat(b, "Business not found", 404);
    return b;
  };
  const signIn = async (res: Response, accountId: string) => {
    const value = token();
    await store.db
      .prepare("DELETE FROM customer_sessions WHERE expires<?")
      .run(Date.now());
    await store.db
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
  writes.post("/api/customer/:slug/register", async (req, res) => {
    const b = await business(req);
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
    const referrerId = await resolveReferral(store, b.id, input.referralCode);
    requireThat(
      referrerId !== null,
      "Referral code not found for this business.",
    );
    const password = await passwordHash(input.password);
    const accountId = id();
    const username = input.username ?? `guest-${token().slice(0, 12)}`;
    const customerId = id();
    await store.transaction(async () => {
      requireThat(
        !(await store.db
          .prepare(
            "SELECT id FROM customer_accounts WHERE business_id=? AND username=?",
          )
          .get(b.id, username)),
        "That username is already taken.",
        409,
      );
      // A supplied phone is not proof of ownership: never attach historical records by phone.
      await store.put(b.id, "customers", {
        ...customerSchema.parse(input),
        id: customerId,
      });
      await store.put<CustomerExtras>(b.id, "customerExtras", {
        id: customerId,
        childrenAges: [],
        referredBy: referrerId,
      });
      await store.db
        .prepare(
          "INSERT INTO customer_accounts(id,business_id,customer_id,username,password) VALUES(?,?,?,?,?)",
        )
        .run(accountId, b.id, customerId, username, password);
      await store.audit(
        b.id,
        accountId,
        "customer.registered",
        customerId,
        null,
        {
          username,
          phoneVerified: false,
        },
      );
    });
    await signIn(res, accountId);
    res.status(201).json({ username });
  });
  writes.post("/api/customer/:slug/login", async (req, res) => {
    const b = await business(req);
    const input = z
      .object({ username: short.min(1), password: z.string().min(1).max(200) })
      .parse(req.body);
    const row = await store.db
      .prepare(
        "SELECT * FROM customer_accounts WHERE business_id=? AND username=?",
      )
      .get(b.id, input.username.toLowerCase());
    const valid = await passwordMatches(
      input.password,
      row ? String(row.password) : `${"0".repeat(32)}:${"0".repeat(128)}`,
    );
    requireThat(row && valid, "Username or password is incorrect.", 401);
    await signIn(res, String(row.id));
    res.json({ ok: true });
  });
  writes.post("/api/customer/:slug/logout", async (req, res) => {
    const cookie = req.headers.cookie?.match(
      /(?:^|;\s*)magic_customer=([a-f0-9]{64})(?:;|$)/,
    )?.[1];
    if (cookie)
      await store.db
        .prepare("DELETE FROM customer_sessions WHERE hash=?")
        .run(hash(cookie));
    res.clearCookie("magic_customer", { path: "/" }).json({ ok: true });
  });
  app.get("/api/customer/:slug/me", async (req, res) => {
    const b = await business(req),
      account = await session(req, b.id);
    const c = await store.get<Customer>(b.id, "customers", account.customerId);
    requireThat(c, "Customer record unavailable", 404);
    res.json({
      username: account.username,
      referralCode: await referralCodeFor(store, b.id, account.id),
      rewards: {
        ...(await customerRewards(store, b.id, c)),
        tokens: await tokenWallet(store, b.id, c.id),
        awards: await Promise.all(
          (await store.all<RewardAward>(b.id, "rewardAwards"))
            .filter((a) => a.customerId === c.id)
            .map(async (a) => ({
              id: a.id,
              kind: a.kind,
              percent: a.percent,
              terms: a.settings.terms,
              status: (await rewardView(store, b.id, a)).status,
            })),
        ),
      },
      announcements: (await store.all<{
        id: string; packageId: string; title: string; description: string; at: string;
      }>(b.id, "bundleAnnouncements"))
        .filter((item) => item.at >= new Date(Date.now() - 30 * 86400_000).toISOString())
        .slice(-8).reverse(),
      profile: {
        name: c.name,
        phone: c.phone,
        email: c.email,
        phoneVerified: false,
        childrenAges:
          (await store.get<CustomerExtras>(b.id, "customerExtras", c.id))
            ?.childrenAges ?? [],
      },
      bookings: (await store.all<Booking>(b.id, "bookings"))
        .filter((x) => x.customerId === c.id)
        .map((x) => ({
          id: x.id,
          name: x.name,
          date: x.date,
          status: x.status,
        })),
    });
  });
  writes.put("/api/customer/:slug/profile", async (req, res) => {
    const b = await business(req),
      account = await session(req, b.id);
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
    const before = await store.get<Customer>(
      b.id,
      "customers",
      account.customerId,
    );
    requireThat(before, "Customer record unavailable", 404);
    const taken = await store.db
      .prepare(
        "SELECT id FROM customer_accounts WHERE business_id=? AND username=? AND id<>?",
      )
      .get(b.id, input.username, account.id);
    requireThat(!taken, "That username is already taken.", 409);
    await store.transaction(async () => {
      const { username, childrenAges, ...contact } = input;
      await store.put(b.id, "customers", { ...before, ...contact });
      const extras = await store.get<CustomerExtras>(
        b.id,
        "customerExtras",
        before.id,
      );
      await store.put<CustomerExtras>(b.id, "customerExtras", {
        id: before.id,
        referredBy: extras?.referredBy ?? "",
        childrenAges,
      });
      await store.db
        .prepare("UPDATE customer_accounts SET username=? WHERE id=?")
        .run(username, account.id);
      await store.audit(
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
  writes.post("/api/customer/:slug/password", async (req, res) => {
    const b = await business(req),
      account = await session(req, b.id);
    const input = z
      .object({
        currentPassword: z.string().max(200),
        password: z.string().min(12).max(200),
      })
      .parse(req.body);
    const before = String(
      (await store.db
        .prepare("SELECT password FROM customer_accounts WHERE id=?")
        .get(account.id))!.password,
    );
    requireThat(
      await passwordMatches(input.currentPassword, before),
      "Current password is incorrect.",
      403,
    );
    const next = await passwordHash(input.password);
    await store.transaction(async () => {
      // Do not allow concurrent stale password changes to overwrite a newer one.
      const result = await store.db
        .prepare(
          "UPDATE customer_accounts SET password=? WHERE id=? AND password=?",
        )
        .run(next, account.id, before);
      requireThat(
        result.changes === 1,
        "Password changed elsewhere. Sign in again.",
        409,
      );
      await store.db
        .prepare("DELETE FROM customer_sessions WHERE account_id=?")
        .run(account.id);
      await store.db
        .prepare("DELETE FROM customer_resets WHERE account_id=?")
        .run(account.id);
      await store.audit(
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
  writes.post("/api/customer/:slug/bookings/:id/open", async (req, res) => {
    const b = await business(req),
      account = await session(req, b.id);
    const booking = await store.get<Booking>(
      b.id,
      "bookings",
      String(req.params.id),
    );
    requireThat(
      booking && booking.customerId === account.customerId,
      "Event not found",
      404,
    );
    const path = await store.transaction(async () => {
      const path = await issueLink(b.id, booking.id);
      await store.audit(
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
