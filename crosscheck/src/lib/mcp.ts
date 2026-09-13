/**
 * Streamable-HTTP client for the bitget-signal MCP (the official Bitget Agent Hub
 * research MCP). Server-side only — never import this into a client component.
 *
 * Three behaviours found during the spike that a naive client gets wrong:
 *   1. Cloudflare fronts the endpoint and 403s unknown/absent User-Agents.
 *   2. Responses are SSE (`text/event-stream`), not plain JSON.
 *   3. A failing upstream still answers 200 with an empty-string `error`. See liveness.ts.
 */

const MCP_URL = process.env.BITGET_MCP_URL ?? "https://datahub.noxiaohao.com/mcp";

// Dead upstreams take 16-41s to time out server-side. A cold demo must not hang on
// them, so every call is capped well below that and a timeout is just another dead source.
//
// 8s, not 12s: with four of five Skills down, every one of them burns this cap in full, so
// the cap IS most of the cold-path latency (14s of a 30s query). Live calls are nowhere
// near it — Bitget klines answer in 1-2s and the slowest healthy call measured was 2.9s —
// so 8s still leaves roughly a 3x margin over the worst real response. Raise it if a
// genuine source ever starts timing out.
const CALL_TIMEOUT_MS = Number(process.env.BITGET_MCP_TIMEOUT_MS ?? 8_000);

export type McpResult =
  | { ok: true; payload: unknown; latencyMs: number }
  | { ok: false; reason: string; latencyMs: number };

export class McpClient {
  private sessionId: string | null = null;
  private ready: Promise<void> | null = null;
  private nextId = 100;

  /** Every request needs its own JSON-RPC id. Reusing one id across concurrent calls on
   *  a shared session makes the transport correlate replies wrongly: during the spike a
   *  defi_analytics call came back holding another call's kline data. Silent data
   *  corruption, so this is not cosmetic. */
  private id() {
    return this.nextId++;
  }

  private async post(body: unknown, timeoutMs: number): Promise<string> {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetch(MCP_URL, {
        method: "POST",
        signal: ac.signal,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "User-Agent": "crosscheck/0.1", // required: CF rejects a missing UA
          ...(this.sessionId ? { "Mcp-Session-Id": this.sessionId } : {}),
        },
        body: JSON.stringify(body),
      });
      this.sessionId = res.headers.get("mcp-session-id") ?? this.sessionId;
      if (!res.ok) throw new Error(`MCP HTTP ${res.status}`);
      return await res.text();
    } finally {
      clearTimeout(timer);
    }
  }

  /** SSE frames look like `event: message\ndata: {...}`. Take the last data line. */
  private static parse(raw: string): Record<string, unknown> | null {
    if (!raw.trim()) return null; // notifications answer with no body
    const data = raw
      .split("\n")
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trim());
    return JSON.parse(data.length ? data[data.length - 1] : raw);
  }

  private handshake(): Promise<void> {
    this.ready ??= (async () => {
      await this.post(
        {
          jsonrpc: "2.0",
          id: this.id(),
          method: "initialize",
          params: {
            protocolVersion: "2025-06-18",
            capabilities: {},
            clientInfo: { name: "crosscheck", version: "0.1" },
          },
        },
        CALL_TIMEOUT_MS,
      );
      await this.post(
        { jsonrpc: "2.0", method: "notifications/initialized", params: {} },
        CALL_TIMEOUT_MS,
      );
    })().catch((e) => {
      this.ready = null; // let the next call retry the handshake
      throw e;
    });
    return this.ready;
  }

  async call(tool: string, args: Record<string, unknown>): Promise<McpResult> {
    let t0 = Date.now();
    try {
      await this.handshake();
      t0 = Date.now(); // measure the tool call, not the one-off session handshake
      const raw = await this.post(
        { jsonrpc: "2.0", id: this.id(), method: "tools/call", params: { name: tool, arguments: args } },
        CALL_TIMEOUT_MS,
      );
      const env = McpClient.parse(raw);
      const content = (env?.result as { content?: { text?: string }[] } | undefined)?.content;
      const text = content?.[0]?.text ?? "";
      // isError means the tool itself threw — distinct from a dead upstream.
      if ((env?.result as { isError?: boolean } | undefined)?.isError) {
        return { ok: false, reason: text || "tool error", latencyMs: Date.now() - t0 };
      }
      try {
        return { ok: true, payload: JSON.parse(text), latencyMs: Date.now() - t0 };
      } catch {
        return { ok: true, payload: text, latencyMs: Date.now() - t0 };
      }
    } catch (e) {
      const reason = e instanceof Error && e.name === "AbortError"
        ? `timeout after ${CALL_TIMEOUT_MS}ms`
        : e instanceof Error ? e.message : String(e);
      return { ok: false, reason, latencyMs: Date.now() - t0 };
    }
  }
}
