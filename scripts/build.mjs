import { cp, mkdir } from "node:fs/promises";
await mkdir("dist/public", { recursive: true });
await cp("public", "dist/public", { recursive: true });
await cp("dist/client.js", "dist/public/client.js");
await cp("dist/calendar.js", "dist/public/calendar.js");
await cp("dist/reports.js", "dist/public/reports.js");
