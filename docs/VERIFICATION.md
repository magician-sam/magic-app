# Verification — September 18, 2026

## Customer-account increment

- Build, strict typecheck and lint passed; 31 domain/API tests passed. New integration coverage exercises separate staff/customer sessions, cross-business and cross-family denial, required login, repeat identity, ignored impersonation payloads, optional ages/profile points, editable rewards, referral linking, refunds, password/session revocation and custom-question snapshots/audited edits/stale revisions.
- Connected-browser checks: anonymous checkout opens registration; disposable customer registers with name/phone/password; basket survives registration; signed-in request creates Requested event; My account lists only that customer's event; optional ages save and show the flat profile bonus; staff signs in separately; reward percentage is edited; an admin-added question appears at checkout and its answer persists on the private event page.
- Browser autofill incorrectly treated the preceding referral field as a login identifier. Added explicit autocomplete hints and a visible prefilled editable username at registration. Final username registration validation is covered by API tests; password-manager behavior varies by browser and is not guaranteed.
- Standalone Playwright suite attempted again: worker launch still fails with Windows spawn EPERM. It is not reported as passing. No real messages, payments or production accounts were used.
- Reward redemption is deliberately not described as automated. Phone verification, recovery delivery, live provider payments, fraud controls and physical-device testing remain unverified/unconfigured.
- Recovery API tests verify generic account-discovery responses, owner-only/cross-business restrictions, mandatory identity-verification acknowledgement, hashed/private codes, code expiry, one-use redemption, preserved codes under repeated help requests, session revocation, and invalidation after ordinary password change. Browser checks verified the chosen-username registration, Forgot password form, generic submitted response, and corresponding admin review queue. No real identity was verified and no message was sent. No JavaScript errors were recorded in the customer browser checks.

## Baseline

GitHub `magician-sam/magic-app` contained only `connection-test.txt` at `123f5feeeaa3cc0ea5d386aaa16c0da8a918666d`. The supplied conversation/specification was reviewed. No application or business data existed in the repository. The initial connection test is removed by the implementation commit; its historical commit remains the parent.

## Executed checks

- TypeScript strict typecheck and compilation.
- Static asset build.
- ESLint over application and test files.
- 28 Node domain/API integration tests passed, run in-process because this Windows session disallows worker process creation.
- npm dependency audit: no vulnerabilities reported at installation.
- Connected-browser desktop visual inspection of public homepage and private dashboard, with no recorded JavaScript errors in the tested flow.
- Connected-browser full journey: add magic to basket → request with test family/event → private event page shows Requested → staff signs in → assigns test performer → records availability → prepares two proposals → customer accepts $300 option → both sides show Accepted/awaiting confirmation → staff confirms zero-deposit proposal → both sides show Confirmed.
- Narrow viewport visual inspection; Help Me Choose for audience age 3 recommends the bubble package and successfully adds it to the event box. The connected browser applied its own viewport scaling (readback was 461 CSS pixels despite a requested 390-pixel override); this is not a claim of a physical-phone test.
- Full records persist across SQLite reopen; consistent backup can be opened and retains event/audit counts.

## Automated coverage

Booking state gates, deposit enforcement, refunds/corrections, stale revisions and quote acceptance, cross-business ID access, scoped exports, performer data redaction, assistant restrictions, reason-required/logged support access, link rotation, review ownership/duplicate rejection and photo/private-feedback consent, CSV preview/duplicates, timezone/invalid dates, travel/setup and cross-midnight conflicts, package snapshot stability, account session invalidation and password changes.

## Environment limitations

- Git's HTTPS transport helper is missing in the bundled runtime. Repository reads and publishing use the connected GitHub API; remote publication must be verified against its branch ref.
- `agent-browser` could not create its default socket directory in the restricted home directory. The connected in-app browser was used for the visual and interactive checks instead.
- The standalone Playwright runner starts but fails to create a worker with Windows `spawn EPERM`. Its two reproducible scenarios are committed, but **the standalone suite is not reported as passed**. The critical journey and guided chooser were executed separately via the connected browser.
- No live production hosting, real customer data, actual payment provider, outbound message delivery, real media authorization or physical-device tests were available.

## Review focus

Protected private customer details, retained source commit history, excluded local secrets/databases/test artifacts, exact integer money arithmetic, distinct quote acceptance and booking confirmation, consented publication, catalog snapshots for historical terms, conservative unavailability checks, and complete audit records for edits/cancellations/corrections.

## Preview links and checkout extras increment

Editable per-show preview URLs (HTTPS only), optional checkout extras, catalog-derived performer category choices and prefilled WhatsApp enquiry links were added. Browser verification: enable the bubbles show as an extra in admin; preview link renders with the saved URL; register a customer with magic in the basket; opt into bubbles at checkout; the private event timetable includes magic, the changeover and bubbles. No extras are preselected. API coverage checks unsafe preview URL rejection and persisted extra duration/category snapshots. Build/type/lint and all 31 tests pass; no customer-browser JavaScript errors recorded. No external video was opened or WhatsApp message sent.

## September 19 reward and public-content increment

- Build, strict typecheck, lint and all 33 domain/API tests passed. Reward coverage includes scoped permissions, duplicate issuance/use, rule snapshots, cents rounding, deposits, refunds, quote replacement, alternative selection, both cancellation policies, referred customers, free-show package restriction, overpayment rejection and retained audit/history.
- API checks cover editable/scoped public email and characters, validation and audit entries. All-age compatibility tests preserve venue/power/space checks.
- Connected browser: staff applied 30% to a test $100.01 quote, customer saw only their own rewards/events and accepted the $70.01 quote, status remained accepted awaiting confirmation. No recorded JavaScript errors in this flow.
- Public browser: Fast Order and Adult Magic cards have no age labels; Polar Bear/Panda/Bunny enquiries target the supplied WhatsApp number; email uses mailto. Admin saved the 00-prefixed phone and links resolved to wa.me/96171299716. No message was sent or live WhatsApp account ownership verified.
- Desktop and narrow-screen character screenshots reviewed; narrow browser readback was 375 CSS pixels with matching scrollWidth (no horizontal overflow). Physical-device testing and standalone Playwright worker limitations remain.
- Temporary test run failures were corrected: an incorrect catalog URL in the new test and a port collision with the disposable reward browser fixture. Final full suite is green.

Seasonal catalog follow-up: More Shows includes editable enquiry entries for Animation (first), Dog Show, Acrobat, BMX, Clown, Juggler and Breakdance. Characters now has one landing card opening an editable seasonal chooser (up to 100 names), with selected-character WhatsApp/email enquiry. These entries have no invented prices, duration, capacity or booking promise; full basket packages remain configurable separately. Connected browser verified all seven names, one character card, Panda selection and the correct prefilled link. API coverage checks list editing/replacement; build, typecheck, lint and all 33 tests pass.

Logo follow-up: original supplied 601×603 PNG copied without alteration; header display verified loaded at natural dimensions, desktop and narrow layout (375 CSS pixels, no overflow), no recorded browser errors. Build/type/lint and all 33 tests pass, including logo URL validation. Logo can be removed or replaced in business settings.

September 20 calendar increment: resumed the interrupted logo publish and verified main at bc7b91c00b8136fdb5a9c0cb5a69e2a114fad5e9. Added Monday-first monthly calendar, status/performer filters, day agenda, blocked times and event opening. Unit tests cover leap days, six-week months, invalid dates and year navigation. Build, typecheck, lint and all 35 tests pass. Connected browser verified December/January navigation, request versus confirmed filtering, performer filter, day agenda with block, opening event and narrow layout (375px, no outer overflow, horizontally scrollable grid). No recorded JavaScript errors. Existing server-side visibility and booking conflict checks remain authoritative. Remaining work is in SCOPE; no production database/hosting/provider has been configured.

Contact-history verification (September 20): 36 tests pass, including staff roles, customer/performer denial, business and customer isolation, event ownership, blank-note validation, stale revision rejection, corrections, archive/restore, audit entries, export and deletion protection. Build, typecheck, lint and diff whitespace checks pass. Connected browser on disposable port 3002 verified add, related-event selection, edit, archive, restore, multiline rendering and dialog scroll reset. No JavaScript errors recorded. The standalone Playwright worker limitation remains; this increment used the connected browser.

September 21 reports: build/type/lint and 38 tests pass. Added independent event/payment date filtering tests, inclusive boundaries, deposits for future events, refunds, expenses, open ends, empty periods, invalid/reversed dates and leap day. Connected browser verified controls, event filtering, error feedback, empty state and reset; screenshot inspected, no JavaScript errors. Financial arithmetic was verified with automated fixtures; browser fixture had no transactions. Standalone browser-worker limitation remains.

Question ordering: 39 automated tests pass, including role/business isolation, stale order rejection, duplicate IDs, public order, edits retaining position and historical answer preservation. Build/type/lint pass. Browser verified add two questions, move second up, reopen same order, disabled boundary buttons and no JavaScript errors.

Timetable verification: 41 tests pass; reordered breaks, pack-down conflict intervals, cross-midnight finish, exact selected-show validation, role/business restrictions, stale revisions, closed-event protection and price preservation. Browser verified duplicate position feedback and complete two-show reorder/save/readback with confirmation and availability reset. Build, typecheck and lint pass. Same timetable function serves staff/customer/show-day views. Independent customer browser readback and drag-and-drop are not claimed.

Staffing plan verification: full suite initially found a nested-transaction error in new save code. Replaced it with one atomic transaction; all 26 API tests then passed, alongside the 16 other tests from the full run. Build/type/lint and diff checks pass. Connected browser saved and reopened exact $123.45, performer and notes with no JavaScript errors. Private plan omitted from public/customer/performer APIs; explicit access-denial tests pass. Actual pay remains manually recorded expenses.


Customer merge (September 21): all 47 tests pass using node --test --test-isolation=none test/*.test.mjs. Five new tests cover owner/business restrictions, explicit identity confirmation, reference movement with unchanged finances, stale records, account/reward blocking and atomic rollback on injected archive failure. Build, typecheck and lint pass. Connected browser verified the complete merge on two in-memory preview contacts and reopened the result to verify preserved source notes. No recorded JavaScript errors; narrow dialog screenshot reviewed. No real contacts were used and no production/Vercel tests are claimed.

## September 22 database and follow-up increment

Added async local SQLite/Turso-libSQL adapters, atomic API writes with commit-before-success, persisted rate limits, Vercel Express/static-build preparation and encrypted portable backup/empty-target restore. Added configurable birthday, post-event, unanswered-proposal and school-campaign drafts, dashboard-triggered generation, idempotent reminder markers and explicit contact recording. No automatic messages.

All 54 automated tests pass with each database adapter (108 checks total); native libSQL fixtures exercise its engine locally, not remote HTTP. A Windows native libSQL file-handle cleanup issue was isolated and the parent test runner now cleans after child exit. Browser port 3016 verified opt-in settings, birthday generation, personalized draft, completion and preserved customer history; no recorded warnings/errors. Production accounts, remote HTTP transaction limits and actual Vercel preview remain unverified. No deployment.

Performer schedule increment: assigned performers now see their own per-show assignments with calendar dates and times in the event dialog. The projection follows accepted show snapshots/running order, ignores obsolete show IDs and excludes private agreed pay/notes. Full-event availability and conflict reservations remain unchanged. Build/type/lint and 35 targeted API/domain/assignment tests passed. Connected browser on disposable port 3017 verified the role-specific view, timing and layout with no recorded warnings/errors. Online payment integrations and pay summaries are postponed; manual cash and Whish records remain. Windows/Android wrappers are planned after website readiness.
