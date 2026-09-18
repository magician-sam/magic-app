# Verification — September 18, 2026

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
