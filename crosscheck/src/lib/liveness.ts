/**
 * The bitget-signal MCP fails SILENTLY. A dead upstream returns HTTP 200 with a
 * well-formed body carrying no data. Observed shapes (spike/raw/_STATUS.txt, 2026-09-12):
 *
 *   {"error": ""}                                     // empty message, not an error string
 *   {"alt_me_error": ""}
 *   {"error": "", "rates": {}}
 *   {"error": "", "url": "https://api.llama.fi/..."}  // the URL it failed to fetch
 *   {"cpi": {"error": ""}, "nonfarm_payrolls": {...}} // per-field errors
 *   [{"feed": "cointelegraph", "error": "", "items": []}]
 *   {"platform": "weibo", "provider": "all_failed", "items": []}
 *   {"effective_fed_funds": null, "note": "FOMC sets the target range..."}  // all null + static prose
 *
 * A client that only checks HTTP status, or truthiness of `error`, reads every one of
 * these as success and feeds emptiness to the LLM. So liveness is explicit and central.
 */

/** A real datum is numeric or a non-empty collection. Strings are prose that ships
 *  even when every value came back null, so they never count as evidence of life. */
function hasDatum(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "number") return Number.isFinite(v);
  if (typeof v === "boolean") return false; // e.g. yield_curve_inverted:false ships with all-null data
  if (typeof v === "string") return false;
  if (Array.isArray(v)) return v.some(hasDatum);
  if (typeof v === "object") return Object.values(v as object).some(hasDatum);
  return false;
}

function mentionsFailure(p: unknown): boolean {
  const blob = JSON.stringify(p) ?? "";
  return /"(?:[a-z_]*error)":/i.test(blob) || blob.includes("all_failed");
}

/** Returns null if the payload carries usable data, else a human reason it is unusable. */
export function deadReason(payload: unknown): string | null {
  if (payload === null || payload === undefined) return "empty response";
  if (typeof payload === "string") return payload.trim() ? "text-only response" : "empty response";
  if (mentionsFailure(payload)) return "upstream fetch failed (error field present)";
  if (Array.isArray(payload)) {
    if (payload.length === 0) return "empty array";
    if (payload.every((i) => i && typeof i === "object" && Array.isArray((i as { items?: unknown[] }).items)
        && (i as { items: unknown[] }).items.length === 0)) {
      return "all feeds returned zero items";
    }
  }
  if (!hasDatum(payload)) return "response contained no numeric or collection values";
  return null;
}

export const isAlive = (payload: unknown) => deadReason(payload) === null;
