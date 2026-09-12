/**
 * POST /api/crosscheck  { ticker }
 *
 * Steps 1 and 2 of the four: fan out to five Skills, then normalise each.
 * Conflict detection and the brief (steps 3 and 4) are not wired yet.
 *
 * Keys stay server-side. This route is read-only — it cannot place an order.
 */
import { NextResponse } from "next/server";
import { fanout } from "@/lib/fanout";
import { normaliseAll } from "@/lib/normalise";

export const runtime = "nodejs";
// Dead upstreams are capped at 12s each and the five Skills run in parallel.
export const maxDuration = 60;

export async function POST(req: Request) {
  let ticker: string;
  try {
    const body = (await req.json()) as { ticker?: unknown };
    ticker = String(body.ticker ?? "").trim();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  // Crypto base symbols only. PROGRESS.md: the Skills have no equity path.
  if (!/^[A-Za-z0-9]{2,10}$/.test(ticker)) {
    return NextResponse.json({ error: "ticker must be 2-10 alphanumerics, e.g. BTC" }, { status: 400 });
  }

  const fan = await fanout(ticker);

  // Normalisation needs a key; without one still return the fan-out so the demo shows
  // five sources being queried rather than failing outright.
  let normalised = null;
  let normaliseError: string | null = null;
  if (process.env.GEMINI_API_KEY) {
    try {
      normalised = await normaliseAll(fan.sources);
    } catch (e) {
      normaliseError = e instanceof Error ? e.message : String(e);
    }
  } else {
    normaliseError = "GEMINI_API_KEY not set — fan-out only";
  }

  return NextResponse.json({ ...fan, normalised, normaliseError });
}
