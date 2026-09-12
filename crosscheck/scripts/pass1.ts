// Dev harness: run the real fan-out then Pass 1 against it. Not shipped.
import { readFileSync } from "node:fs";

// Split on /\r?\n/ and trim: the file is CRLF, and JS regex `.` does not match \r, so a
// trailing CR silently makes every line fail to parse.
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.trim().match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, "");
}

async function main() {
  // Imported after the env is loaded: llm.ts reads process.env at module scope.
  const { fanout } = await import("../src/lib/fanout");
  const { normaliseAll } = await import("../src/lib/normalise");
  const { MODEL_EXTRACT } = await import("../src/lib/llm");

  console.log(`Pass 1 model: ${MODEL_EXTRACT}`);
  console.log(`key loaded: ${process.env.GEMINI_API_KEY ? "yes" : "NO"}\n`);

  const fan = await fanout("BTC");
  console.log(`${fan.ticker}  ${fan.reporting}/${fan.total} reporting\n`);

  const t0 = Date.now();
  const out = await normaliseAll(fan.sources);
  console.log(`normalised in ${Date.now() - t0}ms\n`);

  for (const n of out) {
    if (n.status === "unavailable") {
      console.log(`UNAVAILABLE  ${n.skill}\n             ${n.reason}\n`);
    } else {
      const v = n.value;
      console.log(`OK           ${n.skill}`);
      console.log(`  direction  ${v.direction}   conviction ${v.conviction}   timeframe ${v.timeframe}`);
      console.log(`  evidence   ${v.evidence}`);
      console.log(`  divergence ${v.internal_divergence ?? "(null)"}\n`);
    }
  }
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
