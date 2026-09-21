# Vercel launch preparation

Vercel is the selected future hosting target, requested September 21, 2026. The application is still under development and has not been deployed.

## Current blocker

The runtime uses synchronous `node:sqlite` against a local file, including transactional booking, rewards, recovery and merge operations. Vercel function instances cannot use that file as a shared durable database. Changing `DATABASE_PATH` to `/tmp` would risk losing records and separating customer sessions between instances; it is not a deployment solution.

## Implementation sequence

1. Select and provision an external database under the owner's hosting account. Managed PostgreSQL is a candidate, not a service already connected or provisioned. Keep development, preview and production data separate.
2. Replace synchronous database calls with awaited repository operations throughout authentication, accounts, bookings, links, rewards, audit and reports. Preserve transaction boundaries and stale-revision checks; add database-level concurrency protection before enabling multiple function instances.
3. Supply versioned schema migrations and a tested SQLite export/import path that preserves IDs, exact monetary values, password hashes, links, account relationships and audit history. Check row counts and relationships, and test rollback/recovery with disposable data.
4. Add the Vercel server entry and static-asset build configuration. Configure the exact HTTPS application origin, secure session handling and secrets through the hosting environment. Do not include local preview credentials or real customer data in deployment files.
5. Move future uploaded media to object storage. Current approved HTTPS media links can remain links. Implement production abuse controls and external backup/restore procedures.
6. Run integration tests against the real database engine, including concurrent booking/quote/reward/merge requests. Verify login, reservation, quote acceptance, confirmation, customer history, reviews and business isolation on a protected Vercel preview before production launch.

## Account access

On September 21, the connected Vercel `list_teams` tool returned an empty list. The intended account/team still needs to be identified or connected before provisioning or deployment. This does not establish that the owner has no Vercel account.

## Launch status

No Vercel project, production database, provider credentials, custom domain or production deployment has been configured in this increment. The remaining product scope is tracked separately in SCOPE.md.
