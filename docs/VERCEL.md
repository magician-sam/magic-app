# Vercel launch preparation

Vercel is the selected future host. No production deployment or external database has been provisioned by this increment.

## Implemented

- Awaited local SQLite and Turso/libSQL web adapters retain the existing schema and IDs. All modifying API routes have write transactions; success responses wait for commit. Rate limits are database-backed and survive failed login transactions.
- Vercel Express entry in src/server.ts and vercel.json; build copies browser assets into public. Node 24.x is selected. Local database files are rejected on Vercel.
- Encrypted portable snapshots and atomic restore into an empty destination, including accounts, hashes, sessions, links and audit records. Temporary rate-limit counters are excluded. Restore validates tables and foreign keys. Secrets never belong in Git.

## Remaining launch sequence

1. Provision separate preview and production Turso/libSQL databases under the owner's account. Set TURSO_DATABASE_URL (libsql:// or https://) and TURSO_AUTH_TOKEN in the correct Vercel environments. Keep preview data separate from production.
2. Set NODE_ENV=production and APP_ORIGIN to the exact production HTTPS origin, with no trailing slash or path. Preview deployments use VERCEL_URL. Do not publish bootstrap passwords or the backup passphrase to browser code.
3. For a new business, run setup once against the chosen empty database from a trusted machine, then remove bootstrap credentials. For existing data, pause writes, make an encrypted backup, restore to the empty remote destination and compare records before switching. Do not run setup before restoring.
4. Deploy a protected preview only after the remaining product review. Verify login, customer requests, quote acceptance, calendar/conflicts, reviews, consent, multiple-business isolation and concurrency against the actual remote HTTP database. Verify static assets and private-page response headers on Vercel.
5. Configure retention, monitoring, offsite backup scheduling and a recovery drill. Full backups contain private records and authentication material; protect both files and passphrases. Uploaded media will require object storage; currently approved HTTPS media links are used.

The schema uses additive CREATE TABLE IF NOT EXISTS initialization. Future destructive changes need explicit versioned migrations; automatic schema initialization is not permission to alter historical data. Remote HTTP latency, transaction duration limits, large data migrations, hosting build behavior and real recovery have not yet been verified. The two-driver tests use local SQLite and the native libSQL engine, not a live Turso account.

## Account access

The intended Vercel team is magician-sam. Connector access previously returned an empty team list, then a 403 and later an unavailable-tool response after reconnecting. The browser showed an existing unrelated shantivikasa project. It must remain untouched. Re-check current access when deployment work begins; do not infer account absence from connector failures.

## Shantivikasa reference reviewed — September 22

User requests the same connection/update approach as magician-sam/shantivikasa. Reviewed its README.md, vercel.json and app/photo-picker.tsx on GitHub. It uses Vercel with an authenticated API and Turso/libSQL; server-side database credentials; separate preview database; Windows installers preserving existing database/settings. Magic App already has a Turso/libSQL adapter and should retain this architecture with its own separate database and multi-business authentication. Reuse the operational pattern, not Shantivikasa credentials, app identity or database. Its Vite rewrites are not directly interchangeable with Magic App's Express entry.

The reference photo picker accepts JPG/PNG/WebP up to 20MB, scales proportionally without enlargement to 1280px maximum, converts to JPEG at 0.87 quality and previews the result. Adapt this to the unfinished Magic App gallery/upload flow and test it; resizing/upload is not implemented yet.

Shantivikasa's Windows app additionally implements local SQLite, queued offline writes, repeated-upload protection and explicit conflict review. Magic App's current agreed wrappers are online-only. Do not claim that offline sync or automatic desktop binary updates exist. Deploy website changes through the linked GitHub/Vercel project after tests; wrapper changes require their own tested installer/package. Photos may be added after deployment.

## Offers and galleries — September 23

Offers & bundles are editable from the owner dashboard and appear in a public offers section. A bundle combines two or more active individual shows, uses a fixed total price, snapshots its included shows, derives duration/venue requirements and rejects overlapping selections in requests and proposals. Savings compare currently public fixed component prices; no saving is shown when a comparison is unavailable. A bundle is currently one scheduled/staffed package; separate performer assignments within a bundle are not implemented.

Approved HTTPS gallery links can be added, ordered and removed for shows and performers. Direct file upload and automatic resizing remain deferred until the supplied photos are handled.

Validation: 59 tests passed on each of SQLite and native libSQL; build and lint passed. Browser verified owner bundle creation, public included shows and savings, and event-box total. This does not validate a remote Turso database or Vercel runtime.

The Vercel import flow now confirms Project Created for magic-app under magician-sam. No deployment was started. Opening the optional Turso Add integration was blocked by automatic approval review pending user approval of separate free-only database provisioning. Existing Shantivikasa resources remain untouched.

## First successful deployment — September 23

- Production deployment d9ff66c is Ready at https://magic-app-gray.vercel.app. Live UI reaches the database and reports that the business has not been set up yet.
- Turso Starter ($0/month) resource magic-app-production created through Vercel. Connected to Production only, prefix MAGIC. Runtime accepts MAGIC_TURSO_DATABASE_URL and MAGIC_TURSO_AUTH_TOKEN as a pair. No credentials copied into code.
- APP_ORIGIN configured to https://magic-app-gray.vercel.app. Helmet default import failed Vercel compilation; named middleware imports preserve the same header policies and the Vercel build now succeeds. Both 59-test driver suites and lint passed after the change.
- Administrator setup is pending user-entered BOOTSTRAP_EMAIL and BOOTSTRAP_PASSWORD in Vercel. Browser handoff opened the email editor; user must enter credentials and save. Password minimum is 14 characters.
- Prepared scripts/vercel-setup.mjs, production-only setup runner, and setup --if-empty. The runner is NOT wired into the build yet. After the user saves credentials, update vercel.json buildCommand to `npm run build && node scripts/vercel-setup.mjs`, then publish and verify the resulting deployment. A test confirms repeat setup never changes the existing user and needs no bootstrap credentials. Remove/clear bootstrap password after first successful setup. Check blank imported optional environment fields before setup (for example BUSINESS_LOGO and BUSINESS_TIMEZONE).
- Real customer workflow, production login and backup/recovery remain unverified. Local example offer and prices were disposable fixture data and were not uploaded to production.

## Production initialization completed

Deployment 590a77f completed and its build log reports: "Business and administrator created." The live alias https://magic-app-gray.vercel.app loads the public Magic by Sam catalog from the production Turso database. The included shows still have placeholder descriptions and quote-only prices. No real booking has been submitted or login tested by the assistant. The one-time bootstrap build hook is removed in the next commit so later builds do not rerun setup.

After verifying owner login, remove the BOOTSTRAP_PASSWORD variable from Vercel production and preview settings; the stored password hash in the database remains. The owner must handle that credential deletion in the browser. Keep the Turso integration variables connected. Configure show/performer details and media before sharing the public link widely. A real production request, proposal, review, backup and recovery drill still require verification.

## Owner password recovery — September 23

The owner entered a new password in Vercel's Production-only OWNER_RECOVERY_PASSWORD secret. A one-time production build reported `Owner recovery: completed`, verified the new password hash, revoked prior sessions, and recorded a recovery marker so repeats cannot reset the account. The temporary build hook and recovery code were then removed. The owner still needs to confirm interactive login and delete both OWNER_RECOVERY_PASSWORD and the original BOOTSTRAP_PASSWORD from Vercel's environment settings. Neither secret belongs in source control.
