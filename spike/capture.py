"""One-time capture of a five-source snapshot for the demo mode.

WHY THIS EXISTS
The bitget-signal MCP's upstream fetching has been down since before this project
started (see PROGRESS.md), so there has never been a live moment where all five Skills
reported. The AI Trading Desk track requires one complete research task demonstrated end
to end, and that cannot be shown with one source.

WHAT IT DOES
Fetches real, current data for the four degraded Skills directly from the same public
providers the MCP is built on, and takes technical-analysis from the MCP itself (its ccxt
path still works, so that source stays genuinely Bitget-sourced).

WHAT IT IS NOT
This is NOT a data path in the product. It runs offline, by hand, and writes a JSON file.
`crosscheck/` never calls these providers. The demo badge states exactly what this is and
when it ran, so the snapshot is never presented as live.

Usage:  python spike/capture.py [TICKER ...]     (default: BTC ETH SOL)
Writes: crosscheck/src/data/snapshot.json, keyed by ticker. Re-running one ticker
        updates only that entry, so a good capture is never lost to a bad one.
"""
import json, os, sys, time, urllib.request, xml.etree.ElementTree as ET

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mcp import Client

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "crosscheck", "src", "data", "snapshot.json")
UA = {"User-Agent": "crosscheck-capture/0 (hackathon demo snapshot)"}


def get(url, timeout=20):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def get_json(url, timeout=20):
    return json.loads(get(url, timeout))


def trace(tool, action, status, ms, detail=None):
    t = {"tool": tool, "action": action, "status": status, "latencyMs": ms}
    if detail:
        t["detail"] = detail
    return t


def timed(fn):
    t0 = time.time()
    try:
        return fn(), int((time.time() - t0) * 1000), None
    except Exception as e:
        return None, int((time.time() - t0) * 1000), f"{type(e).__name__}: {e}"


# ---------------------------------------------------------------- macro-analyst
def macro():
    raw, calls = {}, []
    # Treasury yields and cross-asset levels via Yahoo chart endpoint (no key needed).
    for key, sym in [("us_10y_yield", "%5ETNX"), ("us_2y_yield", "%5EFVX"), ("dxy", "DX-Y.NYB"),
                     ("gold", "GC%3DF"), ("nasdaq_100", "%5ENDX"), ("sp500", "%5EGSPC")]:
        def f(sym=sym):
            d = get_json(f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}?range=1mo&interval=1d")
            r = d["chart"]["result"][0]
            closes = [c for c in r["indicators"]["quote"][0]["close"] if c is not None]
            return {"last": round(closes[-1], 2), "month_ago": round(closes[0], 2),
                    "change_pct_1mo": round((closes[-1] / closes[0] - 1) * 100, 2)}
        val, ms, err = timed(f)
        calls.append(trace("global_assets", "price", "ok" if val else "dead", ms, err))
        if val:
            raw[key] = val
    if "us_10y_yield" in raw and "us_2y_yield" in raw:
        raw["spread_10y_2y"] = round(raw["us_10y_yield"]["last"] - raw["us_2y_yield"]["last"], 2)
        raw["yield_curve_inverted"] = raw["spread_10y_2y"] < 0
    return raw, calls


# ---------------------------------------------------------------- market-intel
def market_intel(ticker="BTC"):
    raw, calls = {}, []

    def global_data():
        d = get_json("https://api.coingecko.com/api/v3/global")["data"]
        return {"total_market_cap_usd": round(d["total_market_cap"]["usd"]),
                "total_volume_24h_usd": round(d["total_volume"]["usd"]),
                "btc_dominance_pct": round(d["market_cap_percentage"]["btc"], 2),
                "eth_dominance_pct": round(d["market_cap_percentage"]["eth"], 2),
                "market_cap_change_24h_pct": round(d["market_cap_change_percentage_24h_usd"], 2)}
    val, ms, err = timed(global_data)
    calls.append(trace("crypto_market", "global", "ok" if val else "dead", ms, err))
    if val:
        raw["market_overview"] = val

    def stablecoins():
        d = get_json("https://stablecoins.llama.fi/stablecoins?includePrices=false")
        top = sorted(d["peggedAssets"], key=lambda a: float(a["circulating"].get("peggedUSD") or 0), reverse=True)[:5]
        return [{"name": a["name"], "symbol": a["symbol"],
                 "circulating_usd": round(float(a["circulating"].get("peggedUSD") or 0)),
                 "change_7d_usd": round(float(a["circulating"].get("peggedUSD") or 0)
                                        - float((a.get("circulatingPrevWeek") or {}).get("peggedUSD") or 0))}
                for a in top]
    val, ms, err = timed(stablecoins)
    calls.append(trace("defi_analytics", "stablecoins", "ok" if val else "dead", ms, err))
    if val:
        raw["stablecoin_supply"] = val

    def tvl():
        d = get_json("https://api.llama.fi/v2/chains")
        top = sorted(d, key=lambda c: c.get("tvl") or 0, reverse=True)[:5]
        return [{"chain": c["name"], "tvl_usd": round(c["tvl"])} for c in top]
    val, ms, err = timed(tvl)
    calls.append(trace("defi_analytics", "tvl_rank", "ok" if val else "dead", ms, err))
    if val:
        raw["defi_tvl_by_chain"] = val

    # Network health is chain-specific: BTC mempool says nothing about Ethereum.
    if ticker in ("BTC", "ETH"):
        def net():
            if ticker == "BTC":
                d = get_json("https://mempool.space/api/v1/fees/recommended")
                return {"chain": "bitcoin", "recommended_fees_sat_vb": d}
            d = get_json("https://api.blocknative.com/gasprices/blockprices")
            b = d["blockPrices"][0]
            return {"chain": "ethereum", "base_fee_gwei": b.get("baseFeePerGas"),
                    "estimates": [{"confidence": e["confidence"], "price_gwei": e["price"]} for e in b["estimatedPrices"][:3]]}
        val, ms, err = timed(net)
        calls.append(trace("network_status", "btc_fees" if ticker == "BTC" else "eth_gas",
                           "ok" if val else "dead", ms, err))
        if val:
            raw["network_health"] = val

    return raw, calls


# ---------------------------------------------------------------- news-briefing
FEEDS = {
    "cointelegraph": "https://cointelegraph.com/rss",
    "coindesk": "https://www.coindesk.com/arc/outboundfeeds/rss/",
    "decrypt": "https://decrypt.co/feed",
}


def news(ticker="BTC"):
    raw, calls, items = {}, [], []
    names = {"BTC": ("bitcoin", "btc"), "ETH": ("ethereum", "eth"), "SOL": ("solana", "sol")}.get(ticker, (ticker.lower(),))
    for name, url in FEEDS.items():
        def f(url=url):
            root = ET.fromstring(get(url, timeout=25))
            out = []
            for it in root.iter("item"):
                title = (it.findtext("title") or "").strip()
                date = (it.findtext("pubDate") or "").strip()
                if title and any(nm in title.lower() for nm in names):
                    out.append({"feed": name, "title": title, "published": date})
                if len(out) >= 6:
                    break
            return out
        val, ms, err = timed(f)
        calls.append(trace("news_feed", "latest", "ok" if val else "dead", ms, err))
        if val:
            items += val
    if items:
        raw["headlines"] = items
        raw["feeds_returning"] = len({i["feed"] for i in items})
    return raw, calls


# ---------------------------------------------------------------- sentiment-analyst
def sentiment():
    raw, calls = {}, []

    def fng():
        d = get_json("https://api.alternative.me/fng/?limit=8")["data"]
        cur = d[0]
        return {"value": int(cur["value"]), "classification": cur["value_classification"],
                "history": [{"value": int(x["value"]), "classification": x["value_classification"]} for x in d]}
    val, ms, err = timed(fng)
    calls.append(trace("sentiment_index", "current", "ok" if val else "dead", ms, err))
    if val:
        raw["fear_and_greed"] = val

    # Binance futures (long/short, open interest) is DNS-blocked from this machine, so
    # positioning data is genuinely absent here. Recorded as unavailable rather than faked.
    calls.append(trace("derivatives_sentiment", "long_short", "dead", 0,
                       "api.binance.com unreachable from the capture host"))
    return raw, calls


# ---------------------------------------------------------------- technical-analysis
def technical(ticker="BTC"):
    """Straight from the Bitget MCP — this Skill's data path still works."""
    calls = []
    c = Client(timeout=30)
    out = {}
    for tf in ("4h", "1d"):
        t0 = time.time()
        payload, dt = c.call("crypto_derivatives", {"action": "klines", "symbol": f"{ticker}/USDT",
                                                    "timeframe": tf, "limit": 200, "exchange": "bitget"})
        ms = int((time.time() - t0) * 1000)
        ok = isinstance(payload, list) and len(payload) > 100
        calls.append(trace("crypto_derivatives", "klines", "ok" if ok else "dead", ms,
                           None if ok else "no klines returned"))
        if ok:
            out[tf] = payload
    return out, calls


def main():
    tickers = [t.upper() for t in sys.argv[1:]] or ["BTC", "ETH", "SOL"]

    # Merge rather than overwrite: re-running one ticker must not discard the others.
    existing = {}
    if os.path.exists(OUT):
        try:
            prev = json.load(open(OUT, encoding="utf-8"))
            existing = prev.get("tickers", {})
        except Exception:
            pass

    for ticker in tickers:
        print(f"\n=== {ticker} ===")
        sources = []
        for skill, fn in [
            ("macro-analyst", lambda t=ticker: macro()),
            ("market-intel", lambda t=ticker: market_intel(t)),
            ("news-briefing", lambda t=ticker: news(t)),
            ("sentiment-analyst", lambda t=ticker: sentiment()),
            ("technical-analysis", lambda t=ticker: technical(t)),
        ]:
            print(f"capturing {skill} ...", flush=True)
            raw, calls = fn()
            if raw:
                sources.append({"skill": skill, "status": "ok", "raw": raw, "calls": calls})
            else:
                reasons = "; ".join(sorted({c.get("detail", "") for c in calls if c.get("detail")}))
                sources.append({"skill": skill, "status": "unavailable",
                                "reason": reasons or "no data returned", "calls": calls})
            print(f"  -> {sources[-1]['status']} ({len(calls)} calls)")

        live = sum(1 for x in sources if x["status"] == "ok")
        existing[ticker] = {
            "capturedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
            "reporting": live,
            "sources": sources,
        }
        print(f"  {ticker}: {live}/5 captured")

    snapshot = {
        "note": (
            "Recorded snapshot. The bitget-signal MCP's upstream data fetching was down, so the "
            "affected Skills' data was captured directly from the same public providers the MCP is "
            "built on. technical-analysis came from the Bitget MCP itself, whose exchange data path "
            "still works. This is a recording, not live data, and the product never calls these "
            "providers itself."
        ),
        "tickers": existing,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(snapshot, f, indent=1)
    print(f"\nwrote {os.path.normpath(OUT)} — tickers: {', '.join(sorted(existing))}")


if __name__ == "__main__":
    main()
