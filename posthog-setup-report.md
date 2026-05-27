<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into PolicyHQ. The integration initialises PostHog via `instrumentation-client.ts` (Next.js 15.3+ pattern), proxies all ingestion traffic through `/ingest` to avoid ad-blockers, captures 11 business events across client-side and server-side code, identifies users on login and sign-up, and enables automatic exception tracking with `capture_exceptions: true`.

**Files created or modified:**

| File | Change |
|------|--------|
| `instrumentation-client.ts` | New — initialises `posthog-js` with reverse-proxy host, exception capture, and debug mode |
| `lib/posthog-server.ts` | New — singleton `posthog-node` client for server-side event capture |
| `next.config.mjs` | Added `/ingest` reverse-proxy rewrites for `/static/*`, `/array/*`, and `/:path*`; added PostHog domains to CSP `connect-src`; set `skipTrailingSlashRedirect: true` |
| `.env.local` | Added `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` and `NEXT_PUBLIC_POSTHOG_HOST` |
| `app/(auth)/actions.ts` | Server-side `user_signed_up` and `user_signed_in` events via `posthog-node` |
| `components/app/app-shell-client.tsx` | `posthog.identify()` on mount; client-side capture for 9 business events |

---

**Events instrumented:**

| Event name | Description | File |
|---|---|---|
| `user_signed_up` | User successfully created a new PolicyHQ account | `app/(auth)/actions.ts` |
| `user_signed_in` | User successfully signed in to PolicyHQ | `app/(auth)/actions.ts` |
| `policy_saved` | Agent saved a new or updated policy | `components/app/app-shell-client.tsx` |
| `client_saved` | Agent saved a new or updated client record | `components/app/app-shell-client.tsx` |
| `clients_imported` | Agent imported clients from a CSV or Excel file | `components/app/app-shell-client.tsx` |
| `prospect_saved` | Agent saved a new or updated prospect in the pipeline | `components/app/app-shell-client.tsx` |
| `commission_marked_paid` | Agent marked a commission as paid | `components/app/app-shell-client.tsx` |
| `renewal_status_updated` | Agent updated the renewal status on a policy | `components/app/app-shell-client.tsx` |
| `lapse_shield_statement_reviewed` | Agent uploaded and saved a Lapse Shield statement review | `components/app/app-shell-client.tsx` |
| `lapse_shield_case_updated` | Agent updated the status of a Lapse Shield missing-policy case | `components/app/app-shell-client.tsx` |
| `data_exported` | Agent downloaded a CSV export of clients, policies, or commissions | `components/app/app-shell-client.tsx` |

---

## Next steps

We've built a dashboard and five insights to monitor key user behaviour from day one:

- [Analytics basics dashboard](/dashboard/1635541)
- [New sign-ups over time](/insights/gmd5QZWW) — unique sign-up events per day
- [Policies saved per day](/insights/WGpJtbn8) — total policy saves per day
- [Sign-up to first policy funnel](/insights/J8G3ARGW) — onboarding conversion funnel
- [Lapse Shield statement reviews](/insights/9RC0mEwt) — Lapse Shield adoption per day
- [Commissions marked paid](/insights/T2lywvAw) — commission payment activity per day

### Agent skill

We've left an agent skill folder in your project at `.claude/skills/integration-nextjs-app-router/`. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
