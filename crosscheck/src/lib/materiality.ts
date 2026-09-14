/**
 * Conflict detection and materiality ranking — deterministic, no LLM.
 *
 * 02-spec-crosscheck.md: "Anyone can count disagreements. The product judgment is which
 * disagreements matter." That judgment is encoded here rather than delegated, for two
 * reasons:
 *
 *   1. The matrix in 03-skill-integration.md is a lookup, not a reasoning task. Asking a
 *      model to re-derive it each call buys nothing and drifts.
 *   2. The product's worst failure mode is manufactured conflict. A model asked to find
 *      disagreement will invent it. If code decides which pairs are even candidates, the
 *      model cannot promote agreement into drama — it only explains pairs it is handed.
 */
import type { NormalisedSource } from "./schema";
import type { SkillName, Timeframe } from "./skills";

export type Materiality = "high" | "medium" | "low";

/** From the materiality matrix in 03-skill-integration.md. Keys are sorted pairs. */
const MATRIX: Record<string, { materiality: Materiality; why: string }> = {
  "macro-analyst|market-intel": {
    materiality: "high",
    why: "Two genuinely independent views: positioning versus structure.",
  },
  "market-intel|sentiment-analyst": {
    materiality: "high",
    why: "Smart money against the crowd, the classic informative divergence.",
  },
  "market-intel|technical-analysis": {
    materiality: "high",
    why: "Capital flow against price action; flows often lead.",
  },
  "macro-analyst|news-briefing": {
    materiality: "medium",
    why: "A catalyst may or may not shift the structural view.",
  },
  "macro-analyst|technical-analysis": {
    materiality: "medium",
    why: "Different timeframes, so often not a real conflict.",
  },
  "news-briefing|sentiment-analyst": {
    materiality: "medium",
    why: "Tests whether a narrative has been absorbed by the crowd.",
  },
  "news-briefing|technical-analysis": {
    materiality: "medium",
    why: "Price may already reflect the news.",
  },
  "sentiment-analyst|technical-analysis": {
    materiality: "low",
    why: "Both derive from the same candles. Their disagreement is usually noise, and their agreement is worthless as confirmation.",
  },
};

export const pairKey = (a: string, b: string) => [a, b].sort().join("|");

const ORDER: Record<Timeframe, number> = { intraday: 0, days: 1, weeks: 2, months: 3 };

/**
 * Two sources pointing opposite ways on timeframes two or more steps apart are usually
 * not contradicting each other — macro bearish over months and TA bullish over days can
 * both be true (03-skill-integration.md, "Timeframe rule"). Adjacent buckets are close
 * enough that the disagreement is treated as real.
 */
export const isTimeframeDivergence = (a: Timeframe, b: Timeframe) => Math.abs(ORDER[a] - ORDER[b]) >= 2;

export type ConflictCandidate = {
  sources: [string, string];
  materiality: Materiality;
  why: string;
  is_timeframe_divergence: boolean;
  directions: [string, string];
  timeframes: [Timeframe, Timeframe];
};

/**
 * Only bullish-versus-bearish counts. A neutral source is the absence of a call, not a
 * disagreement — treating neutral as conflict is the cheapest way to manufacture drama,
 * and Pass 1 is instructed to return neutral freely.
 */
export function detectConflicts(sources: NormalisedSource[]): ConflictCandidate[] {
  const out: ConflictCandidate[] = [];
  for (let i = 0; i < sources.length; i++) {
    for (let j = i + 1; j < sources.length; j++) {
      const a = sources[i];
      const b = sources[j];
      const opposed =
        (a.direction === "bullish" && b.direction === "bearish") ||
        (a.direction === "bearish" && b.direction === "bullish");
      if (!opposed) continue;

      const entry = MATRIX[pairKey(a.source, b.source)];
      out.push({
        sources: [a.source, b.source],
        // An unlisted pair is not silently upgraded; unknown means low.
        materiality: entry?.materiality ?? "low",
        why: entry?.why ?? "Pair not in the materiality matrix; treated as low until rated.",
        is_timeframe_divergence: isTimeframeDivergence(a.timeframe, b.timeframe),
        directions: [a.direction, b.direction],
        timeframes: [a.timeframe, b.timeframe],
      });
    }
  }
  const rank: Record<Materiality, number> = { high: 0, medium: 1, low: 2 };
  return out.sort((x, y) => rank[x.materiality] - rank[y.materiality]);
}

/**
 * Internal divergence inside one source is its own signal, rated medium by the matrix:
 * "an indicator set at war with itself is meaningful."
 */
export const internalDivergences = (sources: NormalisedSource[]) =>
  sources
    .filter((s) => s.internal_divergence)
    .map((s) => ({ source: s.source, materiality: "medium" as const, detail: s.internal_divergence!, pulls: s.internal_pulls ?? [] }));

/** Agreement level is counted, not judged. */
export function agreementLevel(
  sources: NormalisedSource[],
  conflicts: ConflictCandidate[],
): "strong_agreement" | "mixed" | "sharp_conflict" {
  if (conflicts.some((c) => c.materiality === "high" && !c.is_timeframe_divergence)) return "sharp_conflict";
  if (conflicts.length === 0) {
    const directional = sources.filter((s) => s.direction !== "neutral");
    // All neutral, or everyone pointing the same way, is agreement either way.
    if (directional.length === 0 || new Set(directional.map((s) => s.direction)).size === 1) {
      return "strong_agreement";
    }
  }
  return "mixed";
}

export const KNOWN_PAIRS = Object.keys(MATRIX) as `${SkillName}|${SkillName}`[];

/** The matrix as the page renders it. Exported rather than retyped in the UI so the
 *  published table and the ranking that actually runs can never disagree. */
export const MATERIALITY_TABLE = Object.entries(MATRIX)
  .map(([pair, v]) => {
    const [a, b] = pair.split("|");
    return { a, b, ...v };
  })
  .sort((x, y) => ({ high: 0, medium: 1, low: 2 })[x.materiality] - ({ high: 0, medium: 1, low: 2 })[y.materiality]);
