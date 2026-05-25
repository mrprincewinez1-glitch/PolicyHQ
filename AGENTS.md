# PolicyHQ Agent Rules

PolicyHQ is a SaaS insurance agent management platform for Ghana and West Africa. Work on this repo must stay practical, secure, fast, and mobile-first.

## Default Working Rule

- Explain the plan in plain English before code changes.
- Wait for approval before writing code unless the user is asking for a direct fix that has already been approved.
- Challenge weak ideas respectfully. Do not agree just to agree.
- Keep code lean. Do not add abstractions, packages, or rewrites unless they solve a real problem.
- Protect existing user work. Never revert unrelated changes.

## GStack Usage

GStack is installed for Codex with namespaced skills. Use it only when the user explicitly asks for it.

Approved trigger phrases:

- "run gstack office hours"
- "run office hours"
- "run gstack design shotgun"
- "run design shotgun"
- "run gstack review"
- "run gstack qa"
- "run gstack ship"
- "use full gstack"

Do not run full GStack workflows for small fixes such as typos, button fixes, SQL snippets, one-field validation, package updates, or obvious bugs.

When GStack is used, keep output compact:

- Office Hours: one recommendation, main risk, MVP scope, and decision.
- Design Shotgun: maximum three directions, one recommended direction, no code until approved.
- Review: findings first, ordered by severity.
- QA/Ship: checklist result, blockers, and next action.

## Security Rules

- Every protected server action and API route must verify an authenticated Supabase session.
- Never expose service role keys, Meta/WhatsApp tokens, Resend keys, or private secrets to client code.
- Never trust `agent_id` from the client. Derive it from the authenticated user.
- Every table that stores agent/customer data must use RLS with owner-scoped policies.
- User-submitted input must be validated server-side before writes.
- Private files must use signed URLs.
- Do not log client names, phone numbers, policy numbers, commission figures, auth tokens, or API secrets.

## UI Rules

- Mobile-first for Ghana agents.
- Keep the Figma design language: dark sidebar, white content, orange accent, compact operational cards.
- Avoid crowded dashboards. Each card must lead to exactly what it says.
- For major UI changes, run Design Shotgun before code.
- Tables must not create page-level horizontal scroll on mobile.

## QA Rules

For meaningful changes, run:

```bash
npm run typecheck
npm run lint
npm run build
npm run test:e2e
```

If a command cannot run, report why clearly.

## Launch Reminder

Before launch discussions, confirm the app remains under the performance budget and remind the user to approve any remaining performance cleanup if First Load JS rises back toward the 150 kB threshold.
