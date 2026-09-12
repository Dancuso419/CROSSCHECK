/**
 * Anthropic Messages API over plain fetch. Server-side only — the key never reaches the
 * browser (CLAUDE.md). No SDK dependency: one POST does not justify one.
 */
const API = "https://api.anthropic.com/v1/messages";

// Pass 1 is extraction over a fixed schema, so it runs on Sonnet for latency across five
// parallel sources. Pass 2 is the reasoning step and gets Opus.
export const MODEL_EXTRACT = process.env.CROSSCHECK_MODEL_EXTRACT ?? "claude-sonnet-5";
export const MODEL_REASON = process.env.CROSSCHECK_MODEL_REASON ?? "claude-opus-5";

export async function askJson(model: string, prompt: string, maxTokens = 1024): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set (see BUILD.md)");

  const res = await fetch(API, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      // Deterministic-as-possible: direction must not wobble between runs on one input.
      temperature: 0,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = (await res.json()) as { content?: { type: string; text?: string }[] };
  const text = body.content?.filter((b) => b.type === "text").map((b) => b.text).join("") ?? "";
  if (!text.trim()) throw new Error("empty completion");
  return text;
}

/** Models like to wrap JSON in prose or a fence. Take the outermost object. */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : text).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error(`no JSON object in completion: ${text.slice(0, 200)}`);
  return JSON.parse(candidate.slice(start, end + 1));
}
