import { passwordHash, passwordMatches } from "./auth.js";
import type { Store } from "./store.js";
import { z } from "zod";

const recoveryId = "owner-recovery-2026-09-23";

export async function recoverOwner(
  store: Store,
  slug: string,
  newPassword?: string,
) {
  const business = await store.business(slug, true);
  if (!business) throw new Error("Recovery business was not found.");
  const users = await store.db
    .prepare("SELECT id,email,password,data FROM users WHERE business_id=?")
    .all(business.id);
  const admins = users.filter((row) => JSON.parse(String(row.data)).role === "admin");
  if (admins.length !== 1)
    throw new Error("Recovery requires exactly one administrator account.");
  const owner = admins[0]!;
  const email = String(owner.email);
  if (!newPassword) return { email, status: "needs-password" as const };

  const password = z.string().min(14).max(200).parse(newPassword);
  const marker = await store.get<{ id: string }>(business.id, "recovery", recoveryId);
  if (marker) return { email, status: "already-completed" as const };
  const nextHash = await passwordHash(password);
  await store.transaction(async () => {
    const existing = await store.get<{ id: string }>(business.id, "recovery", recoveryId);
    if (existing) return;
    await store.db.prepare("UPDATE users SET password=? WHERE id=?").run(nextHash, String(owner.id));
    await store.db.prepare("DELETE FROM sessions WHERE user_id=?").run(String(owner.id));
    await store.put(business.id, "recovery", {
      id: recoveryId,
      userId: String(owner.id),
      completedAt: new Date().toISOString(),
    });
    await store.audit(business.id, email, "user.password-recovered", String(owner.id), null, {
      recoveryId,
    });
  });
  const updated = await store.db.prepare("SELECT password FROM users WHERE id=?").get(String(owner.id));
  if (!updated || !(await passwordMatches(password, String(updated.password))))
    throw new Error("Password recovery could not be verified.");
  return { email, status: "completed" as const };
}
