# Magic App development list

Updated 30 September 2026. This is the complete customer-facing idea list Sam supplied, alongside the current Backstage priority. Listed ideas are requests to evaluate and implement, not claims that every feature is live. Audit existing controls before duplicating them.

## Current delivery

- Service enquiries: Open/Edit, Mark handled, Archive/Restore, owner/admin permanent deletion with exact-name confirmation, stale-edit protection and business isolation. Regression coverage uses temporary records only.
- Frontend increment: homepage occasion shortcuts enter the existing guided selector directly; recommended shows and guest services can be combined without closing the selector, then continued through required account creation. Occasion and event-box selections survive page refresh in the current browser session. No prices, capacity guarantees or availability claims were added.
- Event plans: save show choices on the visitor's own device for 30 days, restore or forget them, copy a catalog-only share link, ask about the chosen mix on WhatsApp, or call from a phone. Compare two or three catalog shows side by side using real descriptions and existing quote labels. Shared links contain no contact, venue or booking details.
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

## Deferred dependencies and future expansion

- Prices and live estimates: await Sam's real rates. Currency USD/LBP/SAR requires explicit currency and exchange-rate policy; do not invent rates or conversions.
- Online payment gateway: later with Sam's chosen provider.
- Arabic and English customer pages; French later.
- Outdoor weather warnings: later, with reliable event-location/weather integration.
- FAQ assistant first using approved answers; AI event assistant later using real catalog and capacity constraints.
- Email and phone popup notification tests remain postponed to the new host. Permission-based broadcasts for genuine new bundles/shows/updates, plus event-action messages, need configured delivery and opt-out controls.
- Hostinger migration: follow HOSTINGER-KVM2-PLAN.md for database, private media, backups, HTTPS, jobs, monitoring and restore verification. Do not purchase or migrate without the actual server access and cutover readiness.

## Verification requirements

30 September delivery evidence: enquiry release 9b72330 and frontend release 7ac64e8 both reached READY on the production domain. 83 application tests passed (the environment's process-spawn restriction prevents the setup-command suite). Type checks, lint and the direct client build passed. Live browser checks confirmed mixed Science/Magic/Juggling choices survive the account handoff and a refresh, all six homepage occasion shortcuts appear, and the 390 × 844 phone view has no horizontal overflow or dialog-header overlap. Backstage visual verification still requires Sam to sign in; API behavior was tested using isolated fixtures. A browser regression specification was added, but its local runner was not executed because the earlier browser policy blocks the local preview. Pricing, external notification tests and the remaining roadmap are not complete.

- Verify desktop and phone layouts, modal close/actions, keyboard access, readable labels and no horizontal overflow.
- Test authorization, tenant isolation, stale changes, consent and private-link handling for new data flows.
- Use temporary records; never delete real enquiries or send customer messages during unapproved tests.
- Record implementation and deployment evidence per completed item; never mark the entire list complete because one release passed.
