import type { Express, RequestHandler } from "express";
import type { Store } from "./store.js";

// Serialize each read/check/write operation in a database write transaction.
// The HTTP success response is emitted only after the commit succeeds.
export function writeRoutes(app: Express, store: Store) {
  const register =
    (method: "post" | "put" | "delete") =>
    (path: string, handler: RequestHandler) =>
      app[method](path, async (req, res, next) => {
        const json = res.json;
        let payload: unknown,
          replied = false,
          skipped = false;
        res.json = function (body: unknown) {
          payload = body;
          replied = true;
          return this;
        };
        try {
          await store.transaction(async () => {
            await handler(req, res, (error?: unknown) => {
              if (error) throw error;
              skipped = true;
            });
            if (!replied && !skipped)
              throw new Error("Write handler did not finish.");
          });
          res.json = json;
          if (skipped) next();
          else res.json(payload);
        } catch (error) {
          res.json = json;
          res.removeHeader("Set-Cookie");
          next(error);
        }
      });
  return {
    post: register("post"),
    put: register("put"),
    delete: register("delete"),
  };
}
