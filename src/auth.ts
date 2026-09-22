import {
  randomBytes,
  createHash,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import type { User } from "./models.js";
import { Store, id } from "./store.js";
const scrypt = promisify(scryptCallback);
export const token = () => randomBytes(32).toString("hex");
export const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export async function passwordHash(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${((await scrypt(password, salt, 64)) as Buffer).toString("hex")}`;
}
export async function passwordMatches(password: string, stored: string) {
  const [salt, key] = stored.split(":");
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  return key.length === 128 && timingSafeEqual(actual, Buffer.from(key, "hex"));
}
export async function createUser(
  store: Store,
  businessId: string,
  email: string,
  password: string,
  name: string,
  role: User["role"] = "owner",
  performerId?: string,
) {
  return await insertUser(
    store,
    businessId,
    email,
    await passwordHash(password),
    name,
    role,
    performerId,
  );
}
export async function insertUser(
  store: Store,
  businessId: string,
  email: string,
  passwordValue: string,
  name: string,
  role: User["role"] = "owner",
  performerId?: string,
) {
  const user: User = {
    id: id(),
    businessId,
    email: email.toLowerCase(),
    name,
    role,
    ...(performerId ? { performerId } : {}),
  };
  await store.db
    .prepare(
      "INSERT INTO users(id,business_id,email,password,data) VALUES(?,?,?,?,?)",
    )
    .run(user.id, businessId, user.email, passwordValue, JSON.stringify(user));
  return user;
}
