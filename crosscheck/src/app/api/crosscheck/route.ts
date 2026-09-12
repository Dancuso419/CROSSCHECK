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
  try {
    const body = (await req.json()) as { ticker?: unknown };
    ticker = String(body.ticker ?? "").trim().toUpperCase();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  // Crypto base symbols only. PROGRESS.md: the Skills have no equity path.
  if (!/^[A-Z0-9]{2,10}$/.test(ticker)) {
    return NextResponse.json({ error: "Ticker must be 2-10 letters or digits, e.g. BTC" }, { status: 400 });
  }

  // Stage timings are part of the output, not a debug aid: the demo is meant to show the
  // fan-out rather than hide it, and a slow stage should be visible instead of guessed at.
  const t0 = Date.now();
  const fan = await fanout(ticker);
  const tFanout = Date.now() - t0;

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
      normalised = await normaliseAllCached(ticker, fan.sources);
      tNormalise = Date.now() - t1;
      const t2 = Date.now();
      brief = await buildBriefCached(ticker, normalised, fan.total);
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
    models: { extract: MODEL_EXTRACT, reason: MODEL_REASON },
    timings: { fanoutMs: tFanout, normaliseMs: tNormalise, conflictMs: tConflict, totalMs: Date.now() - t0 },
  });
}
