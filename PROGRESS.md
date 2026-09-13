# Progress

## Status

**Day:** 1 / 12  (2026-09-12)
**Deployed:** no
**Demo URL:** —
**Day-7 gate:** not yet assessed
**Spike:** Q1/Q2 done. **Q1 failed for 4 of 5 Skills** — the MCP's upstream data
fetching is dead on their side. Q3 answered for the one live source (direction stable,
conviction not noise). Q4 not assessable with one live source.
**Decision taken:** build the pipeline against what is live, probe for recovery every 6h,
**hard gate Sept 15**. Still Crosscheck — not a pivot.

## Built

- [x] **Ingest** — fan-out to five Skills, parallel, cached, unavailability reported
- [x] **Analyse, Pass 1** — normalisation running against live data on Gemini,
      Zod-validated, cached. Verified stable across 5 repeat runs and across two models.
- [x] **Analyse, Pass 2** — conflict detection + materiality ranking. Deterministic in
      code; the model only explains conflicts it is handed. All four cases from
      05-prompts.md pass on five different model configurations.
- [x] **Report** — brief wired into the route and rendered: consensus summary, conflicts
      ranked by materiality with both cases and a named resolving observable, internal
      divergence, and the gaps named. Verified end to end on BTC and ETH.
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
  Results cached per ticker + time bucket, same TTL as the fan-out so raw data and its
  normalisation cannot drift apart. A rate-limited run is deliberately **not** cached, so
  a transient 429 cannot pin a false "unavailable" for the rest of the bucket.
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
  - Confirmed persistent across retries ~25 min apart, and still dead 28h later.
  - **Our endpoint is verified correct, not guessed.** `@bitget-ai/bitget-signal` 1.2.0
    (latest, published 15 Jun 2026) is what we run, and its own CHANGELOG says: "The HTTP
    MCP backend URL is unchanged (`https://datahub.noxiaohao.com/mcp`)" and "Unchanged: The
    `bitget-signal` MCP backend URL... No API key required." The latest package tarball
    contains that same URL and no other. There is no newer endpoint to move to — the
    outage is Bitget's.
  - Canonical repo is now `Bitget-AI/bitget-signal` (moved out of the monorepo). The URL
    printed in Bitget's own shipped SKILL.md headers, `bitget-official/agent-hub`, 404s.
- **Per-Skill availability:** `technical-analysis` working (via klines); `macro-analyst`,
  `market-intel`, `news-briefing`, `sentiment-analyst` all dead.
- **Free-tier Gemini rate limits are a live demo risk.** One five-source fan-out exhausts
  `gemini-3.8-flash`'s free RPM (observed 429 with `RetryInfo: 34s`). Mitigated three ways:
  Pass 1 defaults to `gemini-2.5-flash`, which has headroom; results are cached; and the
  backoff honours the server's own `retryDelay` instead of guessing. Still worth a paid key
  before judging — a judge reloading the page repeatedly is exactly the failure case.
- **Pass 1 is only proven against one source, the most structured one.** The four
  prose-heavy Skills are the hard cases for both `direction` and `conviction` and remain
  untested. Do not assume the prompt generalises.
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
10. `.env.local` parsed as empty: the file is CRLF, and JS regex `.` does not match `
`,
    so every line failed to match. Split on `/
?
/`. Fixed.
11. Pass 1 truncated mid-JSON at 2048 output tokens → these models spend reasoning tokens
    from the same output budget. Raised to 8192. Fixed.
12. A real key was nearly put in `.env.local.example`, which is deliberately **not**
    gitignored so the template ships. Caught before any commit; the template now carries a
    loud warning and `.env.local` was created ready to fill. Nothing leaked.
13. MCP upstream fetch dead for 4 of 5 Skills → **unfixed, not fixable by us.**

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
- Models: **DeepSeek `deepseek-flash` for both passes**, chosen by measurement (table below).
  Gemini stays fully wired as a fallback - set `MODEL_EXTRACT`/`MODEL_REASON` to a
  `gemini-*` id and the provider switches automatically. Pinned ids, never `-latest`
  aliases, so a judged demo stays reproducible. Claude Opus 5 does the build.
  The form's mandatory "Role of the LLM in Your Project" field should say: DeepSeek
  `deepseek-flash` for schema extraction (Pass 1) and conflict explanation (Pass 2); no
  model decides what counts as a conflict or how material it is - that is deterministic
  code. Claude Opus 5 for development.

## Model comparison - measured, with an honest caveat

Same four-case Pass 2 suite (`scripts/cases.ts`) and Pass 1 stability harness
(`scripts/stability.ts`), identical inputs, temperature 0:

| config | correctness | Pass 2 latency (n=1) |
|---|---|---|
| `deepseek-flash` (real id) | 4/4 | 2.6-21.4s |
| `deepseek-v4-pro` (real id) | 4/4 | 4.9-64.8s |
| `deepseek-chat` (legacy alias) | 4/4 | 1.6-6.2s |
| `deepseek-reasoner` (legacy alias) | 4/4 | 3.9-31.0s |
| `gemini-3.5-flash` | 4/4 | 7.5-14.0s |

**The robust finding: every configuration passes all four cases, case 2 included.** The
guard against manufactured conflict is the structure in `materiality.ts`, not the model,
so provider choice cannot silently break the product's core promise.

**Caveat on the latency column - it is n=1 per model and too noisy to rank on.** The same
case 1 input took 6.2s on one DeepSeek id and 21.4s on another that should be comparable.
An earlier version of this file claimed DeepSeek was "2-4x faster than Gemini"; that was
over-claimed from single samples. Only the `deepseek-v4-pro` gap (46-65s on two cases) is
clearly beyond noise, which is why the flash tier is the default for an interactive demo.

**Model ids come from the API, not from memory.** `GET /models` on the DeepSeek key lists
exactly `deepseek-flash` and `deepseek-v4-pro`. `deepseek-chat` and `deepseek-reasoner`
still respond but are **not listed** - undocumented legacy aliases pointing at an unknown
target. The first comparison run used those aliases, which is exactly the
re-pointed-underneath-you risk that pinning is supposed to avoid. Both providers now have a
lister: `scripts/list-deepseek-models.mjs` and `scripts/list-models.mjs`.

Quality note worth keeping: `deepseek-v4-pro` writes the best prose of the five. On the
timeframe-divergence case it volunteered "Because this is a timeframe divergence, no
contradiction needs resolving", which is precisely the nuance 03-skill-integration.md asks
for. It is the right choice if a brief is ever generated ahead of time rather than on
request.

Free-tier reliability was the clearest split: Gemini's pro line is unusable on a new key
(`gemini-2.5-pro` 404s "no longer available to new users", `gemini-3.1-pro-preview` 429s
through four retries while honouring its own 12-35s `retryDelay`), and one five-source
fan-out exhausts `gemini-3.8-flash`'s RPM. DeepSeek hit no limits at all.

## Validation data

- Testers recruited: 0
- Testers run: 0

## SPIKE Q3 — answered, with a caveat

`npx tsx scripts/stability.ts 5`, identical cached input, temperature 0:

- `direction` **stable** — `neutral` on all 5 runs, and `neutral` again on a second model.
- `conviction` **not noise** — 0.35, 0.35, 0.40, 0.40, 0.35 (spread 0.05). **Keep the field.**
- `evidence` prose varies in length (324-415 chars) but always cites figures.

Caveat: one source, and the most structured one. Re-run this the moment a second Skill
revives — the prose-heavy sources are where `direction` is most likely to wobble.

## Next session starts with

1. `cat spike/raw/_RECOVERY.log` — did the MCP recover?
2. Pass 2: conflict detection + materiality ranking. Encode the matrix from
   03-skill-integration.md **in TS** — it is a lookup, not a judgment, so the model
   explains conflicts it is handed rather than deciding which matter.
3. The four test cases from 05-prompts.md as fixtures in `spike/cases/` — case 2
   (strong agreement, must not invent conflict) matters most; a judge will probe it.
4. Change the spec's AAPL demo case to a crypto major.
