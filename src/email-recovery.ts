import type { Express } from "express";
import nodemailer from "nodemailer";
import { z } from "zod";
import { hash, token, passwordHash } from "./auth.js";
import { requireThat } from "./domain.js";
import type { Customer } from "./models.js";
import type { Store } from "./store.js";
import { writeRoutes } from "./write-routes.js";

export type ResetMailer = (email: string, link: string) => Promise<boolean>;
export const sendRecoveryEmail: ResetMailer = async (email, link) => {
  const sender = process.env.GMAIL_SENDER_EMAIL;
  const password = process.env.GMAIL_APP_PASSWORD;
  if (!sender || !password) return false;
  const transport = nodemailer.createTransport({
    host: "smtp.gmail.com", port: 465, secure: true,
    auth: { user: sender, pass: password },
    connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000,
  });
  try {
    await transport.sendMail({
      from: `Magic by Sam <${sender}>`, to: email,
      subject: "Reset your Magic App password",
      text: `You requested a new Magic App password. Open this private link to choose one:\n\n${link}\n\nThis link expires in 30 minutes and works once. If you did not request it, ignore this email. Your password has not changed.`,
    });
    return true;
  } catch { return false; }
  finally { transport.close(); }
};

interface Reset {
  id: string;
  accountId: string;
  kind: "customer" | "staff";
  fingerprint: string;
  issuedAt: number;
  expires: number;
}

export function emailRecovery(app: Express, store: Store, origin: string, mail: ResetMailer) {
  // Public routes are still covered by the global origin check and reset rate limits.
  app.post("/api/reset/request", async (req, res) => {
    const input = z.object({
      email: z.email().max(254).transform((value) => value.toLowerCase()),
      slug: z.string().max(100).optional(),
      username: z.string().trim().min(1).max(100).optional(),
    }).parse(req.body);
    const kind = input.slug ? "customer" : "staff";
    const business = input.slug ? await store.business(input.slug, true) : undefined;
    const account = kind === "staff"
      ? await store.db.prepare("SELECT * FROM users WHERE email=?").get(input.email)
      : business && input.username
        ? await store.db.prepare("SELECT * FROM customer_accounts WHERE business_id=? AND username=?").get(business.id, input.username.toLowerCase())
        : undefined;
    const customer = account && kind === "customer"
      ? await store.get<Customer>(String(account.business_id), "customers", String(account.customer_id)) : undefined;
    const email = kind === "staff" ? String(account?.email ?? "") : customer?.email?.toLowerCase() ?? "";
    if (account && email === input.email) {
      const businessId = String(account.business_id);
      const code = token();
      const reset: Reset = {
        id: hash(code), accountId: String(account.id), kind,
        fingerprint: hash(String(account.password) + ":" + email),
        issuedAt: Date.now(), expires: Date.now() + 30 * 60_000,
      };
      const issued = await store.transaction(async () => {
        const previous = (await store.all<Reset>(businessId, "emailResets"))
          .filter((item) => item.accountId === reset.accountId && item.kind === kind);
        if (previous.some((item) => item.issuedAt > Date.now() - 60_000)) return false;
        for (const item of previous)
          await store.db.prepare("DELETE FROM records WHERE business_id=? AND kind='emailResets' AND id=?").run(businessId, item.id);
        await store.put(businessId, "emailResets", reset);
        return true;
      });
      if (issued) {
        const path = kind === "staff" ? "/manage" : `/b/${encodeURIComponent(input.slug!)}`;
        // The token stays in the fragment: never sent in a page request or server log.
        let sent = false;
        try { sent = await mail(email, `${origin}${path}#password-reset=${code}`); } catch { /* Generic response below. */ }
        await store.transaction(async () => {
          if (!sent) await store.db.prepare("DELETE FROM records WHERE business_id=? AND kind='emailResets' AND id=?").run(businessId, reset.id);
          await store.audit(businessId, String(account.id), "account.recovery-email", String(account.id), null, { kind, delivery: sent ? "sent" : "unavailable" });
        });
      }
    }
    res.json({ message: "If these details match an account with an email address, a private reset link will be sent to that address. Check your inbox and spam folder. If it does not arrive, contact Sam for help." });
  });
  writeRoutes(app, store).post("/api/reset/complete", async (req, res) => {
    const input = z.object({ code: z.string().regex(/^[a-f0-9]{64}$/), password: z.string().min(7).max(200) }).parse(req.body);
    const row = await store.db.prepare("SELECT business_id,data FROM records WHERE kind='emailResets' AND id=?").get(hash(input.code));
    requireThat(row, "This reset link is invalid or expired. Request a new one.", 400);
    const reset: Reset | undefined = row && JSON.parse(String(row.data));
    requireThat(reset && reset.expires > Date.now(), "This reset link is invalid or expired. Request a new one.", 400);
    const table = reset.kind === "staff" ? "users" : "customer_accounts";
    const account = await store.db.prepare(`SELECT * FROM ${table} WHERE id=? AND business_id=?`).get(reset.accountId, String(row.business_id));
    const customer = account && reset.kind === "customer" ? await store.get<Customer>(String(row.business_id), "customers", String(account.customer_id)) : undefined;
    const email = reset.kind === "staff" ? String(account?.email ?? "") : customer?.email?.toLowerCase() ?? "";
    requireThat(account && reset.fingerprint === hash(String(account.password) + ":" + email), "This reset link is invalid or expired. Request a new one.", 400);
    await store.db.prepare(`UPDATE ${table} SET password=? WHERE id=? AND business_id=?`).run(await passwordHash(input.password), reset.accountId, String(row.business_id));
    await store.db.prepare(reset.kind === "staff" ? "DELETE FROM sessions WHERE user_id=?" : "DELETE FROM customer_sessions WHERE account_id=?").run(reset.accountId);
    if (reset.kind === "customer") await store.db.prepare("DELETE FROM customer_resets WHERE account_id=?").run(reset.accountId);
    await store.db.prepare("DELETE FROM records WHERE business_id=? AND kind='emailResets' AND id=?").run(String(row.business_id), reset.id);
    await store.audit(String(row.business_id), reset.accountId, "account.password-reset-email", reset.accountId, null, { kind: reset.kind, sessionsRevoked: true });
    res.clearCookie(reset.kind === "staff" ? "magic_session" : "magic_customer", { path: "/" }).json({ ok: true });
  });
}
