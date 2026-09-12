"""Recovery probe: has the MCP's upstream fetching come back?

One representative tool per Skill, plus a ccxt control that is expected to pass.
Appends one line per run to spike/raw/_RECOVERY.log. Run daily until the Sept 15 gate.

Usage: python spike/probe.py
Exit code 0 = at least one dead Skill recovered (go look). 1 = no change.
"""
import datetime, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mcp import Client

LOG = os.path.join(os.path.dirname(os.path.abspath(__file__)), "raw", "_RECOVERY.log")

# one cheap, representative call per Skill. control must stay OK.
PROBES = [
    ("macro-analyst",      "rates_yields",   {"action": "fed_funds"}),
    ("market-intel",       "crypto_market",  {"action": "global"}),
    ("news-briefing",      "news_feed",      {"action": "latest", "feeds": "cointelegraph", "limit": 3}),
    ("sentiment-analyst",  "sentiment_index", {"action": "current"}),
    ("control/ccxt",       "crypto_derivatives", {"action": "ticker_24h", "symbol": "BTC/USDT",
                                                  "exchange": "bitget"}),
]


def alive(p):
    """The MCP fails silently: empty-string `error`, empty items, empty dicts.
    Only treat a payload as alive if it carries actual values."""
    if p is None or not isinstance(p, (dict, list)):
        return False
    if isinstance(p, dict) and "_raw" in p:
        return False          # tool-level exception
    blob = json.dumps(p)
    if '"error"' in blob or "all_failed" in blob:
        return False
    if isinstance(p, list):
        return bool(p) and not all(isinstance(i, dict) and not i.get("items", "x") for i in p)
    # a real datum is a number, list or dict. Bare strings are static prose ("note":
    # "FOMC sets the target range...") that ships even when every value came back null.
    return any(isinstance(v, (int, float, list, dict)) and v not in ({}, [], None)
               for v in p.values())


def main():
    c = Client(timeout=45)
    results = []
    for skill, tool, args in PROBES:
        try:
            payload, dt = c.call(tool, args)
            ok = alive(payload)
        except Exception as e:
            payload, dt, ok = {"_exception": repr(e)}, None, False
        results.append((skill, ok, dt))

    stamp = datetime.datetime.now().isoformat(timespec="seconds")
    line = stamp + "  " + "  ".join(
        f"{s}={'OK' if ok else 'dead'}{f'({dt}s)' if dt else ''}" for s, ok, dt in results)
    recovered = [s for s, ok, _ in results if ok and s != "control/ccxt"]
    if recovered:
        line += f"   *** RECOVERED: {', '.join(recovered)} ***"
    os.makedirs(os.path.dirname(LOG), exist_ok=True)
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(line + "\n")
    print(line)
    return 0 if recovered else 1


if __name__ == "__main__":
    sys.exit(main())
