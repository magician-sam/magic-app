import { readFile, readdir, stat, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname, relative, join } from 'node:path';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';

// Evidence collection only. Neither a filename nor a supplier proves permission.
const root = process.cwd(), reportDirectory = resolve('docs/legal-review');
await mkdir(reportDirectory, { recursive: true });
const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
const packages = Object.entries(lock.packages).filter(([path]) => path).map(([path, value]) => ({ path, version: value.version, license: value.license ?? 'NOT DECLARED', developmentOnly: !!value.dev }));
const frontend = new Map();
const browserEntries = ['src/client.ts', 'src/partner-client.ts', 'src/venue-map-runtime.ts', 'src/customer-info-client.ts'];
for (const entry of browserEntries) {
  const result = await build({ entryPoints: [entry], bundle: true, minify: true, platform: 'browser', format: 'esm', target: 'es2023', write: false, metafile: true, logLevel: 'silent' });
  for (const path of Object.keys(result.metafile.inputs).filter(path => path.includes('node_modules/'))) {
    let directory = dirname(resolve(path));
    while (directory.startsWith(root) && directory !== root) {
      try {
        const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
        if (manifest.name && manifest.version) { frontend.set(directory, manifest); break; }
      } catch { /* Try its parent package directory. */ }
      directory = dirname(directory);
    }
  }
}
const notices = ['MAGIC APP — THIRD-PARTY BROWSER SOFTWARE NOTICES', 'Generated from the installed packages used by the customer, partner, map and information-page browser bundles.', 'These notices apply to the identified third-party software, not to photographs, music or the entire Magic App.', ''];
const bundled = [];
const missingNotices = [];
for (const [directory, pkg] of [...frontend.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name))) {
  const files = (await readdir(directory, { withFileTypes: true })).filter(file => file.isFile() && /^(licen[sc]e|copying|notice)(\.|$)/i.test(file.name));
  bundled.push({ name: pkg.name, version: pkg.version, license: pkg.license, noticeFiles: files.map(file => file.name) });
  const fallback = join('third-party/licences', `${pkg.name.replaceAll('/', '__')}-${pkg.version}.txt`);
  if (!files.length) {
    try { await stat(fallback); } catch { missingNotices.push(`${pkg.name}@${pkg.version}`); }
  }
  notices.push('='.repeat(70), `${pkg.name} ${pkg.version}`, `Declared licence: ${typeof pkg.license === 'string' ? pkg.license : JSON.stringify(pkg.license)}`, '');
  for (const file of files) notices.push(file.name, await readFile(join(directory, file.name), 'utf8'), '');
  if (!files.length && !missingNotices.includes(`${pkg.name}@${pkg.version}`)) {
    notices.push(await readFile(fallback, 'utf8'), '');
    bundled.at(-1).noticeFiles.push(fallback);
  }
  if (missingNotices.includes(`${pkg.name}@${pkg.version}`)) notices.push(`Upstream package declares ${pkg.license}; a separate copyright/licence text was not included.`, `Source repository: ${typeof pkg.repository === 'object' ? pkg.repository.url : pkg.repository}`, 'Full notice verification remains open. This entry does not invent or replace the upstream licence.', '');
}
notices.push('='.repeat(70), 'Map tiles/data: © OpenStreetMap contributors, https://www.openstreetmap.org/copyright', 'Map tile usage: https://operations.osmfoundation.org/policies/tiles/', 'Map service availability and usage terms are separate from the Leaflet software licence.', '');
await writeFile('public/third-party-notices.txt', notices.join('\n'));
await writeFile(join(reportDirectory, 'software-licences.json'), JSON.stringify({ generatedAt: new Date().toISOString(), browserEntries, scope: 'npm lockfile metadata and actual customer/partner/map/information-page browser-bundled package notice texts. Native SDKs, external services and media require separate review.', packages, bundled, missingNotices, missingDeclarations: packages.filter(pkg => pkg.license === 'NOT DECLARED') }, null, 2));

let old = [];
try { old = JSON.parse(await readFile(join(reportDirectory, 'media-rights-register.json'), 'utf8')).assets; } catch { /* First inventory. */ }
const assets = [];
async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await visit(path);
    else if (/\.(jpg|jpeg|png|webp|svg|mp4|webm|mp3|wav|gif)$/i.test(entry.name)) {
      const key = '/' + relative(resolve('public'), path).replaceAll('\\', '/');
      const sha256 = createHash('sha256').update(await readFile(path)).digest('hex');
      const prior = old.find(asset => asset.path === key && asset.sha256 === sha256);
      assets.push(prior ?? { path: key, bytes: (await stat(path)).size, sha256, status: 'permission-evidence-needed', creator: '', licenceOrPermissionReference: '', identifiablePeopleConsentReference: '', musicAndTrademarkReview: '', notes: 'Existing app asset; presence in the workspace is not proof of a licence or consent. Record evidence before marking cleared.' });
    }
  }
}
await visit(resolve('public'));
await writeFile(join(reportDirectory, 'media-rights-register.json'), JSON.stringify({ generatedAt: new Date().toISOString(), scope: 'Local public media only. Cloud-only uploads and remotely embedded media are not covered. Existing files were not removed or newly declared cleared.', assets }, null, 2));
console.log(JSON.stringify({ bundledPackages: bundled, lockfilePackages: packages.length, licenceTypes: [...new Set(packages.map(pkg => pkg.license))], missingNotices, localMedia: assets.length, uncleared: assets.filter(asset => asset.status !== 'cleared').length }));
