# Crosscheck

Multi-source disagreement desk. Ask about a ticker; Crosscheck queries all five
`bitget-signal` research Skills, normalises their outputs, and surfaces **where they
disagree and why it matters** — instead of flattening five views into one false verdict.

Hackathon entry: Bitget AI Base Camp S2, **AI Trading Desk** track, **Open Theme**.
Deadline **Sept 21 2026 (UTC+8)** — submit Sept 20.

## Before anything else: run the spike

`docs/SPIKE.md`. Two hours, no UI. The entire premise depends on two unverified
assumptions — that the five Skill outputs can be normalised into a comparable schema, and
that they actually disagree in informative ways. **If the spike fails, stop and report
back rather than building around it.**

## Read before building

- `docs/SPIKE.md` — do this first
- `docs/02-spec-crosscheck.md` — the spec
- `docs/03-skill-integration.md` — how each of the five Skills maps into the schema.
  This is the highest-value doc in the repo; Skill integration depth is an explicit
  judging criterion.
- `docs/05-prompts.md` — the two LLM passes that are the actual product
- `docs/00-hackathon-rules.md` — submission validity
- `docs/01-bitget-tools.md` — Bitget stack notes. Verify against the live repo.
- `PROGRESS.md` — update every session

## Stack — do not change without asking

Next.js + TypeScript + Tailwind, deployed on Vercel.

- LLM calls via Next.js API routes. Keys stay server-side, never in the browser.
- **Zod** validates every structured LLM output. Malformed output fails loudly.
- **shadcn/ui** for components.
- **No database.** In-memory session state only.
- **Cache Skill responses** keyed by ticker + timestamp. Five parallel calls per query is
  slow and rate-limit-prone; a cold demo during judging must not hang.

Ask before adding any dependency.

## Maintain BUILD.md

Create `BUILD.md` at the repo root on day 1: install, run, env vars, deploy, how to verify
the demo link opens for a stranger. Keep it current — it feeds part 4 of the form.

## Scope discipline

Build exactly four things: **fan-out → normalise → detect & rank conflict → brief.**

Out of scope: order placement, portfolio import, backtesting, authentication, charting,
watchlists, multi-ticker comparison, historical accuracy tracking.

## Rules — these define the product, not just style

- **Never output a verdict.** No buy/sell/hold, no price target, no direction call.
  Crosscheck reports disagreement; the human decides. An unfalsifiable prediction is the
  fastest way to lose a subjective judge.
- **Never manufacture disagreement.** The model is being asked to find conflict, so it
  will invent it. When sources broadly agree, the product must say so plainly and show
  the agreement. A tool that always finds drama is a tool nobody trusts.
- **Every claim cites its source Skill and the specific evidence.** No unattributed
  assertions.
- Read-only. This tool must never place an order.
- Never commit secrets. `.env.local` is gitignored — verify before the first commit.
- The demo link must open for a stranger with no login. Test in a private window.

## Working style

- Small commits, working state at each one.
- Say plainly when something is not working rather than building around it.
- Flag anything that threatens the Sept 20 submission date.
