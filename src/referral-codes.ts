import { randomBytes } from "node:crypto";
import type { Store } from "./store.js";

// Short codes are permanent aliases. Existing full account IDs remain valid.
export async function referralCodeFor(store: Store, businessId: string, accountId: string) {
  const existing = await store.db.prepare(
    "SELECT code FROM referral_codes WHERE business_id=? AND account_id=?",
  ).get(businessId, accountId);
  if (existing) return String(existing.code);
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomBytes(5).toString("hex").toUpperCase();
    await store.db.prepare(
      "INSERT OR IGNORE INTO referral_codes(code,business_id,account_id) VALUES(?,?,?)",
    ).run(code, businessId, accountId);
    const row = await store.db.prepare(
      "SELECT code FROM referral_codes WHERE business_id=? AND account_id=?",
    ).get(businessId, accountId);
    if (row) return String(row.code);
  }
  throw new Error("Could not create a unique referral code.");
}

export async function resolveReferral(store: Store, businessId: string, rawCode: string) {
  const code = rawCode.trim();
  if (!code) return "";
  const row = /^[a-f0-9]{10}$/i.test(code)
    ? await store.db.prepare(
        "SELECT a.customer_id FROM referral_codes r JOIN customer_accounts a ON a.id=r.account_id WHERE r.business_id=? AND r.code=?",
      ).get(businessId, code.toUpperCase())
    : /^[a-f0-9-]{36}$/i.test(code)
      ? await store.db.prepare(
          "SELECT customer_id FROM customer_accounts WHERE business_id=? AND id=?",
        ).get(businessId, code.toLowerCase())
      : null;
  return row ? String(row.customer_id) : null;
}
