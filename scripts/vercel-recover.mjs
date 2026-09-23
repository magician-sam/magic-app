import { spawnSync } from "node:child_process";

if (process.env.VERCEL && process.env.VERCEL_ENV === "production") {
  const result = spawnSync(process.execPath, ["dist/recover-owner.js"], {
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
