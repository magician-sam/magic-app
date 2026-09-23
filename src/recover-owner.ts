import { storeFromEnvironment } from "./runtime.js";
import { recoverOwner } from "./owner-recovery.js";

if (process.env.VERCEL_ENV !== "production" || !process.env.MAGIC_TURSO_DATABASE_URL)
  throw new Error("Owner recovery runs only against the dedicated production database.");

const store = storeFromEnvironment();
try {
  const result = await recoverOwner(
    store,
    process.env.BUSINESS_SLUG || "magic-by-sam",
    process.env.OWNER_RECOVERY_PASSWORD,
  );
  console.log(`Owner login email: ${result.email}`);
  console.log(`Owner recovery: ${result.status}`);
} finally {
  store.db.close();
}
