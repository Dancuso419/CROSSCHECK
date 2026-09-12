/**
 * Pass 1 of two: normalise one Skill's raw output into a comparable object.
 *
 * Deliberately per-Skill, not one pass over all five (05-prompts.md): one malformed
 * response cannot then corrupt the others, and a pass that sees only one source has no
 * opportunity to invent conflict. Pass 2 never sees raw data, only these objects —
 * that separation is what stops fabricated disagreement.
 */
import { MODEL_EXTRACT, askJson, extractJson } from "./llm";
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
  "internal_divergence": string | null
}

Rules:
- "evidence" must quote specific figures, indicators, or events from the raw output.
  Never generalise. If the raw output gives no specifics, evidence is "none stated".
- Return "neutral" freely. Do not force a direction the source did not express.
- "conviction" reflects how strongly THIS SOURCE states its view — not how right it is.
- "internal_divergence": if the source contains sub-signals pointing different ways
  (common for technical indicator sets), describe it. Otherwise null.
- Do not incorporate outside knowledge. Only what is in the raw output.`;
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
    }
  }
  return { skill: src.skill, status: "unavailable", reason: `normalisation failed: ${lastErr}` };
}

export const normaliseAll = (sources: SourceResult[]) => Promise.all(sources.map(normaliseSource));
