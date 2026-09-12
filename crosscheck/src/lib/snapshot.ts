/**
 * Demo mode: a recorded five-source snapshot.
 *
 * The bitget-signal MCP's upstream fetching has been down since before this project
 * started, so no live moment has ever had all five Skills reporting. The AI Trading Desk
 * track requires one complete research task demonstrated end to end, which one source
 * cannot show. `spike/capture.py` recorded real, current data from the same public
 * providers the MCP is built on; technical-analysis came from the Bitget MCP itself,
 * whose exchange data path still works.
 *
 * Two rules this file exists to keep:
 *   1. The product never fetches from those providers. This reads a committed JSON file.
 *   2. A snapshot is never presented as live. Every response carries `capturedAt` and the
 *      note below, and the UI badges it permanently.
 *
 * Only the upstream data is recorded — normalisation, conflict detection, ranking and the
 * brief all run for real on top of it.
 */
import raw from "@/data/snapshot.json";
import { computeIndicators, type Candle } from "./indicators";
import { SKILLS, type SkillName } from "./skills";
import type { CallTrace, FanoutResult, SourceResult } from "./fanout";

type SnapshotSource = {
  skill: string;
  status: "ok" | "unavailable";
  raw?: unknown;
  reason?: string;
  calls: CallTrace[];
};
type Snapshot = { capturedAt: string; ticker: string; note: string; sources: SnapshotSource[] };

const snapshot = raw as unknown as Snapshot;

export const snapshotMeta = { capturedAt: snapshot.capturedAt, note: snapshot.note, ticker: snapshot.ticker };

/** Only the recorded ticker has a snapshot; anything else must stay on the live path. */
export const hasSnapshot = (ticker: string) => ticker.toUpperCase() === snapshot.ticker.toUpperCase();

export function snapshotFanout(): FanoutResult {
  const sources: SourceResult[] = snapshot.sources.map((s) => {
    const def = SKILLS.find((d) => d.name === s.skill)!;
    const base = { skill: s.skill as SkillName, measures: def.measures, timeframe: def.timeframe, calls: s.calls };

    if (s.status !== "ok") {
      return { ...base, status: "unavailable", reason: s.reason ?? "no data returned" };
    }
    // technical-analysis is stored as klines, exactly as the live path receives them, so
    // the same indicator engine runs over them rather than a recorded result being replayed.
    if (s.skill === "technical-analysis") {
      const byTf: Record<string, unknown> = {};
      for (const [tf, candles] of Object.entries(s.raw as Record<string, Candle[]>)) {
        byTf[tf] = { candles: candles.length, ...computeIndicators(candles) };
      }
      return { ...base, status: "ok", raw: byTf };
    }
    return { ...base, status: "ok", raw: s.raw };
  });

  return {
    ticker: snapshot.ticker,
    fetchedAt: snapshot.capturedAt,
    cached: false,
    sources,
    reporting: sources.filter((s) => s.status === "ok").length,
    total: sources.length,
  };
}
