/**
 * Zod schemas for every structured LLM output. Malformed output fails loudly (CLAUDE.md)
 * — we never coerce or patch a bad response into shape, because a silently repaired
 * direction is an unattributed claim.
 */
import { z } from "zod";

export const DIRECTIONS = ["bullish", "bearish", "neutral"] as const;
export const TIMEFRAMES = ["intraday", "days", "weeks", "months"] as const;

/** Pass 1 — one object per Skill. Shape is fixed by 05-prompts.md. */
export const NormalisedSource = z.object({
  source: z.string().min(1),
  direction: z.enum(DIRECTIONS),
  // 05-prompts.md flags conviction as provisional: if it proves unstable across repeat
  // runs it gets dropped rather than shipped as fake precision. Not yet assessable —
  // that test needs more than one live source.
  conviction: z.number().min(0).max(1),
  timeframe: z.enum(TIMEFRAMES),
  evidence: z.string().min(1),
  internal_divergence: z.string().nullable(),
});
export type NormalisedSource = z.infer<typeof NormalisedSource>;

export type NormaliseOutcome =
  | { skill: string; status: "ok"; value: NormalisedSource }
  | { skill: string; status: "unavailable"; reason: string };
