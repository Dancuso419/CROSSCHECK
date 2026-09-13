/**
 * Pass 2 of two: explain the conflicts that materiality.ts has already found and ranked.
 *
 * The split from 05-prompts.md is kept strictly: Pass 1 sees raw data but no conflict
 * guidance, Pass 2 sees normalised claims but never raw data. Neither can fabricate
 * underlying evidence.
 *
 * This goes further than the spec draft. In that draft the model decides which pairs
 * conflict and how material each is. Here code decides both, and the model is handed a
 * fixed list to explain. If the list is empty the model is never asked about conflict at
 * all, so "do not manufacture disagreement" stops being an instruction it might ignore and
 * becomes a property of the pipeline.
 */
import { MODEL_REASON, askJson, extractJson } from "./llm";
import { Pass2Output, type Brief, type NormalisedSource } from "./schema";
import { agreementLevel, detectConflicts, internalDivergences, type ConflictCandidate } from "./materiality";
import type { NormaliseOutcome } from "./schema";

function prompt(ticker: string, sources: NormalisedSource[], candidates: ConflictCandidate[]): string {
  return `You are explaining disagreements between independent market research sources for ${ticker}.

NORMALISED SOURCES:
${JSON.stringify(sources, null, 2)}

CONFLICTS ALREADY IDENTIFIED AND RANKED (do not add to this list, do not remove from it):
${JSON.stringify(
  candidates.map((c) => ({
    sources: c.sources,
    directions: c.directions,
    timeframes: c.timeframes,
    materiality: c.materiality,
    why_this_pairing_matters: c.why,
    is_timeframe_divergence: c.is_timeframe_divergence,
  })),
  null,
  2,
)}

Return ONLY valid JSON matching this schema:
{
  "headline": string,
  "consensus_summary": string,
  "conflicts": [
    {
      "sources": [string, string],
      "in_plain_terms": string,
      "description": string,
      "case_for_a": string,
      "case_for_b": string,
      "what_would_resolve_it": string
    }
  ]
}

Rules:
- "headline" is one sentence, under 20 words, that a person who has never traded could
  follow. No figures, no indicator names, no jargon. Say what the sources are doing --
  agreeing, splitting, or talking about different time horizons -- never what the reader
  should do about it. Good: "Four of the five agree; only the crowd is leaning the other
  way." Bad anything that implies an action or a price.
- "in_plain_terms" is one sentence per conflict, same register: no figures, no indicator
  names. Explain what the two sources are actually arguing about, in the way you would to
  a friend. The technical detail belongs in "description", not here.
- Return exactly one entry per conflict in the list above, with the same "sources" pair,
  in the same order. If that list is empty, return an empty "conflicts" array.
- Never invent a conflict that is not in the list. If the sources broadly agree, say so
  plainly in "consensus_summary" and explain what they agree on.
- "case_for_a" and "case_for_b": what would have to be true for each side to be right.
  Name the first source in the pair as A and the second as B.
- Where "is_timeframe_divergence" is true, say explicitly that both sources can be correct
  at once because they describe different horizons. Do not present it as a contradiction.
- "what_would_resolve_it" must name a specific observable — a data release, a flow print,
  a price level. Never "wait and see".
- Every claim must trace to the "evidence" field of a named source. No unattributed
  assertions, and no outside knowledge.
- Never recommend an action. No buy, sell, hold, entry, target, stop, or price forecast.
- "consensus_summary" must state how many sources reported and must not imply a direction
  the sources did not collectively express.`;
}

/**
 * Builds the brief. Model prose is merged into our deterministic structure, never the
 * other way round: materiality, the timeframe flag, agreement level and the unavailable
 * list all come from code.
 */
export async function buildBrief(ticker: string, outcomes: NormaliseOutcome[], total: number): Promise<Brief> {
  const sources = outcomes.flatMap((o) => (o.status === "ok" ? [o.value] : []));
  const unavailable_sources = outcomes.flatMap((o) =>
    o.status === "unavailable" ? [{ source: o.skill, reason: o.reason }] : [],
  );

  const candidates = detectConflicts(sources);
  const level = agreementLevel(sources, candidates);

  // No live source means there is nothing to compare; do not spend a call inviting the
  // model to narrate an empty set.
  let parsed: Pass2Output = {
    headline: sources.length === 0 ? `No sources reported for ${ticker}.` : "",
    consensus_summary:
      sources.length === 0
        ? `No sources reported for ${ticker}, so no comparison is possible. ${unavailable_sources.length} of ${total} Skills were unavailable.`
        : "",
    conflicts: [],
  };

  if (sources.length > 0) {
    let lastErr = "";
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        parsed = Pass2Output.parse(extractJson(await askJson(MODEL_REASON, prompt(ticker, sources, candidates))));
        lastErr = "";
        break;
      } catch (e) {
        lastErr = e instanceof Error ? e.message : String(e);
      }
    }
    if (lastErr) throw new Error(`conflict pass failed: ${lastErr}`);
  }

  // Join on the pair, so a model that reorders or renames cannot shift a ranking.
  const key = (p: [string, string]) => [...p].sort().join("|");
  const byPair = new Map(parsed.conflicts.map((c) => [key(c.sources), c]));

  return {
    ticker,
    agreement_level: level,
    headline: parsed.headline,
    consensus_summary: parsed.consensus_summary,
    reporting: sources.length,
    total,
    conflicts: candidates.map((c) => {
      const got = byPair.get(key(c.sources));
      return {
        sources: c.sources,
        materiality: c.materiality,
        why_it_matters: c.why,
        is_timeframe_divergence: c.is_timeframe_divergence,
        in_plain_terms: got?.in_plain_terms ?? "",
        description: got?.description ?? "(no explanation returned for this conflict)",
        case_for_a: got?.case_for_a ?? "",
        case_for_b: got?.case_for_b ?? "",
        what_would_resolve_it: got?.what_would_resolve_it ?? "",
      };
    }),
    internal_divergences: internalDivergences(sources),
    unavailable_sources,
  };
}

// One LLM call per query, so an uncached reload costs a call for a brief we already have.
// Same TTL bucket as the fan-out and Pass 1, so the three layers never drift apart.
// No database (CLAUDE.md).
const TTL_MS = Number(process.env.CROSSCHECK_CACHE_TTL_MS ?? 5 * 60_000);
const cache = new Map<string, Brief>();

export async function buildBriefCached(
  ticker: string,
  outcomes: NormaliseOutcome[],
  total: number,
  cacheKey = ticker,
) {
  const key = `${cacheKey.toUpperCase()}@${Math.floor(Date.now() / TTL_MS)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const brief = await buildBrief(ticker, outcomes, total);
  cache.set(key, brief);
  if (cache.size > 50) cache.delete(cache.keys().next().value!);
  return brief;
}
