# Crosscheck

**A multi-source disagreement desk.** Ask about one ticker. Crosscheck queries all five
`bitget-signal` research Skills, turns each answer into a comparable reading, and shows
where they disagree, which disagreements matter, and what would settle them. It never
issues a verdict.

- **Demo, no login:** https://crosscheck-two.vercel.app
- **Walkthrough video:** https://x.com/Dancuso419/status/2099583511644504198
- Bitget AI Base Camp S2 · AI Trading Desk track · Open Theme

## Why

Five research sources on one stock rarely agree. A macro note says rates are a headwind;
the chart says the trend is up; the news is upbeat. Most AI tools blend those into one
confident sentence, which throws away the most useful thing on the page: the contradiction.
Crosscheck keeps it, ranks it, and names the observable that would resolve it.

## How it works

Four steps, and only two of them use a model.

1. **Fan out.** One ticker goes to the five Skills in parallel over the Bitget MCP
   (`https://datahub.noxiaohao.com/mcp`). Every call, its status and its latency are shown.
2. **Normalise (LLM, Pass 1).** Each Skill's raw output becomes one object: direction,
   conviction, horizon, the evidence it cites, and any split inside the source itself.
   One call per source, validated with Zod; a malformed answer fails loudly.
3. **Detect and rank (code).** `crosscheck/src/lib/materiality.ts` decides which pairs
   actually conflict and what each conflict is worth. Sentiment against technicals is
   near-worthless (both come from the same candles); flows against macro is not.
   Opposite views two or more horizons apart are marked as timeframe divergence, which
   can both be right. **No model is ever asked to find disagreement.**
4. **Brief (LLM, Pass 2).** The model explains only the conflicts code handed it: what
   would have to be true for each side, and one thing to watch that settles it.

| Skill | What it reads | For a US stock |
|---|---|---|
| macro-analyst | rates, macro releases, cross-asset correlation | correlation vs S&P, Nasdaq, dollar, 10y |
| market-intel | on-chain flows, stablecoins, market structure | reported unavailable, with the reason |
| news-briefing | headlines and narrative | `tradfi_news` for the ticker |
| sentiment-analyst | fear and greed, positioning | positioning on the contract |
| technical-analysis | 4h and 1d Bitget candles, 23-indicator engine | Bitget tokenized-stock candles |

US stocks (AAPL, NVDA, TSLA, MSFT, META, SPY, QQQ and others) run on Bitget's tokenized
contracts; crypto majors (BTC, ETH, SOL) are supported too.

## Rules the product enforces

- **No verdict.** No buy, sell or hold, no direction call, no price target.
- **No manufactured conflict.** If sources agree, the brief says so.
- **No hidden gaps.** A source that fails is named, with its reason.
- **Read-only.** Nothing in this repo can place an order.

## Three modes, always labelled

| Mode | Data | Brief |
|---|---|---|
| Live | queries the Skills now | written on request |
| Recorded | real market data captured for AAPL, NVDA, TSLA, BTC, ETH, SOL | written ahead of time by the same pipeline |
| Illustrative | four constructed cases, the same fixtures the tests assert against | written ahead of time |

Recorded exists because, during the build, four of the five Skills' upstream data was down
on the MCP side (only exchange data answered). That is documented with evidence in
[`PROGRESS.md`](PROGRESS.md). A recording is never shown as live.

## Run it

```bash
cd crosscheck
npm install
cp .env.local.example .env.local   # add DEEPSEEK_API_KEY (and optionally GEMINI_API_KEY)
npm run dev
```

No Bitget account or API key is needed. Tests, deploy steps and every env var are in
[`BUILD.md`](BUILD.md).

## Repo map

- `crosscheck/`: the Next.js app (TypeScript, Tailwind, Zod), deployed on Vercel
  - `src/lib/fanout.ts`, `mcp.ts`, `liveness.ts`: parallel MCP calls and silent-failure detection
  - `src/lib/indicators.ts`: TS port of the technical-analysis Skill's engine, pinned to its Python
  - `src/lib/normalise.ts`, `materiality.ts`, `conflicts.ts`: the two passes and the ranking
  - `scripts/cases.ts`: the Pass 2 regression suite
- `spike/`: the initial feasibility spike, the recovery probe and the capture script
- `03-skill-integration.md`, `05-prompts.md`: design notes for the Skill mapping and prompts
- `PROGRESS.md`, `BUILD.md`, `DESIGN.md`: build log, operations, visual design
