/**
 * POST /api/crosscheck  { ticker }
 *
 * All four steps: fan out to five Skills, normalise each, detect and rank conflict,
 * build the brief.
 *
 * Keys stay server-side. Read-only — this route cannot place an order.
 *
 * Every stage degrades independently and says so. A dead Skill, a failed normalisation and
 * a failed conflict pass are three different gaps, and the response distinguishes them
 * rather than collapsing everything into one error.
 */
import { NextResponse } from "next/server";
import { fanout } from "@/lib/fanout";
import { hasSnapshot, snapshotFanout, snapshotMeta, SNAPSHOT_TICKERS } from "@/lib/snapshot";
import { getScenario, scenarioFanout, scenarioIndex } from "@/lib/scenarios";
import { normaliseAllCached } from "@/lib/normalise";
import { buildBriefCached } from "@/lib/conflicts";
import { MODEL_EXTRACT, MODEL_REASON } from "@/lib/llm";
import prewrittenFile from "@/data/briefs.json";
import type { Brief, NormaliseOutcome } from "@/lib/schema";

/* Recorded and Illustrative run on fixed inputs, so their briefs are written ahead of time
   by scripts/prewrite.ts with the same pipeline. See that file for why. */
type Prewritten = { normalised?: NormaliseOutcome[]; brief: Brief; normaliseMs: number; conflictMs: number };
const prewritten = prewrittenFile as unknown as {
  model: string;
  generatedAt: string;
  tickers: Record<string, Prewritten>;
  scenarios: Record<string, Prewritten>;
};

export const runtime = "nodejs";
// Dead upstreams are capped at 12s each and the five Skills run in parallel; then two
// LLM passes. 60s is the Vercel ceiling on the lower tiers and comfortably enough.
export const maxDuration = 60;

const hasKey = () => Boolean(process.env.DEEPSEEK_API_KEY || process.env.GEMINI_API_KEY);

export async function POST(req: Request) {
  let ticker: string;
  let mode: "live" | "demo" | "scenario";
  let scenarioId = "";
  try {
    const body = (await req.json()) as { ticker?: unknown; mode?: unknown; scenario?: unknown };
    ticker = String(body.ticker ?? "").trim().toUpperCase();
    mode = body.mode === "demo" ? "demo" : body.mode === "scenario" ? "scenario" : "live";
    scenarioId = String(body.scenario ?? "");
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const scenario = mode === "scenario" ? getScenario(scenarioId) : undefined;
  if (mode === "scenario" && !scenario) {
    return NextResponse.json(
      { error: `Unknown scenario "${scenarioId}". Available: ${scenarioIndex.map((s) => s.id).join(", ")}` },
      { status: 400 },
    );
  }

  // A base symbol: a US stock (AAPL) or a crypto asset (BTC). skills.ts maps each.
  if (mode !== "scenario" && !/^[A-Z0-9]{2,10}$/.test(ticker)) {
    return NextResponse.json({ error: "Ticker must be 2-10 letters or digits, e.g. AAPL or BTC" }, { status: 400 });
  }

  if (mode === "demo" && !hasSnapshot(ticker)) {
    return NextResponse.json(
      { error: `No recorded snapshot for ${ticker}. Recorded covers ${SNAPSHOT_TICKERS.join(", ")}. Switch to Live to query anything else.` },
      { status: 400 },
    );
  }

  // Stage timings are part of the output, not a debug aid: the demo is meant to show the
  // fan-out rather than hide it, and a slow stage should be visible instead of guessed at.
  const t0 = Date.now();
  const fan = scenario ? scenarioFanout(scenario) : mode === "demo" ? snapshotFanout(ticker) : await fanout(ticker);
  const tFanout = Date.now() - t0;
  if (scenario) ticker = fan.ticker;

  let normalised = null;
  let brief = null;
  let analyseError: string | null = null;
  let tNormalise = 0;
  let tConflict = 0;

  const ready = scenario ? prewritten.scenarios[scenario.id] : mode === "demo" ? prewritten.tickers[ticker] : undefined;
  if (ready) {
    normalised = scenario ? scenario.outcomes : ready.normalised ?? null;
    brief = ready.brief;
    // The durations it actually took when it was written, not zeros pretending to be fast.
    tNormalise = ready.normaliseMs;
    tConflict = ready.conflictMs;
  } else if (!hasKey()) {
    analyseError = "No LLM key configured, so showing the fan-out only. See BUILD.md.";
  } else {
    // Answer before the platform's 60s limit no matter what the model does. Past it, Vercel
    // replaces this response with an HTML error page and the visitor loses the fan-out too.
    const budgetMs = 52_000 - (Date.now() - t0);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error("the AI provider is responding slowly right now, so the reading was stopped to keep the page from timing out. The source data below is complete; try again shortly, or use Recorded.")),
        Math.max(1_000, budgetMs),
      );
    });
    try {
      await Promise.race([
        deadline,
        (async () => {
          const t1 = Date.now();
          // Scenario sources arrive already normalised, so Pass 1 is genuinely not run rather
          // than run over a fabricated raw payload.
          normalised = scenario ? scenario.outcomes : await normaliseAllCached(`${mode}:${ticker}`, fan.sources);
          tNormalise = Date.now() - t1;
          const t2 = Date.now();
          brief = await buildBriefCached(ticker, normalised, fan.total, `${mode}:${scenarioId || ticker}`);
          tConflict = Date.now() - t2;
        })(),
      ]);
    } catch (e) {
      analyseError = e instanceof Error ? e.message : String(e);
    } finally {
      clearTimeout(timer);
    }
  }

  return NextResponse.json({
    ...fan,
    normalised,
    brief,
    analyseError,
    mode,
    // Always sent so the UI cannot render a recording or a construction without saying so.
    snapshot: mode === "demo" ? snapshotMeta(ticker) : null,
    snapshotTickers: SNAPSHOT_TICKERS,
    scenario: scenario ? { id: scenario.id, title: scenario.title, teaches: scenario.teaches } : null,
    scenarios: scenarioIndex,
    models: ready ? { extract: prewritten.model, reason: prewritten.model } : { extract: MODEL_EXTRACT, reason: MODEL_REASON },
    prewritten: ready ? { generatedAt: prewritten.generatedAt, model: prewritten.model } : null,
    timings: {
      fanoutMs: tFanout,
      normaliseMs: tNormalise,
      conflictMs: tConflict,
      totalMs: ready ? tFanout + tNormalise + tConflict : Date.now() - t0,
    },
  });
}
