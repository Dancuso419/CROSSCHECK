/**
 * Liveness is the load-bearing check in this app — if it gets a false positive we feed
 * emptiness to the LLM and it invents. Cases are verbatim payloads from spike/raw/.
 * Run: npx tsx src/lib/liveness.test.ts
 */
import { deadReason, isAlive } from "./liveness";

const DEAD: [string, unknown][] = [
  ["derivatives_sentiment/long_short", { error: "" }],
  ["sentiment_index/current", { alt_me_error: "" }],
  ["global_data/forex", { error: "", rates: {} }],
  ["defi_analytics/tvl_rank", { error: "", url: "https://api.llama.fi/protocols" }],
  ["macro_indicators/fomc_news", { error: "Failed to fetch Fed RSS: " }],
  ["macro_indicators/multi_indicator", { cpi: { error: "" }, nonfarm_payrolls: { error: "" } }],
  ["news_feed/latest", [{ feed: "cointelegraph", error: "", items: [] }]],
  ["social_trending/trending", { platform: "weibo", provider: "all_failed", items: [] }],
  ["rates_yields/fed_funds", { effective_fed_funds: null, target_upper: null,
    note: "FOMC sets the target range; effective rate trades within it" }],
  ["empty array", []],
  ["null", null],
];

const ALIVE: [string, unknown][] = [
  ["crypto_derivatives/ticker_24h", { symbol: "BTC/USDT", last: 77342.55, high: 79890,
    low: 76046.58, volume: 19033.96, change_pct: 0.025, timestamp: 1789197280974 }],
  ["crypto_derivatives/klines", [{ timestamp: 1786320000000, open: 64901.59, high: 65391.14,
    low: 64826.78, close: 64982.01, volume: 1735.05 }]],
  ["news_feed with one real item", [{ feed: "coindesk", items: [{ title: "x", published: 1 }] }]],
];

let fail = 0;
for (const [name, p] of DEAD) {
  const r = deadReason(p);
  if (r === null) { console.error(`FAIL: "${name}" read as ALIVE but is dead`); fail++; }
  else console.log(`ok   dead  ${name}  -> ${r}`);
}
for (const [name, p] of ALIVE) {
  if (!isAlive(p)) { console.error(`FAIL: "${name}" read as DEAD: ${deadReason(p)}`); fail++; }
  else console.log(`ok   alive ${name}`);
}
console.log(fail ? `\n${fail} FAILED` : `\nall ${DEAD.length + ALIVE.length} cases passed`);
process.exit(fail ? 1 : 0);
