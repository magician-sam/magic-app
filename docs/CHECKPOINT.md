# Development checkpoint — September 18, 2026

Resume from the current GitHub main and local work; inspect both before modifying anything. The initial verified implementation was 0885e3020a39748ae1962ffb93d12ff1a2bd01cc; the customer-account/recovery increment was published as c8de1728e2cdfdb4ef0a1d8edb43c96f2f3b6257. The customer-account increment adds separate customer authentication, required login for new requests, own-event accounts, editable usernames, optional profile fields, referral tracking/settings, configurable booking questions, expanded catalog and staff-assisted password recovery. See VERIFICATION for actual checks and environment limits.

Latest user directions: continue development; make almost everything editable without destroying existing history; include forgotten-password recovery; resume unfinished work at 10:15 PM Beirut if paused or usage-limited. The one-shot 22:15 Beirut automation fired on September 18 while this work was active; work continued from the checkpoint. Do not treat it as a future pending wakeup. The earlier pause has been revoked.

Next priorities:
1. Reward ledger is implemented and verified: staff review/issue, fixed rule snapshots, one-use quote application, refund eligibility checks, cancellation policy and audited voiding. Offers still start disabled; owner must choose qualification and terms. Current points are a profile completion score, not currency.
2. Improve phone verification and recovery delivery after a provider is selected/configured; do not simulate OTP or send unsolicited messages. Manual owner-verified reset is available now.
3. Per-show preview links and optional checkout extras are now implemented; media uploads/embedded playback, editable content/form ordering and custom fields for other record types remain. Expose parent-entered ages clearly to authorized staff.
4. Customer duplicate merge, timetable editing/per-act assignment, richer calendar/reporting, consented cross-business referrals, follow-up/contact history and the remaining SCOPE items.
5. Real card/Whish payment integration, truthful capacity indicators, guarantee publication and production hosting depend on verified configuration/policy. No invented availability, guarantee promise or live prices.

Use the isolated preview fixture only for browser testing. It stores disposable records in memory; production data is separate. Existing test credentials and sample phones are test fixtures, not real accounts. Standalone Playwright workers fail with Windows spawn EPERM; use the connected browser for interactive verification and report this limitation. Build/type/lint/domain/API checks run directly via Node. Git HTTPS helper is unavailable; publish via GitHub Git-data API with fast-forward-only ref update and verify the remote tree. Keep local HEAD synchronized with the exact remote commit.

Do not call the platform complete: substantial approved work remains. WhatsApp history import and home-screen icons remain postponed/out of scope.

## September 19 saved increment

Added reward ledger and 33 passing automated checks; connected browser verified staff application of a 30% test reward ($100.01 to $70.01), customer-only issued rewards, private quote total and acceptance. Removed show age restrictions, added Adult Magic placement, editable character enquiry names and public email/floating WhatsApp. Sam’s contacts and initial characters are in .env.example and preview fixture. Photos awaited.

The updated isolated preview runs at http://localhost:3001; the old localhost:3000 process was not restarted, preserving its temporary data. Both are in-memory previews, not the permanent database. No production database has been provisioned. Intended persistent path is data/magic.sqlite (outside Git); hosting/persistence remains unresolved. Reward browser fixture on 43222 was stopped after verification.

Continue remaining SCOPE items, then perform the user-requested whole-project review and discuss any suggested extra work. Do not call this platform complete.

Seasonal catalog follow-up: More Shows includes editable enquiry entries for Animation (first), Dog Show, Acrobat, BMX, Clown, Juggler and Breakdance. Characters now has one landing card opening an editable seasonal chooser (up to 100 names), with selected-character WhatsApp/email enquiry. These entries have no invented prices, duration, capacity or booking promise; full basket packages remain configurable separately. Connected browser verified all seven names, one character card, Panda selection and the correct prefilled link. API coverage checks list editing/replacement; build, typecheck, lint and all 33 tests pass.

Logo follow-up: supplied original PNG is public/sam-logo.png, configured in Sam preview/bootstrap example and editable per business. Desktop/mobile browser verified; no horizontal overflow. More media will be supplied later. Latest preview was restarted after its earlier process had stopped; it remains disposable memory only.
