# PolicyHQ GStack Rules

GStack is available, but PolicyHQ should not use it automatically. Use it as an opt-in senior review layer for important decisions.

## When To Use GStack

Use GStack for:

- Major product ideas
- New modules
- Dashboard redesigns
- Import/onboarding workflow changes
- Life-agent workflow changes
- Security reviews
- Launch readiness checks

Do not use GStack for:

- Small bug fixes
- Copy changes
- SQL snippets
- Dependency upgrades
- Tiny CSS tweaks
- Already-approved implementation tasks

## Skill Map

- `gstack-office-hours`: product framing before big features.
- `gstack-design-shotgun`: 2-3 UI directions before major design changes.
- `gstack-plan-ceo-review`: product/scope challenge.
- `gstack-plan-eng-review`: architecture and failure-mode review.
- `gstack-plan-design-review`: UI/UX critique before implementation.
- `gstack-review`: code review before merge.
- `gstack-qa`: browser QA when a real interaction pass is needed.
- `gstack-ship`: final release checklist.

## Token Control

- Start with the smallest relevant GStack skill, not the whole stack.
- Prefer one skill per turn unless the user asks for a full workflow.
- Keep outputs short unless the user asks for depth.
- Do not paste full skill contents into the conversation.
- Do not write code during Office Hours or Design Shotgun unless the user approves.

## PolicyHQ Decision Flow

1. Big product idea: run `gstack-office-hours`.
2. Big UI change: run `gstack-design-shotgun`.
3. Approved build: implement normally in Codex.
4. Risky code change: run `gstack-review`.
5. Launch/release: run `gstack-ship` and normal PolicyHQ QA.

## Owner Preference

Prince wants direct, honest pushback. If a feature risks bloat, security exposure, poor mobile UX, or token waste, say so before implementation.
