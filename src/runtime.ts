import { Store } from "./store.js";

export function storeFromEnvironment() {
  const url =
    process.env.MAGIC_TURSO_DATABASE_URL || process.env.TURSO_DATABASE_URL;
  const token = process.env.MAGIC_TURSO_DATABASE_URL
    ? process.env.MAGIC_TURSO_AUTH_TOKEN
    : process.env.TURSO_AUTH_TOKEN;
  if (url) {
    if (!/^(libsql|https):\/\//.test(url) || !token)
      throw new Error(
        "Set a secure TURSO_DATABASE_URL and TURSO_AUTH_TOKEN together.",
      );
    return new Store(url, token);
  }
  if (process.env.VERCEL)
    throw new Error(
      "Configure the online database before deploying Magic App.",
    );
  return new Store(process.env.DATABASE_PATH ?? "./data/magic.sqlite");
}

export function applicationOrigin() {
  const configured =
    process.env.VERCEL_ENV === "preview" && process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : (process.env.APP_ORIGIN ?? "http://localhost:3000");
  const url = new URL(configured);
  if (url.origin !== configured || url.username || url.password)
    throw new Error(
      "APP_ORIGIN must be an exact origin without a path or credentials.",
    );
  if (
    (process.env.NODE_ENV === "production" || process.env.VERCEL) &&
    url.protocol !== "https:"
  )
    throw new Error("Production requires an HTTPS APP_ORIGIN.");
  return url.origin;
}

