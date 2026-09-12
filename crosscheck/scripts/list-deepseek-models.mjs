/**
 * Which DeepSeek models does this key actually offer, and what are they called today?
 * Worth running before pinning an id: `deepseek-chat` and `deepseek-reasoner` still
 * respond but are not listed, so they are undocumented aliases of an unknown target.
 * Run: node scripts/list-deepseek-models.mjs
 */
import { readFileSync } from "node:fs";

let key = process.env.DEEPSEEK_API_KEY;
if (!key) {
  try {
    const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    key = env.split(/\r?\n/).map((l) => l.trim().match(/^DEEPSEEK_API_KEY\s*=\s*(.*)$/)).filter(Boolean)[0]?.[1];
  } catch {}
}
if (!key) {
  console.error("No DEEPSEEK_API_KEY found in env or .env.local");
  process.exit(1);
}

const res = await fetch("https://api.deepseek.com/models", { headers: { authorization: `Bearer ${key}` } });
if (!res.ok) {
  console.error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  process.exit(1);
}
const { data = [] } = await res.json();
console.log(`${data.length} model(s) listed:\n`);
for (const m of data) console.log(`  ${m.id}`);
console.log("\nSet MODEL_EXTRACT / MODEL_REASON in .env.local to one of these ids.");
