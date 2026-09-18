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
