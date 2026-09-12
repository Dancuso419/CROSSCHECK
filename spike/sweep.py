"""SPIKE Q1+Q2: call every MCP tool the five Skills depend on, for BTC.
Dumps raw unsummarised payloads to spike/raw/ and prints a status table."""
import json, os, sys, traceback
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mcp import Client

RAW = os.path.join(os.path.dirname(os.path.abspath(__file__)), "raw")
os.makedirs(RAW, exist_ok=True)

# (skill, tool, args) — tools taken from each SKILL.md / references
PLAN = [
    ("macro-analyst", "macro_indicators", {"action": "multi_indicator"}),
    ("macro-analyst", "macro_indicators", {"action": "fomc_news"}),
    ("macro-analyst", "rates_yields", {"action": "rates_snapshot"}),
    ("macro-analyst", "rates_yields", {"action": "yield_curve"}),
    ("macro-analyst", "cross_asset", {"action": "correlation", "base": "btc",
                                      "targets": "gold,dxy,ndx,spx", "period": "90d"}),
    ("macro-analyst", "global_assets", {"action": "price", "symbol": "BTC-USD"}),
    ("macro-analyst", "global_data", {"action": "forex", "base": "USD", "symbols": "EUR,JPY,CNY"}),

    ("market-intel", "crypto_market", {"action": "global"}),
    ("market-intel", "crypto_market", {"action": "markets", "per_page": 10}),
    ("market-intel", "defi_analytics", {"action": "tvl_rank", "limit": 5}),
    ("market-intel", "defi_analytics", {"action": "stablecoins", "limit": 5}),
    ("market-intel", "network_status", {"action": "btc_fees"}),
    ("market-intel", "network_status", {"action": "btc_mempool"}),
    ("market-intel", "dex_market", {"action": "trending", "limit": 5}),

    ("news-briefing", "news_feed", {"action": "latest", "feeds": "cointelegraph,coindesk,decrypt",
                                    "keyword": "bitcoin", "limit": 5}),
    ("news-briefing", "news_feed", {"action": "latest", "feeds": "all", "limit": 3}),
    ("news-briefing", "social_trending", {"action": "trending", "platform": "weibo", "limit": 5}),
    ("news-briefing", "tradfi_news", {"action": "crypto_news", "limit": 10}),

    ("sentiment-analyst", "sentiment_index", {"action": "current"}),
    ("sentiment-analyst", "sentiment_index", {"action": "history", "days": 7}),
    ("sentiment-analyst", "derivatives_sentiment", {"action": "long_short", "symbol": "BTCUSDT", "period": "4h"}),
    ("sentiment-analyst", "derivatives_sentiment", {"action": "open_interest", "symbol": "BTCUSDT", "period": "4h"}),
    ("sentiment-analyst", "derivatives_sentiment", {"action": "taker_ratio", "symbol": "BTCUSDT", "period": "4h"}),
    ("sentiment-analyst", "derivatives_sentiment", {"action": "reddit_trending", "limit": 10}),

    # technical-analysis calls NO mcp tool of its own (local python + api.bitget.com).
    # klines are the substitute feed; the MCP's own TA tool is recorded for comparison.
    ("technical-analysis", "crypto_derivatives", {"action": "klines", "symbol": "BTC/USDT",
                                                  "timeframe": "4h", "limit": 200, "exchange": "bitget"}),
    ("technical-analysis", "technical_analysis", {"action": "full_analysis", "symbol": "BTC/USDT",
                                                  "timeframe": "4h"}),
]


def classify(p):
    """Dead = the tool answered but the upstream fetch produced nothing."""
    if isinstance(p, dict):
        if "_raw" in p:
            return "ERROR"
        blob = json.dumps(p)
        if p.get("error") == "" or p.get("alt_me_error") == "":
            return "DEAD"
        if '"error": ""' in blob and len(blob) < 400:
            return "DEAD"
        if p.get("provider") == "all_failed":
            return "DEAD"
        if all(isinstance(v, dict) and "error" in v for v in p.values() if isinstance(v, dict)) \
                and any(isinstance(v, dict) and "error" in v for v in p.values()):
            return "DEAD"
    if isinstance(p, list):
        if not p:
            return "DEAD"
        if all(isinstance(i, dict) and i.get("items") == [] for i in p):
            return "DEAD"
    return "OK"


def main():
    c = Client(timeout=60)
    rows = []
    for skill, tool, args in PLAN:
        name = f"{skill}__{tool}_{args['action']}"
        try:
            payload, dt = c.call(tool, args)
            st = classify(payload)
        except Exception as e:
            payload, dt, st = {"_exception": repr(e), "_tb": traceback.format_exc()}, None, "TIMEOUT/EXC"
        blob = json.dumps({"skill": skill, "tool": tool, "args": args,
                           "status": st, "latency_s": dt, "payload": payload}, indent=2)
        open(os.path.join(RAW, name + ".json"), "w", encoding="utf-8").write(blob)
        rows.append((st, f"{dt}s" if dt is not None else "—", skill, f"{tool}/{args['action']}", len(blob)))
        print(f"{st:<11} {rows[-1][1]:>7}  {skill:<19} {tool}/{args['action']}", flush=True)

    print("\n--- tally ---")
    for st in ("OK", "DEAD", "ERROR", "TIMEOUT/EXC"):
        n = sum(1 for r in rows if r[0] == st)
        if n:
            print(f"{st}: {n}")


if __name__ == "__main__":
    main()
