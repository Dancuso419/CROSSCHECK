/**
 * SPIKE Q3: is `direction` stable across repeat runs on identical input, and does
 * `conviction` mean anything or is the model guessing a number?
 *
 * 05-prompts.md: if conviction is noise we drop the field rather than ship fake precision.
 * The fan-out is cached, so every run sees byte-identical raw input.
 *
 * Run: npx tsx scripts/stability.ts [runs]
 */
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.trim().match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, "");
}

async function main() {
  const runs = Number(process.argv[2] ?? 5);
  const { fanout } = await import("../src/lib/fanout");
  const { normaliseSource } = await import("../src/lib/normalise");
  const { MODEL_EXTRACT } = await import("../src/lib/llm");

  const fan = await fanout("BTC");
  const live = fan.sources.filter((s) => s.status === "ok");
  console.log(`model ${MODEL_EXTRACT} · temperature 0 · ${runs} runs · ${live.length} live source(s)\n`);

  for (const src of live) {
    const rows: { direction: string; conviction: number; evidenceLen: number }[] = [];
    for (let i = 0; i < runs; i++) {
      const r = await normaliseSource(src);
      if (r.status !== "ok") {
        console.log(`  run ${i + 1}: FAILED ${r.reason}`);
        continue;
      }
      rows.push({ direction: r.value.direction, conviction: r.value.conviction, evidenceLen: r.value.evidence.length });
    }
    if (!rows.length) continue;

    const dirs = [...new Set(rows.map((r) => r.direction))];
    const convs = rows.map((r) => r.conviction);
    const spread = Math.max(...convs) - Math.min(...convs);

    console.log(`${src.skill}`);
    console.log(`  direction   ${dirs.length === 1 ? `STABLE (${dirs[0]})` : `UNSTABLE ${JSON.stringify(rows.map((r) => r.direction))}`}`);
    console.log(`  conviction  ${convs.join(", ")}   spread ${spread.toFixed(2)}  ${spread <= 0.1 ? "stable" : "NOISY — consider dropping the field"}`);
    console.log(`  evidence    lengths ${rows.map((r) => r.evidenceLen).join(", ")} chars\n`);
  }
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
