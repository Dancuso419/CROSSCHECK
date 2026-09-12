# Prompts — the actual product

Two passes. Keep them separate: one extracts, one reasons. Combining them produces
confident nonsense because the model starts inventing evidence to support conflicts it has
already decided exist.

Both are drafts. Tune against real Skill output after the spike.

---

## Pass 1 — Normalisation

Runs once per Skill response, or once over all five. Prefer **per-Skill** so one
malformed response cannot corrupt the others.

```
You are normalising the output of a single market research tool so it can be
compared against four other independent tools.

SOURCE: {skill_name}
WHAT THIS SOURCE MEASURES: {one_line_from_skill_integration_doc}
RAW OUTPUT:
{raw_response}

Return ONLY valid JSON matching this schema:
{
  "source": string,
  "direction": "bullish" | "bearish" | "neutral",
  "conviction": number between 0 and 1,
  "timeframe": "intraday" | "days" | "weeks" | "months",
  "evidence": string,
  "internal_divergence": string | null
}

Rules:
- "evidence" must quote specific figures, indicators, or events from the raw output.
  Never generalise. If the raw output gives no specifics, evidence is "none stated".
- Return "neutral" freely. Do not force a direction the source did not express.
- "conviction" reflects how strongly THIS SOURCE states its view — not how right it is.
- "internal_divergence": if the source contains sub-signals pointing different ways
  (common for technical indicator sets), describe it. Otherwise null.
- Do not incorporate outside knowledge. Only what is in the raw output.
```

Validate with Zod. On failure, retry once, then mark the source unavailable and continue.

---

## Pass 2 — Conflict detection and reasoning

Runs once over all five normalised objects.

```
You are analysing five independent market research sources for {ticker} to find
where they DISAGREE and explain why.

NORMALISED SOURCES:
{json_array}

MATERIALITY GUIDANCE (how much a given pairing's disagreement matters):
{materiality_matrix}

Return ONLY valid JSON:
{
  "consensus_summary": string,
  "agreement_level": "strong_agreement" | "mixed" | "sharp_conflict",
  "conflicts": [
    {
      "sources": [string, string],
      "materiality": "high" | "medium" | "low",
      "is_timeframe_divergence": boolean,
      "description": string,
      "case_for_a": string,
      "case_for_b": string,
      "what_would_resolve_it": string
    }
  ],
  "unavailable_sources": [string]
}

CRITICAL RULES:
- If the sources broadly agree, say so. Set agreement_level to "strong_agreement",
  return few or no conflicts, and explain what they agree on. Do NOT manufacture
  disagreement. A false conflict is worse than an empty list.
- Two sources on different timeframes pointing different ways is usually NOT a
  contradiction. Set is_timeframe_divergence true and say both can be correct.
- "what_would_resolve_it" must name a specific observable — a data release, a flow
  print, a level. Not "wait and see".
- Never recommend an action. No buy, sell, hold, entry, target, or stop.
- Every claim must trace to the evidence field of a named source.
- Order conflicts by materiality, highest first.
```

---

## Why two passes

Pass 1 has no incentive to find conflict — it only describes one source. Pass 2 sees only
normalised, evidence-backed claims, so it cannot fabricate underlying data.

Single-pass versions of this consistently invent disagreement. Do not merge them to save
a call.

## Test cases

Keep these in `spike/cases/` and re-run after every prompt change:

1. **Genuine sharp conflict** — flows against macro. Must be caught and ranked high.
2. **Strong agreement** — all five aligned. Must report agreement, not invent drama.
3. **Timeframe divergence** — macro bearish months, TA bullish days. Must be flagged as
   divergence, not contradiction.
4. **Missing source** — one Skill fails. Must be named in `unavailable_sources`, not hidden.

Case 2 is the one that matters most. A tool that always finds conflict is a tool nobody
trusts, and a judge will test exactly this.
