# Artist workflow status

Updated 30 September 2026. This records what is implemented and what still needs work; it is not a claim that the full artist plan is finished.

## Live now

- Artists have separate logins and see only assigned jobs, their own availability, and their own job responses. Customer details, quotes, fees and other artists' private information are removed from their dashboard data.
- The owner can grant or revoke a limited company calendar view per artist. It shows other events' dates, times and statuses without customer or event names.
- Artists can confirm or decline an assigned future job. The response time and actor appear in Backstage. Schedule and assignment changes reset stale responses.
- Assigned artists can record a completed job with notes, problems and an extra expense for owner review. Completion is timestamped and audited; it does not issue a payment automatically.
- Agreed artist fees live in each event's staffing plan. Advances and later payments can be linked to an artist, with checks against paying more than the agreed fee. The report shows jobs, confirmations, completions, cancellations, agreed fees, paid amounts and balances for the selected event-date range.
- The calendar and notification center show reply needs, declines, upcoming jobs and schedule checks. The event checklist displays the artist confirmation count.
- Notification read/unread and dismiss/restore choices persist per staff account. Changes to a booking create fresh notices, and artists cannot manage notices for other artists' events. Schedule warnings remain visible rather than dismissible.
- Confirming a booking adds preparation reminders for the customer plan, venue and arrival, transport, costumes, props and payment arrangements, plus show-specific preparation tasks. Existing manual items and completed ticks are preserved, and repeated confirmation does not duplicate tasks.
- API tests cover artist data isolation, confirmation, calendar permission, conflict privacy, completion and fee limits.
- Backstage now offers Manager, Sales and Accountant logins. Managers manage events, artists, shows and media; Sales manages customer details and proposals; Accountants record and correct payments and view artist fees. Business settings, exports, logins and permanent record deletion remain owner-only. Role changes end existing sessions immediately. Server checks also protect direct requests, and restricted planning details are masked in saved-record responses.

## Still to build

- Private after-event photo upload for artist reports. Do this with the planned host's protected media storage; the current Vercel Blob photo path is public and is not suitable for private reports involving children.
- Scheduled external reminders. Email delivery and phone push testing are postponed to the new host at Sam's request; that host still needs SMTP credentials, VAPID keys and opt-in testing.
- A final end-to-end test with a real artist login and actual event data after the host migration. Use test accounts and events first; do not alter customer bookings during verification.
