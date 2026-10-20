import { cp, mkdir } from "node:fs/promises";
import { build } from "esbuild";
import './verify-dependency-adapters.mjs';
await mkdir("dist/public", { recursive: true });
await cp("public", "dist/public", { recursive: true });
await mkdir('dist/public/vendor/leaflet',{recursive:true});
await cp('node_modules/leaflet/dist/leaflet.css','dist/public/vendor/leaflet/leaflet.css');
await cp('node_modules/leaflet/dist/images','dist/public/vendor/leaflet/images',{recursive:true});
await cp('node_modules/leaflet/LICENSE','dist/public/vendor/leaflet/LICENSE.txt');
await build({entryPoints:['src/venue-map-runtime.ts'],outfile:'dist/public/venue-map.js',bundle:true,minify:true,format:'esm',platform:'browser',target:'es2023',logLevel:'silent'});
await build({ entryPoints: ["src/client.ts"], outfile: "dist/public/client.js", bundle: true, minify: true, format: "esm", platform: "browser", target: "es2023", logLevel: "silent" });
await build({ entryPoints: ["src/partner-client.ts"], outfile: "dist/public/partner.js", bundle: true, minify: true, format: "esm", platform: "browser", target: "es2023", logLevel: "silent" });
await cp("dist/calendar.js", "dist/public/calendar.js");
await cp("dist/reports.js", "dist/public/reports.js");
await cp("dist/guest-services.js", "dist/public/guest-services.js");
// Vercel's Express preset serves public/ through its CDN.
if (process.env.VERCEL) {
  await cp('dist/public/venue-map.js','public/venue-map.js');
  await cp('dist/public/vendor/leaflet','public/vendor/leaflet',{recursive:true});
  await cp("dist/public/client.js", "public/client.js");
  await cp("dist/public/partner.js", "public/partner.js");
  for (const file of ["calendar.js", "reports.js", "guest-services.js"])
    await cp(`dist/${file}`, `public/${file}`);
}

await build({ entryPoints: ["src/customer-info-client.ts"], outfile: "dist/public/customer-info.js", bundle: true, minify: true, format: "esm", platform: "browser", target: "es2023", logLevel: "silent" });
if (process.env.VERCEL) await cp("dist/public/customer-info.js", "public/customer-info.js");
