import { cp, mkdir } from "node:fs/promises";
import { build } from "esbuild";
await mkdir("dist/public", { recursive: true });
await cp("public", "dist/public", { recursive: true });
await build({ entryPoints: ["src/client.ts"], outfile: "dist/public/client.js", bundle: true, minify: true, format: "esm", platform: "browser", target: "es2023", logLevel: "silent" });
await cp("dist/calendar.js", "dist/public/calendar.js");
await cp("dist/reports.js", "dist/public/reports.js");
await cp("dist/guest-services.js", "dist/public/guest-services.js");
// Vercel's Express preset serves public/ through its CDN.
if (process.env.VERCEL) {
  await cp("dist/public/client.js", "public/client.js");
  for (const file of ["calendar.js", "reports.js", "guest-services.js"])
    await cp(`dist/${file}`, `public/${file}`);
}
