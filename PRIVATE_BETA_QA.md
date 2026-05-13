# PolicyHQ Private Beta QA Checklist

Use this before giving PolicyHQ to real agents.

## Core Account Flow
- Sign up with a fresh email.
- Sign in after signing up.
- Sign out and sign back in.
- Confirm dashboard loads with the correct agent name.

## Client Flow
- Add a new client with name and phone number.
- Add optional email, date of birth, and address.
- Edit the client.
- Open the client detail page and confirm linked policies appear.

## Policy Flow
- Add a policy for a new client.
- Add a policy for an existing client and confirm client details autofill.
- Confirm policy number rejects spaces or strange symbols.
- Confirm lowercase policy numbers save as uppercase.
- Add a Motor policy and confirm vehicle number is required.
- Add a Property policy and confirm property location is required.
- Edit a policy.
- Delete a test policy only after confirming.

## Renewal Flow
- Confirm dashboard Renewal Alerts counts look right.
- Open Expiring This Week, Next Week, and This Month.
- Update renewal status from a renewal list.
- Open policy detail from a renewal row.
- Confirm Back to Dashboard works from renewal pages.

## Commissions Flow
- Confirm dashboard shows Commissions Earned This Month.
- Open Commissions.
- Confirm Pending, Overdue, and Paid statuses make sense.
- Confirm overdue is derived from policy start date older than 30 days.
- Mark a commission as paid using the inline confirmation.
- Confirm paid commission moves to Paid and payment date is recorded.
- Confirm mobile commission cards are readable.

## Notifications
- Confirm Renewal Alerts page opens from the bell/navigation.
- Confirm empty Renewal Alerts page can return to Dashboard.
- Confirm Mark All as Read works when notifications exist.
- Confirm repeated renewal jobs do not spam duplicate notifications.

## Mobile Checks
Test at roughly 375px width:
- Dashboard has no page-level horizontal scrolling.
- Clients page remains readable.
- Policies page table scroll is contained inside the table area.
- Renewal list table scroll is contained inside the table area.
- Commissions show mobile cards instead of forcing a wide table.

## Known MVP Limitations
- WhatsApp reminders require approved Meta templates before production use.
- Agent WhatsApp daily summary is skipped until its approved template is configured.
- CSV export exists but is not a primary MVP workflow.
- Performance cleanup is required before launch: split the large AppShell to reduce First Load JS.
