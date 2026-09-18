# Approved scope and implementation checkpoint

## Implemented in this increment

The README enumerates the working paths. The customer journey has persisted requests, versioned proposals, customer acceptance, performer availability, guarded confirmation and customer event pages. Management includes typed, validated editors, account isolation, contacts, show-day preparation, manual money records, consent-aware review publication, CSV duplicate detection, exports and backup primitives.

Catalog edits are versioned into event/proposal snapshots so existing agreements do not silently change. Business records are scoped by the authenticated user, never by a client-supplied business ID. Support access is available through a reason-required API and logged in the target business.

## Required before accepting real customers

1. Owner verifies branding, all package copy, durations, suitability, setup requirements, geographic service area, currency, timezone, price/deposit/cancellation terms, actual performer information, authorized badges and media rights. Seed catalog values are editable starting points, not verified operational requirements.
2. Configure hosting with persistent storage, HTTPS and exact origin; provision real credentials outside git. No production deployment was requested or performed.
3. Set retention/privacy rules, operational account recovery, production abuse controls, monitoring, backup schedule and encrypted off-machine destination. Test recovery on the chosen host.
4. Run the committed Playwright suite on a host where browser workers can start; broaden real-device checks for Android/iOS browsers and keyboard/screen-reader review.

## Remaining approved work / refinements

- Full drag/reorder timetable editor, custom per-act breaks and distinct teardown buffers. Current timetable follows selected-package order, a maximum setup allowance and a shared travel buffer; staff must review practical routing manually.
- Real availability invitations, reminders/offer drafts tied to a contact history, birthday/school seasonal scheduling, post-event follow-up automation. Current reminders are stored/dashboard-visible and quotes/links are shared manually. No messages are sent automatically.
- Individual performer assignment and agreed pay per act. Current performers are assigned to the event as a whole; conflict checks conservatively reserve the entire event for each assigned performer. Expense categories record performer/assistant/referral costs but are not a payroll system.
- Cross-business referral consent/acceptance and minimal-data sharing. Current referral records track a listed performer’s response and fee within one business; no private records are automatically shared with another business.
- Customer deduplication merge workflow. Imports skip duplicate phone/email records, manual/public duplicates are flagged, and event customer associations can be edited. Public submissions deliberately never overwrite an existing contact based only on an unverified phone/email.
- Gallery uploads/object storage, approved multi-photo/video galleries, upload scanning and more granular photo consent management. Current media uses HTTPS links and one photo per review, with separate publication consent.
- Rich calendar grid, popular-profile visitor counters, report date filters, advanced repeat-customer reports, visual admin support-access business switcher. Current calendar is a chronological agenda with status filters; stats are aggregate page views and request sources, not anonymous visitor identities.
- Safe editing of closed booking factual details through an explicit amendment flow. Completed/cancelled records are presently protected from event edits. Raw destructive deletion of booking/money/audit records is intentionally absent; cancellation and logged monetary corrections are provided instead.
- Native spreadsheet `.xlsx` upload; current spreadsheet import uses CSV with a preview and 500-row limit.
- Scheduled offsite backups, scoped restore UI and production recovery drill. Local snapshot backup and business exports are implemented and restoration of a snapshot is tested.
- Optional real payment provider and deeper Instagram/WhatsApp integration need provider decisions and separate verification. Current finance is a manual ledger and social integrations are links.

## Explicitly postponed / out of scope

- WhatsApp history import is postponed.
- Phone home-screen icons / PWA installation are out of current scope.
- No hidden admin access, invented reviews, fabricated syndicate authorization, automatic public photo use, unsolicited messaging or guessed live prices.

## Latest user preferences

- Friendly, fun entertainment design on the public site; a fast, clear dashboard with the same warm personality.
- Add/edit/remove controls throughout, while preserving payment and booking history.
- If unfinished after a pause or usage limit, resume from the saved checkpoint at 9:00 AM Beirut time (a task follow-up was created on September 18, 2026).

## Resume procedure

Read README, this file and VERIFICATION; inspect GitHub `main` and local changes first. Continue the remaining approved work without restarting the app or overwriting stored data. Work from the latest verified commit, test changes, review the diff and push incrementally. Use no real customer data in tests. Do not deploy or configure unverified third-party services merely to make a checklist look complete.
