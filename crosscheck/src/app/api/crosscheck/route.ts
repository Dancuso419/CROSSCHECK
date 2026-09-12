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
import { hasSnapshot, snapshotFanout, snapshotMeta } from "@/lib/snapshot";
import { getScenario, scenarioFanout, scenarioIndex } from "@/lib/scenarios";
import { normaliseAllCached } from "@/lib/normalise";
import { buildBriefCached } from "@/lib/conflicts";
import { MODEL_EXTRACT, MODEL_REASON } from "@/lib/llm";

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

  // Crypto base symbols only. PROGRESS.md: the Skills have no equity path.
  if (mode !== "scenario" && !/^[A-Z0-9]{2,10}$/.test(ticker)) {
    return NextResponse.json({ error: "Ticker must be 2-10 letters or digits, e.g. BTC" }, { status: 400 });
  }

  if (mode === "demo" && !hasSnapshot(ticker)) {
    return NextResponse.json(
      { error: `No recorded snapshot for ${ticker}. Demo mode has ${snapshotMeta.ticker} only — switch to live.` },
      { status: 400 },
    );
  }

  // Stage timings are part of the output, not a debug aid: the demo is meant to show the
  // fan-out rather than hide it, and a slow stage should be visible instead of guessed at.
  const t0 = Date.now();
  // Demo mode replaces ONLY the upstream data. Normalisation, conflict detection, ranking
  // and the brief all run for real on top of the recording.
  const fan = scenario ? scenarioFanout(scenario) : mode === "demo" ? snapshotFanout() : await fanout(ticker);
  const tFanout = Date.now() - t0;
  if (scenario) ticker = fan.ticker;

  let normalised = null;
  let brief = null;
  let analyseError: string | null = null;
  let tNormalise = 0;
  let tConflict = 0;

  if (!hasKey()) {
    analyseError = "No LLM key configured — showing the fan-out only. See BUILD.md.";
  } else {
    try {
      const t1 = Date.now();
      // Scenario sources arrive already normalised, so Pass 1 is genuinely not run rather
      // than run over a fabricated raw payload.
      normalised = scenario ? scenario.outcomes : await normaliseAllCached(`${mode}:${ticker}`, fan.sources);
      tNormalise = Date.now() - t1;
      const t2 = Date.now();
      brief = await buildBriefCached(ticker, normalised, fan.total, `${mode}:${scenarioId || ticker}`);
      tConflict = Date.now() - t2;
    } catch (e) {
      analyseError = e instanceof Error ? e.message : String(e);
    }
  }

  return NextResponse.json({
    ...fan,
    normalised,
    brief,
    analyseError,
    mode,
    // Always sent so the UI cannot render a recording or a construction without saying so.
    snapshot: mode === "demo" ? snapshotMeta : null,
    scenario: scenario ? { id: scenario.id, title: scenario.title, teaches: scenario.teaches } : null,
    scenarios: scenarioIndex,
    models: { extract: MODEL_EXTRACT, reason: MODEL_REASON },
    timings: { fanoutMs: tFanout, normaliseMs: tNormalise, conflictMs: tConflict, totalMs: Date.now() - t0 },
  });
}
