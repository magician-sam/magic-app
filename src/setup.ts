import { DateTime } from "luxon";
import { z } from "zod";
import { Store } from "./store.js";
import { insertUser, passwordHash } from "./auth.js";
const email = z.email().parse(process.env.BOOTSTRAP_EMAIL);
const password = z
  .string()
  .min(14)
  .max(200)
  .parse(process.env.BOOTSTRAP_PASSWORD);
const timezone = process.env.BUSINESS_TIMEZONE ?? "Asia/Beirut";
if (!DateTime.now().setZone(timezone).isValid)
  throw new Error("Invalid business timezone");
const store = new Store(process.env.DATABASE_PATH ?? "./data/magic.sqlite");
if (store.db.prepare("SELECT id FROM users LIMIT 1").get())
  throw new Error("Setup already completed; existing data was not changed.");
const passwordValue = await passwordHash(password);
store.transaction(() => {
  const business = store.createBusiness(
    process.env.BUSINESS_NAME ?? "Magic by Sam",
    z
      .string()
      .regex(/^[a-z0-9-]+$/)
      .parse(process.env.BUSINESS_SLUG ?? "magic-by-sam"),
    timezone,
  );
  business.characterNames = z
    .array(z.string().trim().min(1).max(80))
    .max(30)
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
  store.db
    .prepare("UPDATE businesses SET data=? WHERE id=?")
    .run(JSON.stringify(business), business.id);
  insertUser(store, business.id, email, passwordValue, business.name, "admin");
});
store.db.close();
console.log(
  "Business and administrator created. Configure packages and performers before accepting real bookings.",
);
