/**
 * Pins this TS engine to the `technical-analysis` Skill's own Python engine.
 * Ground truth = `python spike/ta.py spike/raw/_klines_only.json BTC/USDT 4h`, run
 * 2026-09-12 over the same 200 candles this test loads.
 * Run: npx tsx src/lib/indicators.test.ts
 */
import { readFileSync } from "node:fs";
import { computeIndicators, type Candle } from "./indicators";

const candles: Candle[] = JSON.parse(readFileSync("../spike/raw/_klines_only.json", "utf8"));
const i = computeIndicators(candles);

// from ta.py output (spike/raw/technical-analysis_BTC.json)
const EXPECT: [string, number, number, number][] = [
  // name, actual, expected, tolerance
  ["MACD DIF", i.macd.dif, -453.4345, 0.01],
  ["MACD DEA", i.macd.dea, -477.573, 0.01],
  ["RSI_14", i.rsi.value, 42.1318, 0.01],
  ["BOLL UPPER", i.boll.upper, 79353.0625, 0.01],
  ["BOLL MIDDLE", i.boll.middle, 77781.6685, 0.01],
  ["BOLL LOWER", i.boll.lower, 76210.2745, 0.01],
  ["BOLL PCT_B", i.boll.pctB, 0.3544, 0.001],
  ["BOLL BANDWIDTH", i.boll.bandwidth, 0.0404, 0.001],
  ["ATR", i.atr.atr, 849.7405, 0.01],
  ["NATR", i.atr.natr, 1.0989, 0.001],
];

let fail = 0;
for (const [name, got, want, tol] of EXPECT) {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) fail++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name.padEnd(16)} got ${got.toFixed(4).padStart(12)}  want ${want.toFixed(4).padStart(12)}`);
}
// the MCP tool claimed "death_cross" here; the Skill engine says it crossed UP 1 bar ago.
console.log(`\nMACD cross: up ${i.macd.crossedUpBarsAgo} bars ago, down ${i.macd.crossedDownBarsAgo} bars ago (Skill engine: up 1, down 42)`);
console.log(fail ? `\n${fail} FAILED` : `\nall ${EXPECT.length} values match the Skill's Python engine`);
process.exit(fail ? 1 : 0);
