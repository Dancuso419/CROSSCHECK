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
  /* The same divergence split into its two sides, so the page can draw it as a
     tug of war instead of a paragraph. Empty when the source does not diverge.
     Defaulted so older fixtures, which predate it, still parse. */
  internal_pulls: z
    .array(z.object({ leans: z.enum(["bullish", "bearish"]), point: z.string().min(1) }))
    .default([]),
});
export type NormalisedSource = z.infer<typeof NormalisedSource>;

export type NormaliseOutcome =
  | { skill: string; status: "ok"; value: NormalisedSource }
  | { skill: string; status: "unavailable"; reason: string };

/** Pass 2 — what the model is asked to supply. Materiality, timeframe-divergence flags,
 *  agreement level and the unavailable list are computed in materiality.ts and overwritten
 *  afterwards, so the model cannot promote a low-materiality pair or invent a conflict. */
export const ConflictExplanation = z.object({
  sources: z.tuple([z.string(), z.string()]),
  /* One sentence a newcomer can follow, no jargon and no figures. The technical
     description stays, but it stops being the first thing anyone has to parse. */
  in_plain_terms: z.string().min(1),
  description: z.string().min(1),
  case_for_a: z.string().min(1),
  case_for_b: z.string().min(1),
  what_would_resolve_it: z.string().min(1),
});

export const Pass2Output = z.object({
  /* The one line to read if you read nothing else. Still not a verdict: it says what
     the sources are doing, never what the reader should do about it. */
  headline: z.string().min(1),
  consensus_summary: z.string().min(1),
  conflicts: z.array(ConflictExplanation),
});
export type Pass2Output = z.infer<typeof Pass2Output>;

/** The finished brief: model prose plus our deterministic structure. */
export type Brief = {
  ticker: string;
  agreement_level: "strong_agreement" | "mixed" | "sharp_conflict";
  headline: string;
  consensus_summary: string;
  reporting: number;
  total: number;
  conflicts: {
    sources: [string, string];
    materiality: "high" | "medium" | "low";
    why_it_matters: string;
    is_timeframe_divergence: boolean;
    in_plain_terms: string;
    description: string;
    case_for_a: string;
    case_for_b: string;
    what_would_resolve_it: string;
  }[];
  internal_divergences: {
    source: string;
    materiality: "medium";
    detail: string;
    pulls: { leans: "bullish" | "bearish"; point: string }[];
  }[];
  unavailable_sources: { source: string; reason: string }[];
};
