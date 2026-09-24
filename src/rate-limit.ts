import type { RequestHandler } from "express";
import { hash } from "./auth.js";
import { requireThat } from "./domain.js";
import type { Store } from "./store.js";

export function rateLimit(store: Store): RequestHandler {
  return async (req, _res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    const path = req.path;
    const key = /\/reset\/request$/.test(path)
      ? "reset-request"
      : /\/reset\/complete$/.test(path)
        ? "reset-complete"
        : /\/login$/.test(path)
          ? "login"
          : /\/register$/.test(path)
            ? "register"
            : /\/password$/.test(path)
              ? "password"
              : /\/visit$/.test(path)
                ? "visit"
                : /\/requests$/.test(path)
                  ? "request"
                  : /\/enquiries$/.test(path)
                    ? "enquiry"
                  : "write";
    const max =
      key === "reset-request"
        ? 5
        : key === "visit"
          ? 100
          : key === "request" || key === "enquiry"
            ? 20
            : key === "write"
              ? 300
              : 10;
    const now = Date.now(),
      window = 15 * 60_000;
    // This transaction finishes before the route transaction, so failed logins count too.
    const allowed = await store.transaction(async () => {
      await store.db
        .prepare("DELETE FROM rate_limits WHERE expires<=?")
        .run(now);
      const id = hash(`${key}:${req.ip}`);
      const row = await store.db
        .prepare("SELECT count FROM rate_limits WHERE id=?")
        .get(id);
      if (row && Number(row.count) >= max) return false;
      await store.db
        .prepare(
          "INSERT INTO rate_limits(id,count,expires) VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET count=count+1",
        )
        .run(id, now + window);
      return true;
    });
    requireThat(allowed, "Too many attempts. Try again in 15 minutes.", 429);
    next();
  };
}

