/**
 * Which model answers a real Pass 1 prompt fastest, right now? Run when a provider
 * degrades: `npx tsx scripts/latency.ts [ticker] [model ...]`. Recorded data, so it
 * costs no Skill calls. No fallback and a long cap, so each model is timed on its own.
 */
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.trim().match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, "");
}
process.env.MODEL_FALLBACKS = "";
process.env.LLM_TIMEOUT_MS = "70000";

async function main() {
  const ticker = process.argv[2] ?? "NVDA";
  const models = process.argv.slice(3).length ? process.argv.slice(3) : ["deepseek-flash", "deepseek-v4-pro", "gemini-2.5-flash"];
  const { snapshotFanout } = await import("../src/lib/snapshot");
  const { askJson } = await import("../src/lib/llm");
  const src = snapshotFanout(ticker).sources.find((s) => s.skill === "technical-analysis" && s.status === "ok") as { raw: unknown };
  const prompt = `Return ONLY valid JSON {"direction": "bullish"|"bearish"|"neutral", "evidence": string} for this indicator set:\n${JSON.stringify(src.raw)}`;

  await Promise.all(
    models.map(async (m) => {
      const t0 = Date.now();
      try {
        const out = await askJson(m, prompt);
        console.log(`${m.padEnd(20)} ${((Date.now() - t0) / 1000).toFixed(1)}s ok ${out.length} chars`);
      } catch (e) {
        console.log(`${m.padEnd(20)} ${((Date.now() - t0) / 1000).toFixed(1)}s FAIL ${String(e).slice(0, 90)}`);
      }
    }),
  );
}
main();
