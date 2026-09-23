import { spawnSync } from "node:child_process";
// Only the production build can initialize an empty hosted database.
// Existing accounts are never recreated or reset on subsequent deployments.
if (process.env.VERCEL && process.env.VERCEL_ENV === "production") {
  const result = spawnSync(process.execPath, ["dist/setup.js", "--if-empty"], {
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

