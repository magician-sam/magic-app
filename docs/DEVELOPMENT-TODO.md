# Magic App development list

Updated 1 October 2026. This is the complete customer-facing idea list Sam supplied, alongside the current Backstage priority. Listed ideas are requests to evaluate and implement, not claims that every feature is live. Audit existing controls before duplicating them.

Sam's 30 September priority: finish the major site and Backstage features first. Do not ask about prices, hosting, or email during this phase. Recheck the public site in a fresh browser tab on desktop and phone after each meaningful release, then fix obvious design and usability problems without waiting for a design decision.

Product direction: the customer website, future Android and iPhone customer apps, and the artist app must use the same event records, catalog rules, permissions and notification preferences. Keep business logic in shared server APIs and give each screen a device-appropriate interface. Do not build separate app-only booking rules that can drift from the site.

## Current delivery

- Full database backup: snapshots now include all 12 application tables, including referral codes, interest clicks and rate-limit records; older version-1 backups still restore. Settings includes a full-database download restricted to owner/admin and a dedicated single-business database so other businesses cannot be exposed. This attachment contains sensitive login hashes and must stay private. Source archives and downloaded database exports remain local, outside the public repository. Full restore/isolation coverage and the existing application checks total 88 passing tests. The cloud Blob store was checked and is empty; existing site media is in the source archive.
- Equal care for guest acts: every public guest-show card has its own expressive subtitle and factual description, with the matching party, energy, science, magic or spectacle palette. All catalogue cards remain visible.

- Visitor experience release: retain every catalogue card with visible section counts and jump links; give magic, science, bubbles, party, energetic and spectacle acts distinct visual moods. Improve customer typography and phone buttons. Hide empty comparisons. Put performance video previews before photo galleries, with swipe navigation, thumbnails and counters on phones. Add factual experience descriptions, FAQs and related choices. Show approved customer reviews near the entrance only when available. Explain planner recommendations and allow swapping without losing the event box. Add public shareable show/service pages with escaped metadata and reject hidden, inactive or other-business items. Required signup displays saved choices and explains the next step. Backstage typography remains unchanged.
- Release verification: type checks, lint and client bundling passed; 86 application tests passed, including the new show-page privacy and metadata tests. The separate setup subprocess test remains blocked by the local sandbox. Phone checks cover planner previews, filtered gallery counters, dedicated pages and saved choices; desktop and production checks are recorded after deployment. Do not treat this increment as completion of the entire development list.

- Service enquiries: Open/Edit, Mark handled, Archive/Restore, owner/admin permanent deletion with exact-name confirmation, stale-edit protection and business isolation. Regression coverage uses temporary records only.
- Frontend increment: homepage occasion shortcuts enter the existing guided selector directly; recommended shows and guest services can be combined without closing the selector, then continued through required account creation. Occasion and event-box selections survive page refresh in the current browser session. No prices, capacity guarantees or availability claims were added.
- Event plans: save show choices on the visitor's own device for 30 days, restore or forget them, copy a catalog-only share link, ask about the chosen mix on WhatsApp, or call from a phone. Compare two or three catalog shows side by side using real descriptions and existing quote labels. Shared links contain no contact, venue or booking details.
- Customer photo magnification: open show, character, guest-service and performer gallery photos in a full-screen viewer, with larger zoom levels and previous/next controls for phone and desktop.
- Customer interest report: count anonymous clicks on show and service cards, additions to event boxes, and occasion shortcuts; display the top choices in Backstage Money & reports for marketing decisions. Counts are actions over the last 30 days, not unique customers or confirmed sales.
- Fresh-window design audit: move real event photos into the first phone screen and make the homepage collage tappable; keep the booking actions and event box accessible.
- Character discovery: searchable real-photo gallery, desktop type filters and a compact phone dropdown. The pictured rabbit, bear, gorilla and panda costumes have clear names, including separate names when two appear in one photo. Visitors can select a configured character or pictured costume; the choice stays in the event box and request as a preference subject to confirmation.
- Artist workflow: continue from ARTIST-WORKFLOW-STATUS.md; staff roles, assignment responses, calendars, preparation, payment records and saved notices already have implementations. Private after-event uploads and external scheduled reminders remain dependent on hosting/storage.

## Customer discovery and design

- Smart visual hero with Book Your Event and Birthday, School, Wedding, Corporate, Festival and Christmas shortcuts.
- Instant package suggestions from occasion, guests, location, date and chosen services.
- Build Your Event with mixed services, including only services actually offered by Sam.
- Package comparison of inclusions and add-ons. Sam previously removed public show timing, so do not restore 30/45-minute comparison labels without a changed instruction.
- Service pages: photos, videos, age suitability, inclusions, FAQ and related add-ons. Keep public duration, minimum space and indoor/outdoor requirement badges removed.
- Searchable character gallery and useful theme filters (superhero, animals, Christmas, mascots and others supported by the catalog).
- Dedicated fireworks/cold-sparks presentation and safety notes if this is a verified offering; never invent available effects or permissions.
- Occasion pages: birthdays, schools, corporate events, weddings, Christmas, Ramadan/Eid, festivals and malls.
- Age and guest-count recommendations supported by real service suitability.
- Design My Event wizard: occasion, age, guests, location, date, optional budget when approved pricing exists.
- Event timeline preview using configured service schedules; avoid invented fixed timings.
- Genuine most-popular services, commonly selected combinations, completed-event counts and service availability badges based on real data.
- Scarcity messages only when reliably calculated from actual bookable availability.

## Trust and visual presentation

- Real event inspiration galleries grouped by occasion.
- Video testimonials and customer reviews with optional names, event type, approved photos and ratings.
- Before/after venue setup galleries using supplied paired images.
- Vertical reels for magic, characters, science, effects and reactions.
- Private after-event feedback with rating and photos; publish reviews/photos only with explicit customer consent.
- Subtle fast transitions, hover effects and smooth scrolling, respecting reduced motion.
- Different visual moods for magic, science, seasonal shows, effects and corporate pages.
- Mobile-first flow and sticky booking controls that never cover photos, form labels or dialog actions.

## Availability and enquiry flow

- Public available-date/time calendar without private customer or event details. Availability must represent verified booking rules, not merely absence of a booking.
- Check availability with approximate time and a clear enquiry fallback.
- Location transport message only when Sam defines actual included areas; otherwise transport is to be confirmed.
- Fast enquiry with name, phone, date and occasion, expanded details only when useful.
- Booking steps: Event → Services → Details → Review → Confirm.
- Success page explaining the next steps and an honest contact expectation.
- Status tracker from enquiry/contact/quote to confirmed/preparing/completed, mapped to actual workflow statuses.
- Preserve selections and entered details across required account creation before booking submission.

## Returning visitors and sharing

- Save event drafts; restore abandoned drafts locally with appropriate privacy handling.
- Favorites/wishlist, recently viewed items and comparison of two or three saved choices.
- Share event plan with family/company through a link that does not expose private booking details.
- WhatsApp with selected package/date/details, one-tap mobile calls and callback preferred-time requests.
- Repeat booking from a past package with a new date and fresh availability confirmation.
- Promo codes, short referral codes with booking attribution, birthday club and repeat-customer offers with appropriate opt-in.

## Customer portal

- Booking, quotes, invoices, deposit, balance, assigned services and confirmation status.
- Confirmed event countdown.
- Venue photos, entrance/parking/floor/gate instructions, contact person and location pin.
- Inspiration/theme/cake/costume reference uploads using protected storage.
- Digital confirmation of final event details.
- Deposit paid / balance remaining / fully paid states based on actual recorded payments.
- Downloadable clean PDF quotes/invoices.
- Calendar export for Google/Apple compatible calendars.
- Visual map location confirmation and structured special instructions (allergies, noise, elevator, power, security).

## Backstage and artist operations still to review

- Audit that every public show, guest service, category, photo, video and customer record has an understandable owner control to add, edit, hide or remove it. Keep confirmed booking and payment history protected. The current panels already cover shows, categories, guest services, photos/videos, customer records and unused-account deletion; complete remaining gaps found in the audit.
- Complete the artist workflow in ARTIST-WORKFLOW-STATUS.md, especially private after-event photos and real scheduled reminders. Existing artist login, assignment, confirmation/decline, calendar permission, availability warnings, checklist, agreed fees, completion notes and monthly report must remain scoped and tested.
- Improve the sales pipeline from enquiry through quote, acceptance, owner confirmation, preparation, completion and feedback. Make the next action clear for staff, with one useful global search across events, customers, artists and shows.
- Add equipment and costume inventory, transport assignments and costs, contract/document tracking, and a show-day view linked to each confirmed event. Reuse the existing preparation checklist and money records where possible.
- Make event feedback easy after completion: private link, event details, rating, written comments and optional photos; link it to the event and show a manual resend control. Existing review consent must continue to govern any public display. Automatic reminder delivery is parked with email and hosting.
- Review permissions, audit history, exports, backups, data retention and recoverable versus permanent deletion across all owner controls. The new anonymous visitor-interest report must show top clicked public choices without suggesting clicks are unique customers or sales.

## Ownership, security and installed apps

- Review third-party code, libraries, fonts, icons, APIs, templates, trademarks, privacy text and contributor rights before launch. Sam's own supplied photos do not need a separate ownership review.
- Keep valuable Backstage logic and secrets on the server, enforce account and business permissions, and review rate limits and logging. A public website cannot be made impossible to copy; focus on protecting private workflows and data.
- Revisit Android and Windows installation after the web experience is stable. Investigate the Android "harmful app" refusal and Windows Smart App Control block without asking Sam to disable device protections; distribute signed or store-trusted builds when feasible. The installable website remains the immediate low-friction option.
- Offline editing and synchronization need a separate design for conflicts and private data; do not imply that the current online app works offline.

## Deferred dependencies and future expansion

- Prices and live estimates: await Sam's real rates. Currency USD/LBP/SAR requires explicit currency and exchange-rate policy; do not invent rates or conversions.
- Online payment gateway: later with Sam's chosen provider.
- Arabic and English customer pages; French later.
- Outdoor weather warnings: later, with reliable event-location/weather integration.
- FAQ assistant first using approved answers; AI event assistant later using real catalog and capacity constraints.
- Email and phone popup notification tests remain postponed to the new host. Permission-based broadcasts for genuine new bundles/shows/updates, plus event-action messages, need configured delivery and opt-out controls.
- Transport-free zones, outside-area fees, price estimates, and payment terms await Sam's later pricing discussion. Keep transport as "to be confirmed" until the zone and rate rules are approved.
- Hostinger migration: follow HOSTINGER-KVM2-PLAN.md for database, private media, backups, HTTPS, jobs, monitoring and restore verification. Do not purchase or migrate without the actual server access and cutover readiness.

## Verification requirements

## Office operations expansion requested 1 October 2026

- [ ] Full order audit trail: accept, refuse, cancel, edit, status, agreement, price and payment changes; authenticated user ID/role, order ID, timestamp, before/after, request ID and device context. Browser IDs/labels are self-reported and must never authorize access. Add verified Windows device integration later; MAC is optional only where the native app can obtain it with appropriate consent. No browser MAC promise.
- [ ] Backstage work to-do panel: add/edit/archive tasks, assign staff, due dates, priority and link tasks to events, with permissions and history.
- [ ] Work Admin and Accounting Admin permission matrix with module-level view/add/edit/delete/accept/refuse/export controls; owner manages permissions. Reuse manager/accountant roles without granting either owner privileges.
- [ ] Linked agreements/accounting: versioned agreement, agreed price, deposit, balance, discounts, add-ons, transport, payments, refunds, expenses, invoices/receipts, event profitability and reconciliation. Avoid double-counting inventory/asset costs.
- [ ] Fuel and transportation: expense entries, journeys, driver/vehicle, event allocation, actual paid amount and supporting receipt.
- [ ] Inventory controls always include add/edit/archive or safe removal. Track category, quantity/unit, acquisition cost, supplier, location, condition and photos. Never erase stock/accounting history when an item is removed.
- [ ] Consumables (balloons, decoration materials): purchases, event reservation, consumption, returns, wastage, adjustments, remaining stock, low-stock notices and event cost allocation. Reject overselling and concurrent negative stock.
- [ ] Reusable/movable assets (speakers, lights, props, costumes, tables): serialized assets or pooled quantities, reserve/check-out/check-in, condition, loss/breakage, maintenance and availability conflicts.
- [ ] Fixed assets: acquisition value, accounting classification, depreciation policy, disposals and asset-value reports. Accounting treatment must distinguish asset purchase from event consumption and avoid repeated purchase-cost expense.
- [ ] Lebanon tax/accounting engine: research official rules at implementation time; configurable effective-dated tax settings, registration applicability, invoice treatment, rounding and currency rules. No invented rates or automatic claims of tax compliance.
- [ ] Accounting permissions, immutable financial adjustment history, reversal/correction rather than silent historical edits, reports by event/payment period, monthly totals and export.
- [ ] Verify desktop/phone controls, company isolation, least privilege, audit concurrency, inventory concurrency, money rounding, backups/restore and complete event-to-accounting calculations.

1 October implementation: request-scoped authenticated audit context records user ID/role, request ID, before/after and browser device ID/name for Backstage API actions. History shows business-timezone timestamps and device details. Settings contains device naming plus an office task panel with add/edit/status/archive, assignee, priority, due date and event link. Task writes enforce business ownership, permitted staff, optimistic revisions and transactional audit history. Manager/Accountant are labelled Work Admin/Accounting Admin when creating logins; their existing server privileges stay unchanged. All 91 application tests passed, including concurrency, device data validation, task isolation, stale edits and archive retention; typecheck, lint and client build passed. Desktop and 390px phone preview verified naming, task creation and expanded history with no overflow. Setup subprocess test remains excluded due the existing sandbox restriction. Granular permission overrides and inventory/accounting expansion remain pending. Deployment verification recorded separately after publishing.

30 September delivery evidence: photo magnification (b4e3ede), visitor-interest reporting (2a93d1c) and the fresh-window phone entrance update (e153281) reached READY on the production domain. Desktop and 390 × 844 phone checks confirmed the viewer, zoom controls, photo navigation, character gallery, homepage collage taps, readable captions, no horizontal overflow, and return to underlying show details. The phone now shows real event photos before booking actions, while the booking action remains in the first screen. Saved-plan sharing displayed a successful copy confirmation. The interest route passed isolated API checks for valid public choices, owner-only aggregates and business separation; the Backstage report itself still needs visual review after Sam signs in. Type checks, lint and the direct client build passed; 84 application tests passed before the new route, followed by 46 targeted API checks including its new regression. The browser regression specification was updated, but its local runner was not executed because the earlier browser policy blocks the local preview. Prices, hosting, email and external notification tests are parked until major feature work is finished, per Sam's latest instruction.

- Verify desktop and phone layouts, modal close/actions, keyboard access, readable labels and no horizontal overflow.
- Test authorization, tenant isolation, stale changes, consent and private-link handling for new data flows.
- Use temporary records; never delete real enquiries or send customer messages during unapproved tests.
- Record implementation and deployment evidence per completed item; never mark the entire list complete because one release passed.

