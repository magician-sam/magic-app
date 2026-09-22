import { createClient } from "@libsql/client";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { Store } from "../dist/store.js";
export class TestStore extends Store {
  constructor(path) {
    super(
      path,
      undefined,
      process.env.TEST_LIBSQL === "1"
        ? createClient({
            url:
              path === ":memory:"
                ? "file::memory:"
                : pathToFileURL(resolve(path)).href,
            intMode: "number",
          })
        : undefined,
    );
  }
}
