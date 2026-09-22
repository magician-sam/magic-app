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
