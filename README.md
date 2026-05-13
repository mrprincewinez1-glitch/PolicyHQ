# PolicyHQ

> The operating system for insurance agents in West Africa.

PolicyHQ is a Next.js 14 SaaS insurance agency management platform designed for insurance agents in Ghana and West Africa.

## The Problem

Insurance agents in Ghana and across West Africa manage too much of their business manually: renewal follow-ups, client records, policy tracking, commission tracking, and WhatsApp reminders. PolicyHQ gives agents one professional place to manage that work.

## Core MVP Features

| Feature | Description |
|---|---|
| Renewal Alerts Dashboard | Track policies expiring this week, next week, and this month |
| WhatsApp Notifications | Automated renewal reminders and birthday messages via Meta WhatsApp Business Cloud API |
| Client Database | Centralised client records with contact details and policy history |
| Policy Tracker | Active, expiring, cancelled, and renewed policy visibility |
| Commission Tracker | Paid, pending, overdue, monthly, yearly, and all-time commission views |

## Tech Stack

- Next.js 14 App Router
- TypeScript
- Tailwind CSS with shadcn-style UI primitives
- Supabase PostgreSQL, Auth, Storage, RLS, and Edge Functions
- WhatsApp Business Cloud API
- Resend email
- Vercel hosting

## Local Setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local` and fill in Supabase, Resend, and WhatsApp values.
3. Run the SQL in `supabase/schema.sql` against the Supabase project.
4. Deploy the Supabase Edge Functions in `supabase/functions`.
5. Start the app with `npm run dev`.

## Routes

- `/` marketing landing page
- `/demo` unauthenticated live demo with isolated fictional data
- `/sign-in`, `/sign-up`, `/forgot-password`, `/reset-password`
- `/dashboard`
- `/renewals/week`, `/renewals/next-week`, `/renewals/month`
- `/clients`, `/clients/[id]`
- `/policies`
- `/commissions`
- `/notifications`
- `/profile`

## Supabase Security

Every tenant table has Row Level Security enabled with policies scoped to the logged-in agent. Demo data is local fixture data and never touches the production Supabase database.
