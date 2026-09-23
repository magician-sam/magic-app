import { storeFromEnvironment } from "./runtime.js";
import { DateTime } from "luxon";
import { z } from "zod";
import { insertUser, passwordHash } from "./auth.js";
const store = storeFromEnvironment();
if (await store.db.prepare("SELECT id FROM users LIMIT 1").get()) {
  store.db.close();
  if (process.argv.includes("--if-empty")) {
    console.log(
      "Business setup already completed; existing records unchanged.",
    );
    process.exit(0);
  }
  throw new Error("Setup already completed; existing data was not changed.");
}
const email = z.email().parse(process.env.BOOTSTRAP_EMAIL);
const password = z
  .string()
  .min(14)
  .max(200)
  .parse(process.env.BOOTSTRAP_PASSWORD);
const timezone = process.env.BUSINESS_TIMEZONE ?? "Asia/Beirut";
if (!DateTime.now().setZone(timezone).isValid)
  throw new Error("Invalid business timezone");
const passwordValue = await passwordHash(password);
await store.transaction(async () => {
  const business = await store.createBusiness(
    process.env.BUSINESS_NAME ?? "Magic by Sam",
    z
      .string()
      .regex(/^[a-z0-9-]+$/)
      .parse(process.env.BUSINESS_SLUG ?? "magic-by-sam"),
    timezone,
  );
  business.logo = z
    .union([
      z.literal(""),
      z.literal("/sam-logo.png"),
      z.url().refine((value) => value.startsWith("https://")),
    ])
    .parse(process.env.BUSINESS_LOGO ?? "");
  business.otherShowNames = z
    .array(z.string().trim().min(1).max(80))
    .max(100)
    .parse(
      (process.env.BUSINESS_OTHER_SHOWS ?? "")
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean),
    );
  business.characterNames = z
    .array(z.string().trim().min(1).max(80))
    .max(100)
    .parse(
      (process.env.BUSINESS_CHARACTERS ?? "")
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean),
    );
  business.whatsapp = z
    .string()
    .regex(/^\+?[0-9]{7,16}$|^$/)
    .parse(process.env.BUSINESS_WHATSAPP ?? "");
  business.contactEmail = z
    .union([z.email(), z.literal("")])
    .parse(process.env.BUSINESS_CONTACT_EMAIL ?? "");
  await store.db
    .prepare("UPDATE businesses SET data=? WHERE id=?")
    .run(JSON.stringify(business), business.id);
  await insertUser(
    store,
    business.id,
    email,
    passwordValue,
    business.name,
    "admin",
  );
});
store.db.close();
console.log(
  "Business and administrator created. Configure packages and performers before accepting real bookings.",
);

