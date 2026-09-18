# Development checkpoint — September 18, 2026

Resume from the current GitHub main and local work; inspect both before modifying anything. The initial verified implementation was 0885e3020a39748ae1962ffb93d12ff1a2bd01cc. The customer-account increment adds separate customer authentication, required login for new requests, own-event accounts, editable usernames, optional profile fields, referral tracking/settings, configurable booking questions, expanded catalog and staff-assisted password recovery. See VERIFICATION for actual checks and environment limits.

Latest user directions: continue development; make almost everything editable without destroying existing history; include forgotten-password recovery; resume unfinished work at 10:15 PM Beirut if paused or usage-limited. An active one-shot thread automation named Resume Magic App development was created for 22:15. The earlier pause has been revoked.

Next priorities:
1. Complete reward redemption ledger and rule-version snapshots with explicit one-time consumption/refund reversal; keep offers disabled until owner chooses personal vs referral qualification and terms. Current points are a profile completion score, not currency.
2. Improve phone verification and recovery delivery after a provider is selected/configured; do not simulate OTP or send unsolicited messages. Manual owner-verified reset is available now.
3. Dedicated short package previews, checkout add-on suggestions, editable content/form ordering and custom fields for other record types; expose parent-entered ages clearly to authorized staff.
4. Customer duplicate merge, timetable editing/per-act assignment, richer calendar/reporting, consented cross-business referrals, follow-up/contact history and the remaining SCOPE items.
5. Real card/Whish payment integration, truthful capacity indicators, guarantee publication and production hosting depend on verified configuration/policy. No invented availability, guarantee promise or live prices.

Use the isolated preview fixture only for browser testing. It stores disposable records in memory; production data is separate. Existing test credentials and sample phones are test fixtures, not real accounts. Standalone Playwright workers fail with Windows spawn EPERM; use the connected browser for interactive verification and report this limitation. Build/type/lint/domain/API checks run directly via Node. Git HTTPS helper is unavailable; publish via GitHub Git-data API with fast-forward-only ref update and verify the remote tree. Keep local HEAD synchronized with the exact remote commit.

Do not call the platform complete: substantial approved work remains. WhatsApp history import and home-screen icons remain postponed/out of scope.
