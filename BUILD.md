# BUILD — Crosscheck

Multi-source disagreement desk. Five `bitget-signal` research Skills on one ticker,
normalised, with the disagreements ranked. Never a verdict.

## Layout

```
BITGET VETT/
  *.md              specs, rules, PROGRESS.md   (docs live at the repo root)
  spike/            throwaway verification code — not shipped
  crosscheck/       the Next.js app
```

The app is in `crosscheck/`, not the repo root, because npm rejects a package name
derived from the folder `BITGET VETT` (capitals and a space). **On Vercel set Root
Directory to `crosscheck`.**

## Install and run

```bash
cd crosscheck
npm install
cp .env.local.example .env.local     # then put a real DEEPSEEK_API_KEY in it
node scripts/list-models.mjs         # only if using Gemini: lists model ids the key can reach
npm run dev -- -p 3100               # http://localhost:3100 (3000 is taken by Hindsight)
```

Node 20+. Requires `DEEPSEEK_API_KEY` for the normalisation pass; without it the app
still fans out and shows the five raw Skill responses, with normalisation marked
unavailable.

**No Bitget account and no Bitget API key are required.** The `bitget-signal` MCP
(`https://datahub.noxiaohao.com/mcp`) is open. Nothing here can place an order.

## Env vars

| Var | Required | Default | What it does |
|---|---|---|---|
| `DEEPSEEK_API_KEY` | yes (default provider) | — | Server-side only, never exposed to the browser |
| `GEMINI_API_KEY` | no | — | Only needed if `MODEL_*` points at a `gemini-*` id |
| `BITGET_MCP_URL` | no | `https://datahub.noxiaohao.com/mcp` | The research MCP |
| `BITGET_MCP_TIMEOUT_MS` | no | `8000` | Per-call cap. Dead upstreams hang 16–41s; this stops a cold demo stalling. Live calls answer in 1–3s |
| `CROSSCHECK_CACHE_TTL_MS` | no | `300000` | In-memory cache bucket, keyed by ticker. No database |
| `MODEL_EXTRACT` | no | `deepseek-chat` | Pass 1. Provider inferred from the id: `deepseek-*` then DeepSeek, else Gemini |
| `MODEL_REASON` | no | `deepseek-chat` | Pass 2. `gemini-3.5-flash` and `deepseek-reasoner` also pass the full suite |

`.env.local` is covered by `.gitignore`'s `.env*`. Verify before any commit:
`git check-ignore -v crosscheck/.env.local`

## Checks

```bash
cd crosscheck
npx tsx src/lib/liveness.test.ts     # 14 cases: the MCP's silent-failure payloads
npx tsx src/lib/indicators.test.ts   # pins the TS engine to the Skill's Python engine
npx tsx src/lib/materiality.test.ts # 14 cases: conflict detection and ranking, no LLM
npx tsx scripts/cases.ts            # Pass 2 suite: the four cases from 05-prompts.md
npx tsx scripts/cases.ts deepseek-chat   # same suite, other provider
npx tsx scripts/stability.ts 5      # is Pass 1 direction stable on identical input?
npm run build
```

```bash
node scripts/list-models.mjs         # which Gemini models this key can reach
```

```bash
python spike/ta.py selfcheck         # the Skill's own 23-indicator engine
python spike/probe.py                # has the dead MCP recovered? appends to spike/raw/_RECOVERY.log
```

`liveness.test.ts` matters most. The MCP returns HTTP 200 with `{"error": ""}` when an
upstream fails, so anything that only checks status codes reads failure as success.

## Deployed

**https://crosscheck-two.vercel.app** — the stable production alias. It always points at the
latest production deployment, so it is the link to submit. Per-deployment URLs
(`crosscheck-<hash>-...`) change every push and should never be handed out.

## Deploy (Vercel)

1. Import the repo. **Root Directory: `crosscheck`.** Without it a git push builds from the
   repo root, finds no `app/` directory and fails — while a CLI deploy run from inside
   `crosscheck/` still succeeds, so the two paths disagree and the failure looks random.
   Set it on the project (Settings, Build & Deployment, Root Directory) or via the API:
   `PATCH /v9/projects/<id>` with `{"rootDirectory":"crosscheck"}`.
2. Add `DEEPSEEK_API_KEY` as an environment variable (all environments).
3. Deploy. Framework preset Next.js; no build-command override needed.

Note: a Vercel deploy does **not** fix the dead Skills. The MCP is a remote server and
all upstream fetching happens on their side — see PROGRESS.md.

## Verify the demo link opens for a stranger

1. Open the deployment URL in a **private/incognito window** — no login must be required.
2. Enter `BTC`, submit.
3. You should see all five Skills listed, each with its individual MCP calls and
   latencies, and an explicit "N of 5 sources reporting" count.
4. Unavailable Skills must state *why*. A source is never silently dropped.
5. The brief itself: a consensus summary, disagreements ranked most-material-first with
   "for X to be right / for Y to be right" and a named resolving observable, sources
   disagreeing with themselves, and the gaps named.
6. Nowhere should there be a buy/sell/hold, a direction call or a price target.

**Expect roughly 30s on the first query and instant afterwards** (in-memory cache, 5-minute
bucket). Measured cold with 4 of 5 Skills dead: fan-out 14s (the dead Skills each burn their
12s timeout), normalise 12s, conflict 3s. Cached: 0.04s. The route ceiling is 60s; using
`deepseek-v4-pro` for Pass 1 pushed a cold query to 58s, which is why both passes use
`deepseek-flash`.

## Demo mode

The UI has a **Live / Recorded snapshot** toggle. Live is the default.

`spike/capture.py` recorded a real five-source snapshot to `crosscheck/src/data/snapshot.json`
because the MCP's upstream fetching is down and no live moment has had all five Skills
reporting. It pulled current data from the same public providers the MCP is built on, and
took technical-analysis from the Bitget MCP itself.

Two things that must stay true:
- **The product never calls those providers.** `capture.py` is an offline, one-time script.
  `crosscheck/` only reads the committed JSON.
- **A snapshot is never shown as live.** The response always carries `capturedAt` plus the
  capture note, and the UI renders a permanent badge above the brief.

Only the upstream data is recorded — normalisation, conflict detection, ranking and the
brief all run for real on top of it. Demo mode takes ~17s cold (no dead-Skill timeouts).

Re-capture with `python spike/capture.py [TICKER ...]` (defaults to BTC ETH SOL). It merges
by ticker, so re-running one never discards the others.

### Illustrative scenarios

A third mode, **Illustrative**, runs four constructed cases. It exists because the product's
headline output is a ranked disagreement, and real data only shows one when the sources
genuinely disagree — which they did not on the capture date. Rather than loosen Pass 1 to
produce drama, the conflict UI is demonstrated on inputs openly labelled as constructed.

These are the same four fixtures the Pass 2 regression suite asserts against
(`src/data/scenarios/`, run by `scripts/cases.ts`), so what a judge sees is exactly what the
tests check. Their sources are already normalised, so Pass 1 is genuinely skipped and the
page says so; conflict detection, ranking and Pass 2 all run for real.

Three modes, three badges, live by default:

| mode | data | badge |
|---|---|---|
| Live | queries the Skills now | none — it is live |
| Recorded | real captured market data | "Recorded snapshot — real data, not live" |
| Illustrative | constructed | "Illustrative example — constructed data, not real market data" |

## Known state (2026-09-12)

Four of five Skills return no data: the MCP's upstream fetching is down on their side.
Only `technical-analysis` reports, via Bitget klines from the MCP. `spike/probe.py` runs
every 6 hours to detect recovery. See PROGRESS.md for the decision and the Sept 15 gate.
