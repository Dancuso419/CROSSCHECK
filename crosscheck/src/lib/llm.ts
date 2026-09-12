/**
 * LLM access over plain fetch. Server-side only — keys never reach the browser.
 * No SDK dependency: two POSTs do not justify one.
 *
 * Two providers, chosen by model name, so the same prompt suite can be run against both
 * and compared on evidence rather than reputation. `deepseek-*` routes to DeepSeek
 * (OpenAI-compatible), anything else to Gemini.
 *
 * The form requires a "Role of the LLM in Your Project" answer, so keep this accurate:
 * Pass 1 extracts a fixed schema from one Skill's output; Pass 2 explains conflicts that
 * materiality.ts has already identified and ranked. No model decides what counts as a
 * conflict, and no model ever sees raw Skill data and conflict guidance together.
 */
const GEMINI = "https://generativelanguage.googleapis.com/v1beta";
const DEEPSEEK = "https://api.deepseek.com/chat/completions";

// Both passes default to DeepSeek, chosen by measurement rather than reputation. The same
// four-case Pass 2 suite and the same Pass 1 stability harness were run against both
// providers (PROGRESS.md has the table):
//   - Correctness: gemini-3.5-flash, deepseek-chat and deepseek-reasoner all pass all four
//     cases. The structural guard in materiality.ts, not the model, is what prevents
//     manufactured conflict — so model choice is a latency and reliability decision.
//   - Pass 1 stability: deepseek-chat held conviction at 0.35 across 4 runs (spread 0.00);
//     gemini-2.5-flash varied 0.35-0.40 (spread 0.05). Same direction from both.
//   - Pass 2 latency: deepseek-chat 1.6-6.2s, gemini-3.5-flash 7.5-14.0s,
//     deepseek-reasoner 3.9-31.0s. The reasoner is rejected on latency, not quality.
//   - Free-tier reliability: Gemini's pro line is unusable on a new key (2.5-pro 404s,
//     3.1-pro-preview 429s through four retries) and one five-source fan-out exhausts
//     gemini-3.8-flash's RPM. DeepSeek hit no limits.
// Gemini stays fully wired as a fallback: set MODEL_EXTRACT / MODEL_REASON to a gemini-*
// id and the provider switches automatically.
export const MODEL_EXTRACT = process.env.MODEL_EXTRACT ?? "deepseek-chat";
export const MODEL_REASON = process.env.MODEL_REASON ?? "deepseek-chat";

export const providerOf = (model: string) => (/^deepseek/.test(model) ? "deepseek" : "gemini");

const TRANSIENT = new Set([429, 500, 502, 503, 504]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 8192, not 2048: these models spend reasoning tokens from the same output budget, so a
 *  tight cap truncates the JSON rather than producing a shorter answer. */
export async function askJson(model: string, prompt: string, maxTokens = 8192): Promise<string> {
  let lastErr: Error = new Error("unreachable");
  let waitMs = 600;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt) await sleep(waitMs);
    try {
      return providerOf(model) === "deepseek"
        ? await deepseekOnce(model, prompt, maxTokens)
        : await geminiOnce(model, prompt, maxTokens);
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      if (!/^LLM HTTP (429|500|502|503|504)/.test(lastErr.message)) throw lastErr;
      // A RetryInfo delay is the server telling us this is a short window, so honour it --
      // an observed 429 asked for 35s, which a 0.6-2.4s backoff blows straight through.
      // Its presence, not the word "quota", is what distinguishes a rate limit from a hard
      // cap: Gemini's per-minute 429 says "check your plan and billing details" too.
      const asked = lastErr.message.match(/retryAfter=(\d+(?:\.\d+)?)s/);
      if (asked) {
        waitMs = Math.min(Number(asked[1]) * 1000 + 1000, 45_000);
      } else {
        // No delay offered and it mentions exhausted credit: a hard cap, retrying burns more.
        if (/^LLM HTTP 429/.test(lastErr.message) && /billing|insufficient|balance/i.test(lastErr.message)) throw lastErr;
        waitMs *= 2;
      }
    }
  }
  throw lastErr;
}

function httpError(status: number, raw: string): Error {
  let retry = "";
  try {
    const details = (JSON.parse(raw).error?.details ?? []) as { retryDelay?: string }[];
    const delay = details.find((d) => d.retryDelay)?.retryDelay;
    if (delay) retry = ` retryAfter=${delay}`;
  } catch {}
  return new Error(`LLM HTTP ${status}${TRANSIENT.has(status) ? " (transient)" : ""}${retry}: ${raw.slice(0, 200)}`);
}

async function geminiOnce(model: string, prompt: string, maxTokens: number): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set (see BUILD.md)");

  const res = await fetch(`${GEMINI}/models/${model}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0, // direction must not wobble between runs on identical input
        maxOutputTokens: maxTokens,
        // Ask for JSON at the API level; Zod still validates, because a declared mime type
        // is not a guarantee and a silently repaired object is an unattributed claim.
        responseMimeType: "application/json",
      },
    }),
  });
  if (!res.ok) throw httpError(res.status, await res.text());

  const body = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    promptFeedback?: { blockReason?: string };
  };
  if (body.promptFeedback?.blockReason) throw new Error(`blocked: ${body.promptFeedback.blockReason}`);

  const cand = body.candidates?.[0];
  const text = cand?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (cand?.finishReason === "MAX_TOKENS") throw new Error("truncated: raise maxTokens");
  if (cand?.finishReason && cand.finishReason !== "STOP") throw new Error(`finishReason ${cand.finishReason}`);
  if (!text.trim()) throw new Error("empty completion");
  return text;
}

async function deepseekOnce(model: string, prompt: string, maxTokens: number): Promise<string> {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error("DEEPSEEK_API_KEY is not set (see BUILD.md)");

  const res = await fetch(DEEPSEEK, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      max_tokens: maxTokens,
      // json_object mode requires the literal word "json" in the prompt; every prompt here
      // says "Return ONLY valid JSON". The reasoner model rejects the flag, so skip it there.
      ...(model === "deepseek-reasoner" ? {} : { response_format: { type: "json_object" } }),
    }),
  });
  if (!res.ok) throw httpError(res.status, await res.text());

  const body = (await res.json()) as {
    choices?: { message?: { content?: string }; finish_reason?: string }[];
  };
  const choice = body.choices?.[0];
  const text = choice?.message?.content ?? "";
  if (choice?.finish_reason === "length") throw new Error("truncated: raise maxTokens");
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
