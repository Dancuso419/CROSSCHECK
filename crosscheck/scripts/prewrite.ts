/**
 * Writes the briefs for Recorded and Illustrative modes ahead of time.
 *
 * Those modes run on fixed inputs, so generating their briefs on every page load bought
 * nothing but risk: on 2026-09-14 deepseek-flash stopped answering, every request hit the
 * 60s route limit, and the demo link returned an error page. The same inputs also gave
 * different readings on different runs. Written once here, the demo opens instantly, reads
 * the same for every visitor, and survives a provider outage. Live mode is unchanged.
 *
 * The pipeline is the real one (normaliseAll, then buildBrief), only moved out of the
 * request. Re-run after re-capturing: `npx tsx scripts/prewrite.ts [model]`.
 */
import { readFileSync, writeFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.trim().match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, "");
}
const model = process.argv[2] ?? "deepseek-v4-pro";
process.env.MODEL_EXTRACT = model;
process.env.MODEL_REASON = model;
process.env.MODEL_FALLBACKS = "";
process.env.LLM_TIMEOUT_MS = "180000"; // nobody is waiting on this run

const OUT = "src/data/briefs.json";

async function main() {
  const { SNAPSHOT_TICKERS, snapshotFanout } = await import("../src/lib/snapshot");
  const { scenarioIndex, getScenario } = await import("../src/lib/scenarios");
  const { normaliseAll } = await import("../src/lib/normalise");
  const { buildBrief } = await import("../src/lib/conflicts");

  const out: Record<string, unknown> = { model, generatedAt: new Date().toISOString(), tickers: {}, scenarios: {} };

  for (const t of SNAPSHOT_TICKERS) {
    const fan = snapshotFanout(t);
    const t1 = Date.now();
    const normalised = await normaliseAll(fan.sources);
    const normaliseMs = Date.now() - t1;
    const failed = normalised.filter((n) => n.status === "unavailable" && n.reason.startsWith("normalisation failed"));
    if (failed.length) throw new Error(`${t}: ${failed.map((f) => f.skill).join(", ")} failed to normalise; not writing a degraded demo`);
    const t2 = Date.now();
    const brief = await buildBrief(t, normalised, fan.total);
    (out.tickers as Record<string, unknown>)[t] = { normalised, brief, normaliseMs, conflictMs: Date.now() - t2 };
    console.log(`${t}: ${brief.agreement_level}, ${brief.conflicts.length} conflicts | ${brief.headline}`);
  }

  for (const { id } of scenarioIndex) {
    const s = getScenario(id)!;
    const fan = s.outcomes.length;
    const t2 = Date.now();
    const brief = await buildBrief("BTC", s.outcomes, fan);
    (out.scenarios as Record<string, unknown>)[id] = { brief, normaliseMs: 0, conflictMs: Date.now() - t2 };
    console.log(`${id}: ${brief.conflicts.length} conflicts | ${brief.headline}`);
  }

  writeFileSync(OUT, JSON.stringify(out, null, 1));
  console.log(`wrote ${OUT}`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
