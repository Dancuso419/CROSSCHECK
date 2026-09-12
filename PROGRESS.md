# Progress

## Status

**Day:** 1 / 12  (2026-09-12)
**Deployed:** no
**Demo URL:** —
**Day-7 gate:** not yet assessed
**Spike:** Q1/Q2 done. **Q1 failed for 4 of 5 Skills** — the MCP's upstream data
fetching is dead on their side. Q3/Q4 not assessable with one live source.
**Decision taken:** build the pipeline against what is live, probe for recovery every 6h,
**hard gate Sept 15**. Still Crosscheck — not a pivot.

## Built

- [x] **Ingest** — fan-out to five Skills, parallel, cached, unavailability reported
- [~] **Analyse** — Pass 1 normalisation written and Zod-validated, **never executed**
      (no `ANTHROPIC_API_KEY` on this machine). Pass 2 conflict detection not started.
- [ ] **Report** — brief rendering not started
- [ ] Deployed, link verified in a private window

## Done this session

### Spike

- **Old blocker resolved.** `api.bitget.com` is still DNS-blocked locally, but the MCP
  serves Bitget OHLCV: `crypto_derivatives(action="klines", exchange="bitget")`. No
  non-Bitget data source introduced.
- `spike/mcp.py` — streamable-HTTP MCP client. No API key; server is `market-data-mcp`
  v1.26.0, so the handbook's no-auth claim is confirmed. Two gotchas: Cloudflare 403s
  urllib's default User-Agent, and responses are SSE not JSON.
- `spike/sweep.py` — Q1/Q2: 26 calls across every tool the five Skills use. Raw payloads
  in `spike/raw/`, status table in `spike/raw/_STATUS.txt`.
- `spike/ta.py` — rewritten to feed MCP klines into the `technical-analysis` Skill's own
  23-indicator Python engine (the Skill's own Template B path). Verified on 200 real 4h
  BTC candles. `python spike/ta.py selfcheck` is the regression check.
- `spike/probe.py` — recovery probe, one representative call per Skill plus a ccxt
  control. Appends to `spike/raw/_RECOVERY.log`. **Scheduled task `crosscheck-mcp-probe`
  runs it every 6h until Sept 16.** Remove with:
  `Unregister-ScheduledTask -TaskName 'crosscheck-mcp-probe' -Confirm:$false`

### App (`crosscheck/`, Next.js 16 + React 19 + Tailwind 4 + Zod 4)

- `lib/mcp.ts` — MCP client. **Unique JSON-RPC ids and one session per Skill.** Sharing
  an id across concurrent calls on one session made the transport return one call's reply
  for another: a `defi_analytics` call came back holding another call's kline data and was
  scored as a healthy source. Silent cross-contamination, caught only because the payload
  looked wrong. Per-call timeout 12s, because dead upstreams hang 16–41s.
- `lib/liveness.ts` + 14-case test — the load-bearing check. The MCP answers HTTP 200 with
  `{"error": ""}` on failure, so liveness is explicit and pinned to real observed payloads.
  Includes the all-null-plus-static-prose shape that produced a false "recovered" reading
  in the first version of the probe.
- `lib/indicators.ts` + test — TS port of the Skill's Python engine, **all 10 values match
  it exactly**. Two conventions had to be matched: Bollinger uses sample stdev (ddof=1),
  and ATR is `EMA(TR, 14)` including the first bar, not Wilder smoothing.
- `lib/skills.ts` — the five Skills, their tools (grepped from each installed SKILL.md,
  not guessed), what each measures, and each one's independence from price action.
- `lib/fanout.ts` — parallel, cached by ticker + time bucket, in-memory only.
  Degradation is a returned result, not an error path.
- `lib/normalise.ts`, `lib/schema.ts`, `lib/llm.ts` — Pass 1 per-Skill, Zod-validated,
  one retry then mark the source unavailable. LLM over plain `fetch`, no SDK dependency.
- `app/api/crosscheck/route.ts` + `app/page.tsx` — shows every MCP call and its latency,
  and an explicit "N of 5 sources reporting" count. Fan-out is visible, not behind a
  spinner. Ticker input is validated; the route is read-only.
- `BUILD.md` written. First commit made; `.env.local` verified gitignored beforehand.

### Verified working end to end

`POST /api/crosscheck {"ticker":"BTC"}` → 200, `1/5 reporting`, cache hit on repeat (21ms).
Live TA divergence across timeframes, which is real product material even with one source:

| | 4h | 1d |
|---|---|---|
| RSI(14) | 42.89 | 55.35 |
| MACD hist | +40.06 (crossed up 2 bars ago) | −751.05 |
| MA7 vs MA99 | 77313 < 78659 | 78197 > 67115 |

## Not built / known broken

- **BLOCKER: the MCP's upstream fetching is dead except for exchange data.** 2 of 26 calls
  returned real data, both ccxt-backed (`crypto_derivatives`, `technical_analysis`). Dead:
  CoinGecko, Yahoo, FRED, all 44 RSS feeds, alternative.me (Fear & Greed), Binance futures,
  DeFiLlama, DexScreener, mempool.space, Weibo, AKShare.
  - **Not our network.** `bitget-signal` is `type: "http"` → remote server; all fetching is
    server-side. **A Vercel deploy will not fix it.**
  - **Not a region block.** Chinese upstreams fail too (`weibo: "all_failed"`; `cn_market`
    aborted after 300s).
  - Tool dispatch is fine — `news_feed action="sources"` returns its static 44-feed list.
  - Confirmed persistent across retries ~25 min apart.
- **Per-Skill availability:** `technical-analysis` working (via klines); `macro-analyst`,
  `market-intel`, `news-briefing`, `sentiment-analyst` all dead.
- **Pass 1 has never actually run.** No `ANTHROPIC_API_KEY` is set on this machine, so the
  normalisation prompt, the Zod schema and the retry path are untested against a real
  completion. First thing to do once a key exists.
- **Conviction stability is unassessed.** 05-prompts.md says drop the field if it is noise.
  That test needs more than one live source.
- **The MCP's own `technical_analysis` tool returns wrong numbers. Do not use it.** Verified
  against our engine and an independent hand calculation on the same 200 candles: Bollinger
  `upper`/`lower` swapped (upper 76206 < lower 79353), `bandwidth` sign-flipped, `position`
  `"above_upper"` at `pct_b` 0.35; MACD signal line wrong (+21.95 vs true −477.57), so it
  reported `"death_cross"` on a bar that had crossed **up**. It also emits
  `"verdict": "STRONG BEARISH"`, which our no-verdict rule forbids anyway.
- **Equities are not supported — the spec's AAPL headline must change.** All five Skills are
  crypto-only; `macro-analyst` is framed as "is macro a tailwind for **BTC**?" `market-intel`
  and `sentiment-analyst` have no equity path even in principle (on-chain flows, DeFi TVL,
  crypto Fear & Greed, crypto futures). Only `macro-analyst` and `news-briefing` could touch
  a stock and both are dead. The spec's own example applies crypto concepts to AAPL
  ("ETF flow direction Thursday", "net inflows").
- Local network: exchange domains and `mempool.space` are blocked from this machine;
  **everything else is reachable** (CoinGecko, alternative.me, Yahoo, FRED, cointelegraph,
  api.llama.fi). The local box and the remote MCP are near-exact inverses.
- The app lives in `crosscheck/`, not the repo root: npm rejects a package name derived
  from the folder `BITGET VETT`. **Vercel Root Directory must be set to `crosscheck`.**
- `crosscheck/CLAUDE.md` + `AGENTS.md` are create-next-app boilerplate, not ours.
- Port 3000 is occupied by another project's dev server (Hindsight). Use `-p 3100` locally.
- shadcn/ui not installed yet — deferred until the brief needs real components.

## Problems hit and how they were fixed

1. `pandas`/`numpy` missing → installed. Fixed.
2. `api.bitget.com` DNS-blocked → klines from the MCP. Fixed.
3. urllib 403 from Cloudflare → send a User-Agent. Fixed.
4. MCP responses are SSE not JSON → parse `data:` lines. Fixed.
5. Probe false-positived "recovered" on an all-null payload with a static `note` string
   → liveness now requires a numeric or collection value. Fixed, and pinned in a test.
6. Shared JSON-RPC id + shared session → replies crossed between calls. Unique ids, one
   session per Skill. Fixed.
7. ATR mismatched the Skill engine → it uses `EMA(TR,14)` including bar 0, not Wilder.
   Fixed; Wilder yields 842.34, which is the buggy MCP tool's value.
8. Windows `ENOTEMPTY` corrupted `node_modules` twice → clean reinstall. Fixed.
9. `create-next-app` created a nested git repo → removed, one repo at the root. Fixed.
10. MCP upstream fetch dead for 4 of 5 Skills → **unfixed, not fixable by us.**

## The decision and the gate

Building the pipeline now, because fan-out → normalise → detect → brief is source-agnostic:
if the MCP recovers, the fan-out simply starts returning five and nothing is rewritten.
Building against a real 4-of-5 outage also means the degradation path required by
03-skill-integration.md is built first rather than retrofitted.
`01-bitget-tools.md:40` supports this: *"Integrating 2–3 Skills well beats name-dropping all 5."*

**Gate — Sept 15, end of day.** If four Skills are still dead, choose between shipping
Crosscheck honestly degraded and falling back to **Hindsight** (`01-bitget-tools.md:31`:
it uses `technical-analysis`, the one live Skill). **Not Weekend Desk** — `01-bitget-tools.md:30`
says it leans on `news-briefing` + `macro-analyst`, the two most thoroughly dead Skills.

**Not doing:** substituting direct CoinGecko/Yahoo/FRED/RSS calls for the dead tools.
Reachable from this machine, but it guts the Skill-integration story, which is graded.

## Stack

- Next.js 16 + TypeScript + Tailwind 4 + Zod 4, in `crosscheck/`. shadcn/ui pending.
- Models: Pass 1 `claude-sonnet-5` (extraction, five in parallel), Pass 2 `claude-opus-5`
  (reasoning). Both overridable by env var. Neither pass has run yet.
- APIs / Skills: bitget-signal installed (5 Skills). **1 of 5 has live data.**

## Validation data

- Testers recruited: 0
- Testers run: 0

## Next session starts with

1. `cat spike/raw/_RECOVERY.log` — did the MCP recover?
2. Put `ANTHROPIC_API_KEY` in `crosscheck/.env.local` and run Pass 1 for the first time.
   It is written but unproven.
3. Then Pass 2 (conflict detection + materiality ranking) using the matrix in
   03-skill-integration.md, plus the four test cases in 05-prompts.md — case 2
   (strong agreement, must not invent conflict) matters most.
4. Change the spec's AAPL demo case to a crypto major.
