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

export const MODEL_EXTRACT = process.env.GEMINI_MODEL_EXTRACT ?? "gemini-2.5-flash";
export const MODEL_REASON = process.env.GEMINI_MODEL_REASON ?? "gemini-2.5-pro";

export async function askJson(model: string, prompt: string, maxTokens = 2048): Promise<string> {
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

  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);

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
