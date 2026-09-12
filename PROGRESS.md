# Progress

## Status

**Day:** 1 / 12  (2026-09-12)
**Deployed:** no
**Demo URL:** —
**Day-7 gate:** not yet assessed
**Spike:** Q1 run. **FAILED for 4 of 5 Skills.** Q3/Q4 not attempted — no data to
normalise or compare. Decision required before any app code.

## Built

- [ ] Ingest
- [ ] Analyse
- [ ] Report
- [ ] Deployed, link verified in a private window

## Done this session

- **Old blocker resolved.** `api.bitget.com` is still DNS-blocked locally, but the MCP
  serves Bitget OHLCV: `crypto_derivatives(action="klines", exchange="bitget")`. No
  non-Bitget data source introduced.
  - `spike/ta.py` rewritten: takes klines from the MCP and runs the
    `technical-analysis` Skill's own 23-indicator engine over them (the Skill's own
    Template B "local data" path). Verified on 200 real 4h BTC candles. `python
    spike/ta.py selfcheck` is the regression check.
  - Worth knowing: the `technical-analysis` Skill calls **no MCP tool at all** — it is
    pure local Python + `api.bitget.com`. That is why it alone was blocked.
- **`spike/mcp.py`** — minimal streamable-HTTP MCP client, urllib only. This is the path
  the Next.js API routes will use. Two gotchas found:
  - Cloudflare 403s urllib's default User-Agent; must send one.
  - Responses are SSE (`text/event-stream`), not plain JSON.
  - No API key, no account. Server identifies as `market-data-mcp` v1.26.0. Handbook
    claim confirmed.
- **Q1/Q2 sweep** (`spike/sweep.py`): 26 calls covering every MCP tool the five Skills
  depend on. Raw payloads in `spike/raw/`, status table in `spike/raw/_STATUS.txt`.

## Not built / known broken

- **BLOCKER (new, worse): the MCP's upstream data fetching is dead except for exchange
  data.** 2 of 26 calls returned real data. Both ccxt-backed (`crypto_derivatives`,
  `technical_analysis`). Every other upstream fails: CoinGecko, Yahoo, FRED, 44 RSS
  feeds, alternative.me (Fear & Greed), Binance futures, DeFiLlama, DexScreener,
  mempool.space, Weibo, AKShare.
  - **Not our network.** `bitget-signal` is `type: "http"` → remote server at
    `datahub.noxiaohao.com`. All fetching happens server-side. **A Vercel deploy will
    not fix this** — it calls the same MCP.
  - **Not a region block.** Chinese upstreams fail too (`weibo: provider:
    "all_failed"`, `cn_market` aborted after 300s silence).
  - Tool dispatch itself is fine (`news_feed action="sources"` returns its static
    44-feed list). It is specifically outbound fetch.
  - Failures are silent: mostly `{"error": ""}` with an empty message, so a naive
    client reads them as success. Any code we write must treat empty-string `error`
    and empty `items` as failure.
  - Dead calls burn **16–41s** each before giving up; one exceeded 120s. Live ccxt
    calls are ~1s.
- **Per-Skill data availability:**

  | Skill | MCP tools it needs | Status |
  |---|---|---|
  | `technical-analysis` | none (local engine) + klines | **working** via `ta.py` |
  | `macro-analyst` | macro_indicators, rates_yields, cross_asset, global_assets, global_data, cn_market, tradfi_news | **all dead** |
  | `market-intel` | crypto_market, defi_analytics, dex_market, network_status, news_feed, derivatives_sentiment | **all dead** |
  | `news-briefing` | news_feed, social_trending, tradfi_news, derivatives_sentiment | **all dead** |
  | `sentiment-analyst` | sentiment_index, derivatives_sentiment | **all dead** |

  One source of five has data. Crosscheck compares five views; it cannot compare one.
- **The MCP's own `technical_analysis` tool returns wrong numbers.** Do not use it.
  Verified against `ta.py` and an independent hand calculation on the same 200 candles:
  - Bollinger `upper` and `lower` are **swapped** (upper 76206 < lower 79353);
    `bandwidth` sign-flipped; `position` reported `"above_upper"` at `pct_b` 0.35 for
    every symbol tested.
  - MACD signal line wrong (`+21.95` vs true `-477.57`), so `histogram` sign flips and
    it reported `"death_cross"` on a bar that had **crossed up** one bar earlier.
  - It also emits `"verdict": "STRONG BEARISH"` / `bull_signals` / `bear_signals`. Our
    no-verdict rule means we would have to strip that anyway.
  - The Skill's own local engine is correct and richer (23 indicators, full series,
    `last_cross_up_bars_ago` / `trend_streak` context). Use the Skill, not the tool.
- **Equities are not supported.** Spec's headline demo is AAPL; it has to change.
  - All five Skill descriptions are crypto-only. `macro-analyst` is explicitly framed
    as "is the macro backdrop a tailwind for **BTC**?"
  - `market-intel` has no equity path even in principle: on-chain flows, DeFi TVL, DEX,
    crypto-ETF flows. `sentiment-analyst` likewise: Fear & Greed is a crypto-only
    index, long/short ratios are crypto futures.
  - Only `macro-analyst` (`global_assets`, `cn_market`) and `news-briefing` (keyword
    filter over CNBC feeds) could touch an equity — and both tools are dead.
  - The spec's own AAPL example applies crypto concepts to a stock ("ETF flow direction
    Thursday", "net inflows"), which does not hold up.
- Local network: exchange domains (`api.bitget.com`, `api.binance.com`) and
  `mempool.space` are DNS/connect-blocked from this machine. **Everything else is
  reachable locally** — CoinGecko, alternative.me, Yahoo, FRED, cointelegraph,
  api.llama.fi all answer. The local box and the remote MCP are near-exact inverses.

## Problems hit and how they were fixed

1. `pandas`/`numpy` missing → `pip install pandas numpy`. Fixed.
2. `api.bitget.com` DNS-blocked → klines now come from the MCP. Fixed.
3. urllib 403 from Cloudflare → send a `User-Agent`. Fixed.
4. MCP responses are SSE not JSON → parse `data:` lines. Fixed.
5. MCP upstream fetch dead for 4 of 5 Skills → **unfixed, not fixable by us.**

## Decision needed (blocks all build work)

Three options, no build until one is picked:

1. **Wait / retry.** The failure may be a transient outage on their server (v1.26.0
   dispatches fine, ~8 unrelated upstreams all fail at once). Re-run `python
   spike/sweep.py` before committing. Cheap, but burns days against a Sept 20 date with
   no control over the outcome.
2. **Fall back to Weekend Desk.** Day 1 is the right day to do this. Preserves the
   deadline.
3. **Reduce Crosscheck to what the live data supports** — internal divergence *within*
   `technical-analysis` across timeframes and indicators (4h says death cross, 1d says
   golden cross; the 23-indicator set disagreeing with itself). Honest and demoable, but
   it is one Skill, not five, and "number of Skill integrations" is an explicit judging
   criterion. Significantly weaker entry.

**Not doing:** substituting direct CoinGecko/Yahoo/FRED/RSS calls for the dead tools.
Reachable from here, but it guts the Skill-integration story, which is the thing being
graded.

## Stack

- Frameworks: Next.js + TypeScript + Tailwind + shadcn/ui (not yet scaffolded)
- Models used and what for: Claude Opus 5 — build; normalisation + conflict passes TBD
- APIs / Skills integrated: bitget-signal installed (5 Skills). **1 of 5 has live data.**

## Validation data

- Testers recruited: 0
- Testers run: 0

## Next session starts with

Re-run `python spike/sweep.py` to see whether the MCP upstream recovered, then take the
decision above. Do not scaffold the app first.
