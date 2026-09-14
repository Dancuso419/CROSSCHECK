/**
 * Pass 1 of two: normalise one Skill's raw output into a comparable object.
 *
 * Deliberately per-Skill, not one pass over all five (05-prompts.md): one malformed
 * response cannot then corrupt the others, and a pass that sees only one source has no
 * opportunity to invent conflict. Pass 2 never sees raw data, only these objects —
 * that separation is what stops fabricated disagreement.
 */
import { MODEL_EXTRACT, PROVIDER_TROUBLE, askJson, extractJson } from "./llm";
import { NormalisedSource, type NormaliseOutcome } from "./schema";
import type { SourceResult } from "./fanout";

function prompt(src: Extract<SourceResult, { status: "ok" }>): string {
  return `You are normalising the output of a single market research tool so it can be
compared against four other independent tools.

SOURCE: ${src.skill}
WHAT THIS SOURCE MEASURES: ${src.measures}
RAW OUTPUT:
${JSON.stringify(src.raw, null, 2)}

Return ONLY valid JSON matching this schema:
{
  "source": string,
  "direction": "bullish" | "bearish" | "neutral",
  "conviction": number between 0 and 1,
  "timeframe": "intraday" | "days" | "weeks" | "months",
  "evidence": string,
  "internal_divergence": string | null,
  "internal_pulls": [{ "leans": "bullish" | "bearish", "point": string }]
}

Rules:
- "evidence" must quote specific figures, indicators, or events from the raw output.
  Never generalise. If the raw output gives no specifics, evidence is "none stated".
- Return "neutral" freely. Do not force a direction the source did not express.
- "conviction" reflects how strongly THIS SOURCE states its view, not how right it is.
- "internal_divergence": if the source contains sub-signals pointing different ways
  (common for technical indicator sets), describe it. Otherwise null.
- "internal_pulls": the same divergence split into its sides. One entry per sub-signal,
  "leans" is the way that sub-signal points, "point" is under 10 words and names the
  signal with its figure, e.g. "4h RSI 45, below the midline". Two to six entries, at
  least one each way. If "internal_divergence" is null, return an empty array.
- Do not incorporate outside knowledge. Only what is in the raw output.
- Never use em dashes. Use a comma, a colon, or a full stop instead.`;
}

/** Validated, or the source is marked unavailable. One retry, then give up — never
 *  hand Pass 2 a half-parsed object. */
export async function normaliseSource(src: SourceResult): Promise<NormaliseOutcome> {
  if (src.status === "unavailable") {
    return { skill: src.skill, status: "unavailable", reason: src.reason };
  }

  let lastErr = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const parsed = NormalisedSource.parse(extractJson(await askJson(MODEL_EXTRACT, prompt(src))));
      // The model is told the source name; don't let it rename the source.
      return { skill: src.skill, status: "ok", value: { ...parsed, source: src.skill } };
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
      // The retry is for a malformed answer. askJson has already tried every model.
      if (PROVIDER_TROUBLE.test(lastErr)) break;
    }
  }
  return { skill: src.skill, status: "unavailable", reason: `normalisation failed: ${lastErr}` };
}

export const normaliseAll = (sources: SourceResult[]) => Promise.all(sources.map(normaliseSource));

// Pass 1 costs one LLM call per live Skill, so an uncached repeat query is five calls for
// an answer we already have. The free Gemini tier rate-limits well inside demo traffic,
// and a judge reloading the page must not exhaust the quota. Same TTL bucket as the
// fan-out cache, so raw data and its normalisation never drift apart. No database.
const TTL_MS = Number(process.env.CROSSCHECK_CACHE_TTL_MS ?? 5 * 60_000);
const cache = new Map<string, NormaliseOutcome[]>();

export async function normaliseAllCached(ticker: string, sources: SourceResult[]) {
  const key = `${ticker.toUpperCase()}@${Math.floor(Date.now() / TTL_MS)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const out = await normaliseAll(sources);
  // Only cache when nothing failed transiently, so a rate-limited run does not pin a
  // false "unavailable" into the cache for the rest of the bucket.
  if (!out.some((o) => o.status === "unavailable" && /transient|HTTP 5|429/.test(o.reason))) {
    cache.set(key, out);
    if (cache.size > 50) cache.delete(cache.keys().next().value!);
  }
  return out;
}
