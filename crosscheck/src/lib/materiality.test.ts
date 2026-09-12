/**
 * The anti-manufactured-conflict guard. If this logic is wrong the product reports drama
 * that is not there, which 02-spec-crosscheck.md names as the failure mode a judge will
 * probe first. No LLM involved — these are pure functions.
 *
 * Run: npx tsx src/lib/materiality.test.ts
 */
import { agreementLevel, detectConflicts, internalDivergences, isTimeframeDivergence } from "./materiality";
import type { NormalisedSource } from "./schema";

const src = (
  source: string,
  direction: "bullish" | "bearish" | "neutral",
  timeframe: "intraday" | "days" | "weeks" | "months",
  internal_divergence: string | null = null,
): NormalisedSource => ({ source, direction, conviction: 0.5, timeframe, evidence: "x", internal_divergence });

let fail = 0;
const check = (name: string, cond: boolean, detail = "") => {
  if (!cond) {
    console.error(`FAIL ${name} ${detail}`);
    fail++;
  } else console.log(`ok   ${name}`);
};

// --- neutral is not a conflict -------------------------------------------------------
check(
  "neutral vs bullish is not a conflict",
  detectConflicts([src("market-intel", "bullish", "weeks"), src("news-briefing", "neutral", "days")]).length === 0,
);
check("all-neutral produces no conflicts", detectConflicts([
  src("macro-analyst", "neutral", "months"),
  src("technical-analysis", "neutral", "intraday"),
]).length === 0);

// --- genuine conflict, ranked by the matrix ------------------------------------------
const sharp = detectConflicts([
  src("sentiment-analyst", "bullish", "days"),
  src("technical-analysis", "bearish", "intraday"),
  src("market-intel", "bearish", "weeks"),
]);
check("3 directional sources yield 2 conflicts", sharp.length === 2, `got ${sharp.length}`);
check(
  "market-intel x sentiment-analyst ranks above sentiment x technical",
  sharp[0].materiality === "high" && sharp[0].sources.includes("market-intel"),
  JSON.stringify(sharp.map((c) => [c.sources, c.materiality])),
);
check(
  "sentiment x technical is rated low (both downstream of price)",
  sharp[1].materiality === "low",
  sharp[1].materiality,
);

// --- timeframe divergence ------------------------------------------------------------
check("months vs intraday is timeframe divergence", isTimeframeDivergence("months", "intraday"));
check("days vs intraday is NOT timeframe divergence", !isTimeframeDivergence("days", "intraday"));
const tfSources = [src("macro-analyst", "bearish", "months"), src("technical-analysis", "bullish", "intraday")];
const tf = detectConflicts(tfSources);
check("macro vs TA across timeframes is flagged as divergence", tf[0].is_timeframe_divergence);

// --- agreement level -----------------------------------------------------------------
const aligned = [src("market-intel", "bullish", "weeks"), src("macro-analyst", "bullish", "months")];
check("aligned sources report strong_agreement", agreementLevel(aligned, detectConflicts(aligned)) === "strong_agreement");

const allNeutral = [src("macro-analyst", "neutral", "months"), src("technical-analysis", "neutral", "intraday")];
check("all-neutral reports strong_agreement", agreementLevel(allNeutral, detectConflicts(allNeutral)) === "strong_agreement");

const hi = [src("market-intel", "bullish", "weeks"), src("macro-analyst", "bearish", "months")];
check("high-materiality same-ish timeframe is sharp_conflict", agreementLevel(hi, detectConflicts(hi)) === "sharp_conflict");

check(
  "timeframe divergence alone is NOT sharp_conflict",
  agreementLevel(tfSources, tf) === "mixed",
  agreementLevel(tfSources, tf),
);

// --- internal divergence -------------------------------------------------------------
const withInternal = [src("technical-analysis", "neutral", "intraday", "4h MACD crossed up against a bearish MA stack")];
check("internal divergence surfaces at medium", internalDivergences(withInternal)[0]?.materiality === "medium");
check("no internal divergence when null", internalDivergences([src("macro-analyst", "bullish", "months")]).length === 0);

console.log(fail ? `\n${fail} FAILED` : "\nall checks passed");
process.exit(fail ? 1 : 0);
