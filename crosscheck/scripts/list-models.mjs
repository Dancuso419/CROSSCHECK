/**
 * Which Gemini models can this key actually reach, and what are they called today?
 * Reads GEMINI_API_KEY from .env.local. Run: node scripts/list-models.mjs
 */
import { readFileSync } from "node:fs";

let key = process.env.GEMINI_API_KEY;
if (!key) {
  try {
    const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    key = env.match(/^\s*GEMINI_API_KEY\s*=\s*(.+)$/m)?.[1].trim().replace(/^["']|["']$/g, "");
  } catch {}
}
if (!key) {
  console.error("No GEMINI_API_KEY found in env or .env.local");
  process.exit(1);
}

const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", {
  headers: { "x-goog-api-key": key },
});
if (!res.ok) {
  console.error(`HTTP ${res.status}: ${(await res.text()).slice(0, 400)}`);
  process.exit(1);
}
const { models = [] } = await res.json();
const usable = models
  .filter((m) => (m.supportedGenerationMethods ?? []).includes("generateContent"))
  .sort((a, b) => a.name.localeCompare(b.name));

console.log(`${usable.length} models support generateContent:\n`);
for (const m of usable) {
  console.log(`  ${m.name.replace("models/", "").padEnd(42)} in=${String(m.inputTokenLimit).padStart(7)} out=${String(m.outputTokenLimit).padStart(6)}  ${m.displayName ?? ""}`);
}
console.log(`\nSet in .env.local:\n  GEMINI_MODEL_EXTRACT=<a fast one, for Pass 1>\n  GEMINI_MODEL_REASON=<the most capable one, for Pass 2>`);
