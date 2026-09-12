# Spec — Crosscheck

**Track:** AI Trading Desk
**Theme:** Open Theme (2 winners per track)

---

## Thesis

Bitget exposes five independent research Skills — macro, on-chain intel, news, sentiment,
technical. Every tool built on them will collapse those five views into one confident
answer. That flattening is where retail traders get hurt: manufactured consensus hides the
fact that the underlying sources are in conflict, and a trader acts on false certainty.

Crosscheck inverts it. It reports **where the sources disagree, why the disagreement
exists, and what would have to be true for each side to be right.** It never issues a
verdict.

## Why Open Theme

Not extraction (it is comparison), not review (not retrospective on the user), not stress
testing, not a personalised workbench, not execution assistance. The handbook's own Open
suggestion is a portfolio-aware copilot — deliberately not that, because every entrant
reads the same doc.

## Target user

Active retail traders who already consume multiple research sources — a TA channel, a
macro newsletter, crypto Twitter sentiment — and get whipsawed when those sources
contradict each other. 5–20 trades/month, $2k–$50k accounts, crypto plus tokenized equity
exposure. Not "all traders."

---

## The one complete research task (the graded artefact)

**Question:** "I'm seeing bullish and bearish takes on AAPL. Which is it?"

→ five Skills queried in parallel → normalised → conflicts ranked by materiality →

**Actionable insight:**

> **AAPL — 3 sources bullish, 2 bearish.**
>
> **Highest-materiality conflict: macro vs flows.**
> `macro-analyst` reads risk-off — rate expectations repriced Tuesday.
> `market-intel` reads accumulation — net inflows up 40% over 5 days.
>
> **For macro to be right:** current inflows are late retail, and institutional selling
> appears next week.
> **For flows to be right:** the rate move is already priced and positioning is ahead of it.
> **What resolves it:** ETF flow direction Thursday.
>
> *Lower-materiality:* sentiment vs technical conflict — these two diverge routinely and
> carry little information on their own.

Question → actionable insight, end to end. Build the demo around exactly this path.

---

## Scope — four things, nothing else

1. **Fan-out** — one ticker, five Skills, parallel, cached.
2. **Normalise** — one LLM pass → `{source, direction, conviction, evidence, timeframe}`.
   See `05-prompts.md`.
3. **Detect & rank conflict** — pairwise disagreement, ordered by *materiality*, not count.
   See `03-skill-integration.md` for the materiality matrix.
4. **Brief** — render the conflict, both cases, and the resolving indicator.

## Out of scope

Order placement. Portfolio import. Backtesting. Auth. Charting. Watchlists. Multi-ticker
comparison. Tracking which source was right historically (interesting, but it needs
history you do not have).

---

## The defensible idea

Anyone can count disagreements. The product judgment is **which disagreements matter.**

Sentiment vs technicals conflict constantly — that is background noise. Macro vs on-chain
flows conflicting says something real about positioning. Encoding that difference is the
part a competitor cannot copy from a screenshot, and it is what makes this a research tool
rather than a dashboard.

## Failure modes to design against

- **Manufactured conflict.** The model is asked to find disagreement, so it will invent it.
  Agreement must be reportable as agreement.
- **Fake precision.** If `conviction` proves unstable in the spike, drop the field. A
  number that looks exact and isn't is worse than no number.
- **Verdict creep.** Every reviewer will want a bottom line. Do not add one.

## Validation plan (form part 3)

6–8 campus testers who trade. One question: *"did this change what you thought you knew
about this ticker?"* Report honestly, label figures `observed`. Real user data is the
single biggest differentiator available to a solo entrant.

---

## Build order

| Day | Target |
|---|---|
| 0 | **SPIKE** — see `docs/SPIKE.md`. Go / no-go. |
| 1 | Fan-out + caching. Five raw responses on screen. |
| 2 | Normalisation pass, Zod-validated, stable across 3 tickers |
| 3 | Conflict detection + materiality ranking |
| 4–5 | Brief rendering, the "for each to be right" framing |
| 6 | Deploy, verify link in a private window |
| 7 | Testers, recording, then form |
