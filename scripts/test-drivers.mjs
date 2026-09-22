import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { resolve, sep } from "node:path";
const root = resolve("test-temp");
mkdirSync(root, { recursive: true });
for (const driver of ["0", "1"]) {
  const temp = mkdtempSync(resolve(root, "driver-"));
  try {
    const result = spawnSync(process.execPath, ["--test", "test/*.test.mjs"], {
      stdio: "inherit",
      env: { ...process.env, TEST_LIBSQL: driver, MAGIC_TEST_ROOT: temp },
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      process.exitCode = result.status ?? 1;
      break;
    }
  } finally {
    if (!resolve(temp).startsWith(root + sep))
      throw new Error("Unexpected temporary directory.");
    rmSync(temp, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    });
  }
}
