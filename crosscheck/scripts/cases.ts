/**
 * Pass 2 regression suite — the four cases from 05-prompts.md, plus a no-verdict scan.
 *
 * "Case 2 is the one that matters most. A tool that always finds conflict is a tool nobody
 * trusts, and a judge will test exactly this."
 *
 * Run against either provider:
 *   npx tsx scripts/cases.ts                      # default GEMINI_MODEL_REASON
 *   npx tsx scripts/cases.ts deepseek-chat
 *   npx tsx scripts/cases.ts deepseek-reasoner
 */
import { readFileSync, readdirSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.trim().match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, "");
}

const CASES_DIR = "../spike/cases";

/**
 * The no-verdict rule is absolute (CLAUDE.md): no buy/sell/hold, no price target, no
 * direction call. But it forbids *recommendations and predictions*, not market vocabulary.
 * Descriptive usage is legitimate and necessary — 02-spec-crosscheck.md's own model brief
 * says "institutional selling appears next week", and explaining a bearish case requires
 * phrases like "a sell-off that flushes out long positions". A bare /sell/ flagged
 * exactly that and was a false positive, so these patterns match the recommendation shape
 * instead of the word.
 */
const FORBIDDEN: [RegExp, string][] = [
  [/(?:we|i)\s+(?:recommend|suggest|advise)/i, "first-person recommendation"],
  [/you\s+(?:should|ought to|must|could)\s+(?:buy|sell|hold|short|long|enter|exit|avoid)/i, "instruction to the reader"],
  [/(?:recommend|advise|suggest)(?:ed|s|ing)?\s+(?:buying|selling|holding|shorting|a long|a short)/i, "recommended action"],
  [/(?:buy|sell|short|long)\s+(?:now|here|immediately|the dip|on this)/i, "imperative trade call"],
  [/(?:is|are|remains?)\s+a\s+(?:buy|sell|short|long)/i, "asset-as-verdict"],
  [/price target/i, "price target"],
  [/take[- ]profit/i, "trade management instruction"],
  [/stop[- ]loss/i, "trade management instruction"],
  [/entry (?:point|level|price|zone)/i, "trade management instruction"],
  [/will\s+(?:rise|fall|rally|crash|drop|climb|surge|plunge)/i, "unfalsifiable prediction"],
  [/(?:bullish|bearish)\s+verdict/i, "verdict"],
];

type Expect = {
  agreement?: string;
  minConflicts?: number;
  maxConflicts?: number;
  requireHigh?: boolean;
  requireTimeframeDivergence?: boolean;
  requireUnavailable?: number;
};

const EXPECT: Record<string, Expect> = {
  "1-sharp-conflict": { agreement: "sharp_conflict", minConflicts: 1, requireHigh: true },
  // The one that matters: five aligned sources must produce zero conflicts.
  "2-strong-agreement": { agreement: "strong_agreement", maxConflicts: 0 },
  "3-timeframe-divergence": { minConflicts: 1, requireTimeframeDivergence: true },
  "4-missing-source": { minConflicts: 1, requireUnavailable: 2 },
};

async function main() {
  const model = process.argv[2] ?? process.env.MODEL_REASON ?? "gemini-3.5-flash";
  process.env.MODEL_REASON = model;

  const { buildBrief } = await import("../src/lib/conflicts");
  const { providerOf } = await import("../src/lib/llm");
  console.log(`Pass 2 suite · model ${model} · provider ${providerOf(model)}\n`);

  let failures = 0;
  const only = process.argv[3];
  for (const file of readdirSync(CASES_DIR).filter((f) => f.endsWith(".json") && (!only || f.includes(only))).sort()) {
    const name = file.replace(/\.json$/, "");
    const outcomes = JSON.parse(readFileSync(`${CASES_DIR}/${file}`, "utf8"));
    const exp = EXPECT[name] ?? {};
    const t0 = Date.now();

    let brief;
    try {
      brief = await buildBrief("BTC", outcomes, outcomes.length);
    } catch (e) {
      console.log(`FAIL ${name}: ${e instanceof Error ? e.message : e}\n`);
      failures++;
      continue;
    }

    const problems: string[] = [];
    if (exp.agreement && brief.agreement_level !== exp.agreement) {
      problems.push(`agreement_level ${brief.agreement_level}, expected ${exp.agreement}`);
    }
    if (exp.maxConflicts !== undefined && brief.conflicts.length > exp.maxConflicts) {
      problems.push(`${brief.conflicts.length} conflicts, expected at most ${exp.maxConflicts} — MANUFACTURED CONFLICT`);
    }
    if (exp.minConflicts !== undefined && brief.conflicts.length < exp.minConflicts) {
      problems.push(`${brief.conflicts.length} conflicts, expected at least ${exp.minConflicts}`);
    }
    if (exp.requireHigh && !brief.conflicts.some((c) => c.materiality === "high")) {
      problems.push("no high-materiality conflict found");
    }
    if (exp.requireTimeframeDivergence && !brief.conflicts.some((c) => c.is_timeframe_divergence)) {
      problems.push("timeframe divergence not flagged");
    }
    if (exp.requireUnavailable !== undefined && brief.unavailable_sources.length !== exp.requireUnavailable) {
      problems.push(`${brief.unavailable_sources.length} unavailable, expected ${exp.requireUnavailable}`);
    }
    // Every conflict handed to the model must come back explained.
    for (const c of brief.conflicts) {
      if (!c.case_for_a || !c.case_for_b) problems.push(`${c.sources.join(" x ")}: missing case_for_a/b`);
      if (/wait and see/i.test(c.what_would_resolve_it)) problems.push(`${c.sources.join(" x ")}: vague resolver`);
    }
    // No-verdict scan over all generated prose.
    const prose = [
      brief.consensus_summary,
      ...brief.conflicts.flatMap((c) => [c.description, c.case_for_a, c.case_for_b, c.what_would_resolve_it]),
    ].join(" \n");
    for (const [re, label] of FORBIDDEN) {
      const hit = prose.match(re);
      if (hit) {
        const at = hit.index ?? 0;
        problems.push(
          `VERDICT LANGUAGE (${label}): "${hit[0]}" in "...${prose.slice(Math.max(0, at - 70), at + 70).replace(/\s+/g, " ")}..."`,
        );
      }
    }

    const ok = problems.length === 0;
    if (!ok) failures++;
    console.log(`${ok ? "PASS" : "FAIL"} ${name}  (${Date.now() - t0}ms)`);
    console.log(`     ${brief.agreement_level} · ${brief.conflicts.length} conflict(s) [${brief.conflicts.map((c) => c.materiality).join(",")}] · ${brief.unavailable_sources.length} unavailable · ${brief.internal_divergences.length} internal`);
    console.log(`     summary: ${brief.consensus_summary.slice(0, 160)}`);
    if (brief.conflicts[0]) {
      const c = brief.conflicts[0];
      console.log(`     top: ${c.sources.join(" x ")} (${c.materiality}${c.is_timeframe_divergence ? ", timeframe divergence" : ""})`);
      console.log(`          resolves: ${c.what_would_resolve_it.slice(0, 130)}`);
    }
    for (const p of problems) console.log(`     !! ${p}`);
    console.log();
  }

  console.log(failures ? `${failures} case(s) FAILED` : "all cases passed");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
