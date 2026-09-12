"""Minimal streamable-HTTP MCP client for the bitget-signal server.

This is the path the Next.js API routes will use: plain HTTPS to the official
Bitget-distributed MCP, no API key, server-side only. urllib only, no dependency.

Two gotchas found in the spike:
  - Cloudflare in front of the endpoint 403s urllib's default User-Agent.
  - Responses come back as SSE (text/event-stream), not plain JSON.

Usage: python mcp.py <tool> '<json args>' [outfile]
"""
import json, sys, time, urllib.request

URL = "https://datahub.noxiaohao.com/mcp"
HDRS = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream",
    "User-Agent": "crosscheck-spike/0",   # required: CF blocks the urllib default
}


class Client:
    def __init__(self, timeout=120):
        self.sid = None
        self.timeout = timeout
        self._handshake()

    def _post(self, payload):
        h = dict(HDRS)
        if self.sid:
            h["Mcp-Session-Id"] = self.sid
        req = urllib.request.Request(URL, json.dumps(payload).encode(), h)
        with urllib.request.urlopen(req, timeout=self.timeout) as r:
            self.sid = r.headers.get("mcp-session-id") or self.sid
            body = r.read().decode()
        if not body.strip():
            return None                       # notifications answer with no body
        data = [l[5:].strip() for l in body.splitlines() if l.startswith("data:")]
        return json.loads(data[-1] if data else body)

    def _handshake(self):
        self._post({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {
            "protocolVersion": "2025-06-18", "capabilities": {},
            "clientInfo": {"name": "crosscheck-spike", "version": "0"}}})
        self._post({"jsonrpc": "2.0", "method": "notifications/initialized", "params": {}})

    def call(self, tool, args):
        """Returns (parsed_payload, latency_seconds)."""
        t0 = time.time()
        r = self._post({"jsonrpc": "2.0", "id": 2, "method": "tools/call",
                        "params": {"name": tool, "arguments": args}})
        dt = round(time.time() - t0, 2)
        content = (r or {}).get("result", {}).get("content") or [{}]
        txt = content[0].get("text", "")
        try:
            return json.loads(txt), dt
        except Exception:
            return {"_raw": txt, "_envelope": r}, dt


if __name__ == "__main__":
    tool, args = sys.argv[1], json.loads(sys.argv[2])
    payload, dt = Client().call(tool, args)
    blob = json.dumps(payload, indent=2)
    if len(sys.argv) > 3:
        open(sys.argv[3], "w").write(blob)
        print(f"{tool} -> {sys.argv[3]}  {dt}s  {len(blob)} bytes")
    else:
        print(f"# latency {dt}s", file=sys.stderr)
        print(blob)
