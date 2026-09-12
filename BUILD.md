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
cp .env.local.example .env.local     # then put a real ANTHROPIC_API_KEY in it
npm run dev                          # http://localhost:3000
```

Node 20+. Requires `ANTHROPIC_API_KEY` for the normalisation pass; without it the app
still fans out and shows the five raw Skill responses, with normalisation marked
unavailable.

**No Bitget account and no Bitget API key are required.** The `bitget-signal` MCP
(`https://datahub.noxiaohao.com/mcp`) is open. Nothing here can place an order.

## Env vars

| Var | Required | Default | What it does |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | yes (for normalisation) | — | Server-side only, never exposed to the browser |
| `BITGET_MCP_URL` | no | `https://datahub.noxiaohao.com/mcp` | The research MCP |
| `BITGET_MCP_TIMEOUT_MS` | no | `12000` | Per-call cap. Dead upstreams hang 16–41s; this stops a cold demo stalling |
| `CROSSCHECK_CACHE_TTL_MS` | no | `300000` | In-memory cache bucket, keyed by ticker. No database |
| `CROSSCHECK_MODEL_EXTRACT` | no | `claude-sonnet-5` | Pass 1, normalisation |
| `CROSSCHECK_MODEL_REASON` | no | `claude-opus-5` | Pass 2, conflict reasoning (not wired yet) |

`.env.local` is covered by `.gitignore`'s `.env*`. Verify before any commit:
`git check-ignore -v crosscheck/.env.local`

## Checks

```bash
cd crosscheck
npx tsx src/lib/liveness.test.ts     # 14 cases: the MCP's silent-failure payloads
npx tsx src/lib/indicators.test.ts   # pins the TS engine to the Skill's Python engine
npm run build
```

```bash
python spike/ta.py selfcheck         # the Skill's own 23-indicator engine
python spike/probe.py                # has the dead MCP recovered? appends to spike/raw/_RECOVERY.log
```

`liveness.test.ts` matters most. The MCP returns HTTP 200 with `{"error": ""}` when an
upstream fails, so anything that only checks status codes reads failure as success.

## Deploy (Vercel)

1. Import the repo. **Root Directory: `crosscheck`.**
2. Add `ANTHROPIC_API_KEY` as an environment variable (all environments).
3. Deploy. Framework preset Next.js; no build-command override needed.

Note: a Vercel deploy does **not** fix the dead Skills. The MCP is a remote server and
all upstream fetching happens on their side — see PROGRESS.md.

## Verify the demo link opens for a stranger

1. Open the deployment URL in a **private/incognito window** — no login must be required.
2. Enter `BTC`, submit.
3. You should see all five Skills listed, each with its individual MCP calls and
   latencies, and an explicit "N of 5 sources reporting" count.
4. Unavailable Skills must state *why*. A source is never silently dropped.

## Known state (2026-09-12)

Four of five Skills return no data: the MCP's upstream fetching is down on their side.
Only `technical-analysis` reports, via Bitget klines from the MCP. `spike/probe.py` runs
every 6 hours to detect recovery. See PROGRESS.md for the decision and the Sept 15 gate.
