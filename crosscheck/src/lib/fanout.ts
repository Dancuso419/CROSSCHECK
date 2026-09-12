/**
 * Step 1 of the four: fan out one ticker to all five Skills in parallel, cached.
 *
 * Degradation is a first-class result, not an error path. 03-skill-integration.md:
 * "If a Skill fails or returns nothing, say so in the output. Never silently drop a
 * source — a missing view changes the conflict picture." So a dead Skill returns an
 * `unavailable` record carrying the reason, and the brief must name it.
 *
 * As of 2026-09-12 four of five Skills are unavailable because the MCP's upstream
 * fetching is down (see PROGRESS.md). That is the real state of the data, and the product
 * reports it rather than hiding it.
 */
import { McpClient } from "./mcp";
import { deadReason } from "./liveness";
import { computeIndicators, type Candle } from "./indicators";
import { SKILLS, type SkillDef, type SkillName } from "./skills";

export type CallTrace = {
  tool: string;
  action: string;
  status: "ok" | "dead" | "error";
  detail?: string;
  latencyMs: number;
};

export type SourceResult =
  | { skill: SkillName; measures: string; timeframe: string; status: "ok"; raw: unknown; calls: CallTrace[] }
  | { skill: SkillName; measures: string; timeframe: string; status: "unavailable"; reason: string; calls: CallTrace[] };

export type FanoutResult = {
  ticker: string;
  fetchedAt: string;
  cached: boolean;
  sources: SourceResult[];
  /** Explicit so the UI can show "2 of 5 reporting" without recounting. */
  reporting: number;
  total: number;
};

// No database (per CLAUDE.md) — in-memory only, keyed by ticker + time bucket.
// Five parallel fan-outs are slow and rate-limit-prone; a cold demo must not hang.
const TTL_MS = Number(process.env.CROSSCHECK_CACHE_TTL_MS ?? 5 * 60_000);
const cache = new Map<string, FanoutResult>();

async function runSkill(def: SkillDef, ticker: string): Promise<SourceResult> {
  // One MCP session per Skill. Fanning ~12 concurrent calls down a single session caused
  // head-of-line blocking (live klines that answer in ~1s hit the 12s cap) on top of the
  // id-collision bug above.
  const mcp = new McpClient();
  const calls = def.calls(ticker);
  const traces: CallTrace[] = [];
  const payloads: Record<string, unknown> = {};

  const results = await Promise.all(calls.map((c) => mcp.call(c.tool, c.args)));

  results.forEach((r, idx) => {
    const { tool, args } = calls[idx];
    const action = String(args.action ?? "");
    const label = `${tool}/${action}${args.timeframe ? `:${args.timeframe}` : ""}`;
    if (!r.ok) {
      traces.push({ tool, action, status: "error", detail: r.reason, latencyMs: r.latencyMs });
      return;
    }
    const dead = deadReason(r.payload);
    if (dead) {
      traces.push({ tool, action, status: "dead", detail: dead, latencyMs: r.latencyMs });
      return;
    }
    traces.push({ tool, action, status: "ok", latencyMs: r.latencyMs });
    payloads[label] = r.payload;
  });

  const base = { skill: def.name, measures: def.measures, timeframe: def.timeframe, calls: traces };

  if (Object.keys(payloads).length === 0) {
    const reasons = [...new Set(traces.map((t) => t.detail).filter(Boolean))].join("; ");
    return { ...base, status: "unavailable", reason: reasons || "no data returned" };
  }

  // technical-analysis: the payloads are klines, so turn them into indicators here.
  // Two timeframes are kept separate on purpose — 4h and 1d disagreeing is a real
  // timeframe divergence, not a contradiction to be averaged out.
  if (def.name === "technical-analysis") {
    const byTf: Record<string, unknown> = {};
    for (const [label, payload] of Object.entries(payloads)) {
      const tf = label.split(":")[1] ?? "unknown";
      const candles = payload as Candle[];
      if (!Array.isArray(candles) || candles.length < 100) {
        byTf[tf] = { error: `only ${Array.isArray(candles) ? candles.length : 0} candles` };
        continue;
      }
      byTf[tf] = { candles: candles.length, ...computeIndicators(candles) };
    }
    return { ...base, status: "ok", raw: byTf };
  }

  return { ...base, status: "ok", raw: payloads };
}

export async function fanout(ticker: string): Promise<FanoutResult> {
  const t = ticker.trim().toUpperCase();
  const key = `${t}@${Math.floor(Date.now() / TTL_MS)}`;
  const hit = cache.get(key);
  if (hit) return { ...hit, cached: true };

  const sources = await Promise.all(SKILLS.map((s) => runSkill(s, t)));
  const result: FanoutResult = {
    ticker: t,
    fetchedAt: new Date().toISOString(),
    cached: false,
    sources,
    reporting: sources.filter((s) => s.status === "ok").length,
    total: sources.length,
  };

  cache.set(key, result);
  if (cache.size > 50) cache.delete(cache.keys().next().value!); // ponytail: crude bound, fine for one session
  return result;
}
