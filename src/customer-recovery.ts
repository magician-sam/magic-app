import type { Express, Request } from "express";
import { z } from "zod";
import { Store, id } from "./store.js";
import { hash, token, passwordHash } from "./auth.js";
import { requireThat, normalizePhone, short } from "./domain.js";
import type { Customer } from "./models.js";

export function customerRecovery(
  app: Express,
  store: Store,
  limited: (req: Request, key: string, max?: number) => void,
  canManage: (req: Request) => void,
) {
  store.db.exec(`CREATE TABLE IF NOT EXISTS customer_resets (
    id TEXT UNIQUE NOT NULL, account_id TEXT PRIMARY KEY REFERENCES customer_accounts(id),
    requested_at TEXT NOT NULL, code_hash TEXT, expires INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0);`);
  app.post("/api/customer/:slug/reset/request", (req, res) => {
    limited(req, "customer-reset-request", 5);
    const input = z
      .object({ username: short.min(1), phone: short.min(7) })
      .parse(req.body);
    const business = store.business(String(req.params.slug), true);
    const account =
      business &&
      store.db
        .prepare(
          "SELECT * FROM customer_accounts WHERE business_id=? AND username=?",
        )
        .get(business.id, input.username.toLowerCase());
    const customer =
      account &&
      store.get<Customer>(
        business!.id,
        "customers",
        String(account.customer_id),
      );
    if (
      customer &&
      normalizePhone(customer.phone) === normalizePhone(input.phone)
    ) {
      store.db
        .prepare(
          `INSERT INTO customer_resets(id,account_id,requested_at,code_hash,expires,used) VALUES(?,?,?,NULL,?,0)
        ON CONFLICT(account_id) DO UPDATE SET id=excluded.id,requested_at=excluded.requested_at,code_hash=NULL,expires=excluded.expires,used=0
        WHERE customer_resets.used=1 OR customer_resets.expires<?`,
        )
        .run(
          id(),
          String(account!.id),
          new Date().toISOString(),
          Date.now() + 86400_000,
          Date.now(),
        );
    }
    // Same response whether or not a customer exists. No messages are sent here.
    res.json({
      message:
        "If the details match an account, the team can review your request. Contact the business to verify your identity and receive a reset code. No automatic text message has been sent.",
    });
  });
  app.post("/api/customer/:slug/reset/complete", async (req, res) => {
    limited(req, "customer-reset-complete", 10);
    const input = z
      .object({
        username: short.min(1),
        code: z.string().trim().min(1).max(200),
        password: z.string().min(12).max(200),
      })
      .parse(req.body);
    const business = store.business(String(req.params.slug), true);
    const row =
      business &&
      store.db
        .prepare(
          `SELECT r.id,r.account_id,a.customer_id FROM customer_resets r JOIN customer_accounts a ON a.id=r.account_id
      WHERE a.business_id=? AND a.username=? AND r.code_hash=? AND r.used=0 AND r.expires>?`,
        )
        .get(
          business.id,
          input.username.toLowerCase(),
          hash(input.code),
          Date.now(),
        );
    requireThat(
      row,
      "Reset code is invalid or expired. Request a new one.",
      400,
    );
    const password = await passwordHash(input.password);
    store.transaction(() => {
      const changed = store.db
        .prepare(
          "UPDATE customer_resets SET used=1,code_hash=NULL WHERE id=? AND code_hash=? AND used=0 AND expires>?",
        )
        .run(String(row.id), hash(input.code), Date.now());
      requireThat(
        changed.changes === 1,
        "Reset code is invalid or expired. Request a new one.",
        400,
      );
      store.db
        .prepare("UPDATE customer_accounts SET password=? WHERE id=?")
        .run(password, String(row.account_id));
      store.db
        .prepare("DELETE FROM customer_sessions WHERE account_id=?")
        .run(String(row.account_id));
      store.audit(
        business!.id,
        String(row.account_id),
        "customer.password-reset",
        String(row.customer_id),
        null,
        { sessionsRevoked: true },
      );
    });
    res.clearCookie("magic_customer", { path: "/" }).json({ ok: true });
  });
  app.get("/api/manage/customer-resets", (req, res) => {
    canManage(req);
    const rows = store.db
      .prepare(
        `SELECT r.id,r.requested_at,r.code_hash,a.customer_id,a.username FROM customer_resets r JOIN customer_accounts a ON a.id=r.account_id
      WHERE a.business_id=? AND r.used=0 AND r.expires>? ORDER BY r.requested_at`,
      )
      .all(req.business.id, Date.now());
    res.json(
      rows.map((row) => {
        const c = store.get<Customer>(
          req.business.id,
          "customers",
          String(row.customer_id),
        );
        return {
          id: row.id,
          requestedAt: row.requested_at,
          username: row.username,
          name: c?.name ?? "Unavailable",
          phone: c?.phone ?? "",
          issued: !!row.code_hash,
        };
      }),
    );
  });
  app.post("/api/manage/customer-resets/:id/issue", (req, res) => {
    canManage(req);
    z.object({ identityVerified: z.literal(true) }).parse(req.body);
    const row = store.db
      .prepare(
        `SELECT r.id,a.customer_id FROM customer_resets r JOIN customer_accounts a ON a.id=r.account_id
      WHERE r.id=? AND a.business_id=? AND r.used=0 AND r.expires>?`,
      )
      .get(String(req.params.id), req.business.id, Date.now());
    requireThat(row, "Reset request not found or expired.", 404);
    const code = token();
    store.transaction(() => {
      store.db
        .prepare("UPDATE customer_resets SET code_hash=?,expires=? WHERE id=?")
        .run(hash(code), Date.now() + 30 * 60_000, String(row.id));
      store.audit(
        req.business.id,
        req.user.email,
        "customer.reset-code-issued",
        String(row.customer_id),
        null,
        { identityVerifiedByStaff: true, expiresInMinutes: 30 },
      );
    });
    res.json({ code, expiresInMinutes: 30 });
  });
}
