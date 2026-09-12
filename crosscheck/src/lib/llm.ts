/**
 * Gemini (Google AI) over plain fetch. Server-side only — the key never reaches the
 * browser (CLAUDE.md). No SDK dependency: two POSTs do not justify one.
 *
 * The form requires a "Role of the LLM in Your Project" answer, so keep this accurate:
 * Pass 1 extracts a fixed schema per Skill, Pass 2 reasons over the extracted objects.
 * No model ever sees raw data and conflict guidance at the same time.
 *
 * Model ids are NOT hardcoded guesses — run `node scripts/list-models.mjs` to see what
 * this key can actually reach, then set the two env vars. Defaults below are a starting
 * point only and may be stale.
 */
const BASE = "https://generativelanguage.googleapis.com/v1beta";

// Pass 1 runs once per live Skill, so it is the call most exposed to free-tier rate
// limits. gemini-3.8-flash produces good output but its free RPM is exhausted by a single
// five-source fan-out (observed: 429 with RetryInfo 34s). gemini-2.5-flash has headroom
// and returns clean JSON, so it is the reliable default; override to upgrade.
export const MODEL_EXTRACT = process.env.GEMINI_MODEL_EXTRACT ?? "gemini-2.5-flash";
export const MODEL_REASON = process.env.GEMINI_MODEL_REASON ?? "gemini-3.1-pro-preview";

/** 429/503 are transient contention, not a bad request. Without a backoff a demand spike
 *  marks a live source unavailable and the brief reports a gap that is not real. */
const TRANSIENT = new Set([429, 500, 502, 503, 504]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 8192, not 2048: these models spend reasoning tokens from the same output budget, so a
// tight cap truncates the JSON rather than producing a short answer.
export async function askJson(model: string, prompt: string, maxTokens = 8192): Promise<string> {
  let lastErr: Error = new Error("unreachable");
  let waitMs = 600;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt) await sleep(waitMs);
    try {
      return await once(model, prompt, maxTokens);
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      // A 429 naming quota/billing is a daily cap, not contention — retrying only burns
      // more of it. Back off on transient contention only.
      if (!/^Gemini HTTP (429|500|502|503|504)/.test(lastErr.message)) throw lastErr;
      // Prefer the server's own RetryInfo over a guess — an observed 429 asked for 34s,
      // which a 0.6-2.4s backoff would blow straight through.
      const asked = lastErr.message.match(/retryAfter=(\d+(?:\.\d+)?)s/);
      waitMs = asked ? Math.min(Number(asked[1]) * 1000 + 500, 40_000) : waitMs * 2;
    }
  }
  throw lastErr;
}

async function once(model: string, prompt: string, maxTokens: number): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set (see BUILD.md)");

  const res = await fetch(`${BASE}/models/${model}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        // Direction must not wobble between runs on identical input.
        temperature: 0,
        maxOutputTokens: maxTokens,
        // Ask for JSON at the API level; Zod still validates, because a declared mime
        // type is not a guarantee and a silently repaired object is an unattributed claim.
        responseMimeType: "application/json",
      },
    }),
  });

  if (!res.ok) {
    const raw = await res.text();
    let retry = "";
    try {
      const d = (JSON.parse(raw).error?.details ?? []) as { retryDelay?: string }[];
      const delay = d.find((x) => x.retryDelay)?.retryDelay;
      if (delay) retry = ` retryAfter=${delay}`;
    } catch {}
    throw new Error(
      `Gemini HTTP ${res.status}${TRANSIENT.has(res.status) ? " (transient)" : ""}${retry}: ${raw.slice(0, 200)}`,
    );
  }

  const body = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    promptFeedback?: { blockReason?: string };
  };
  if (body.promptFeedback?.blockReason) throw new Error(`blocked: ${body.promptFeedback.blockReason}`);

  const cand = body.candidates?.[0];
  const text = cand?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  // MAX_TOKENS yields a truncated object that would fail Zod confusingly — name it here.
  if (cand?.finishReason && !["STOP", "MAX_TOKENS"].includes(cand.finishReason)) {
    throw new Error(`finishReason ${cand.finishReason}`);
  }
  if (cand?.finishReason === "MAX_TOKENS") throw new Error("truncated: raise maxTokens");
  if (!text.trim()) throw new Error("empty completion");
  return text;
}

/** Models wrap JSON in prose or a fence even when asked not to. Take the outermost object. */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : text).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error(`no JSON object in completion: ${text.slice(0, 200)}`);
  return JSON.parse(candidate.slice(start, end + 1));
}
