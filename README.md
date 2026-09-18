# Magic App

A playful customer website and a private, business-isolated entertainment dashboard. This is the first working implementation from the approved Magic App specification, continuing the repository's connection-test commit. No existing application or customer data was present.

## Run locally

Requires Node.js 24+. Runtime dependencies are Express, Helmet, Luxon and Zod; persistence uses Node's SQLite API. This app needs a long-running Node process and a persistent writable disk. Do not deploy it to an ephemeral serverless filesystem.

```sh
npm ci
cp .env.example .env
# Fill BOOTSTRAP_EMAIL and a unique BOOTSTRAP_PASSWORD (14+ characters).
npm run setup
# Remove BOOTSTRAP_PASSWORD after setup. Do not commit .env.
npm start
```

On Windows, copy `.env.example` to `.env` with your file manager or PowerShell. The public website is `http://localhost:3000`, dashboard `/manage`. Separate businesses use `/b/<business-slug>`. Default business timezone is Asia/Beirut and currency is USD; these are explicit initial configuration choices, not verified business policy. Currency conversion and changes to historical timezone/currency require a migration.

Setup refuses to overwrite an existing account. The production database starts with three **editable draft catalog packages**, no customer records, no invented reviews, no performer claims and no configured social links. Review all durations, age limits, space/safety requirements and copy before opening real requests. Prices default to **Quote required**; deposit amounts are explicitly entered on each proposal.

## What works

- Customer-only accounts with name/phone required, generated editable usernames, password login/change and optional email/children's ages. Browsing stays public; new event requests require a customer session. Staff accounts cannot substitute for customer accounts. Supplied phone numbers are not verified and never auto-link historical contacts.
- Forgot-password requests, owner review after independent identity verification, private single-use 30-minute reset links/codes, and session revocation. There is no automatic SMS/email delivery; staff share recovery details privately after verification. Password changes also revoke outstanding reset codes.
- Fast Order plus More Shows, editable show categories and featured flags, optional per-show preview links and checkout extras. Owner-configured booking questions (text, long text, number, choices), required/optional and visible/hidden settings, snapshotted answers, audited staff answer corrections on open events.
- Customer referral codes/links, configurable reward percentages/thresholds/conditions and profile-completion points. Reward offers start disabled; free-show eligibility must be configured. Progress counts completed, fully paid events and reflects refunds. Redemption is manual through a reviewed quote, not an automated entitlement or payment credit.

- Theatrical responsive public website, show cards, event box, guided chooser, optional performer selection, profiles/media links, authorized membership badges, consented verified-event reviews, configurable Instagram/WhatsApp links.
- Persisted reservation requests and unguessable private event links. Request, performer availability, proposal acceptance and confirmed booking are distinct states.
- One to three quote alternatives, integer-cent prices/deposits, stale-revision protection, owner approval, conservative travel/setup conflicts, venue compatibility, timetable, editable checklist, backup performers, cancellation and rescheduling history.
- Families/children, schools, organizations, planners and venues, multiple contacts, notes, contact preferences, birthday nudges, follow-ups, booking history, editable record association.
- Manual deposits, balances, payments, refunds, expenses, referral-fee tracking, estimated profit, booking-source reports, popular requested packages and anonymous page-view counts.
- Separate businesses; owners, assistants and performers; assigned-event-only performer view; user editing/removal; password changes revoke sessions. Platform support API requires a reason for cross-business access and logs it.
- CSV spreadsheet import with preview and duplicate detection, business JSON exports, consistent SQLite backup command.
- Editable business/profile/package/customer/event/quote/reminder/checklist/referral fields. Linked historical records are protected; catalog removals archive, money corrections preserve previous values in the audit trail, and reviews are moderated without altering genuine ratings.

See [SCOPE.md](docs/SCOPE.md) for the exact remaining work and limitations. This is **not a declaration that the entire approved platform is finished or production-launched**.

## Checks

```sh
npm run typecheck
npm run lint
npm test
npx playwright install chromium
npm run test:e2e
```

The isolated browser fixture (`node test/preview.mjs`) uses an in-memory database, explicit `.test` credentials and a sample performer. It is a local testing tool, not a production seed. Tests never read or modify the production database.

When an environment disallows child-process creation, run equivalent checks directly:

```sh
node node_modules/typescript/bin/tsc
node scripts/build.mjs
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js src test
node --test --test-isolation=none test/domain.test.mjs test/api.test.mjs test/customer.test.mjs test/recovery.test.mjs
```

Browser runner limitations and the separately verified interactive browser journey are recorded in [VERIFICATION.md](docs/VERIFICATION.md).

## Deployment and operations

Use HTTPS with `NODE_ENV=production`, set `APP_ORIGIN` to the exact public HTTPS origin, and set `HOST=0.0.0.0` only on a secured application host. Terminate TLS at a trusted reverse proxy. The server validates write origins, uses HttpOnly/SameSite session cookies and a restrictive content policy, and never places event tokens in a URL path or query (the private token is in the fragment and sent in a request header). Private links are bearer access: anyone holding one can view and act on that event. They expire after 180 days and can be rotated by staff.

Keep the database on an encrypted persistent volume. Configure database/file permissions, HTTPS hosting, a retention policy, operational account recovery, monitoring and off-machine backups before production use. No real payment provider, outbound email/SMS/WhatsApp sender, automatic social feed or live travel-routing provider is configured. Staff share links manually and record received payments; the app does not charge customers.

`npm run backup` creates a consistent database snapshot under ignored `backups/`. Copy backups to encrypted off-machine storage with an operator-managed schedule. To restore, stop the application, preserve the current database and any WAL/SHM files together in a separate recovery directory, restore a tested snapshot to `DATABASE_PATH`, and restart. Never overwrite a running database. JSON business exports intentionally omit passwords, sessions and access tokens and are not a full-system restore format.

The initial audit log is application-append-only, not cryptographically tamper-proof against a database administrator. It contains personal data; protect it like the customer database.
