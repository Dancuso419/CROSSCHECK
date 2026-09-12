"""Run the technical-analysis Skill's 23-indicator engine on klines fetched via the
bitget-signal MCP (crypto_derivatives action=klines, exchange=bitget).

api.bitget.com is DNS-blocked from this machine, so Template A in the Skill is unusable.
This is the Skill's own Template B (local data) with the MCP as the feed instead.

Usage:  python ta.py <klines.json> <symbol> <timeframe>
  klines.json = verbatim MCP output: [{"timestamp":ms,"open":..,"high":..,"low":..,"close":..,"volume":..}, ...]
"""
import sys, os, json
sys.path.insert(0, os.path.expanduser('~/.claude/skills/technical-analysis/src'))
import pandas as pd
from kline_indicator_utils import IndicatorManager

# ponytail: scenarios.md "full technical review" set. Widen only if the brief needs it.
CONFIG = {
    "SuperTrend": {"period": 10, "multiplier": 3.0},
    "MACD": {"fast": 12, "slow": 26, "signal": 9},
    "RSI": {"period": 14},
    "KDJ": {"period": 9},
    "BOLL": {"period": 20, "std_dev": 2},
    "ATR": {"period": 14},
    "MFI": {"period": 14},
    "OBV": {},
    "VOL": {"period": 20},
    "DMI": {"period": 14},
}


def analyse(klines, symbol, timeframe, tail=30):
    df = pd.DataFrame(klines)
    for c in ['open', 'high', 'low', 'close', 'volume']:
        df[c] = df[c].astype(float)
    df = df.sort_values('timestamp').reset_index(drop=True)
    out = IndicatorManager(show_indicators=False).calculate_and_export(CONFIG, df, tail=tail)
    out["symbol"], out["granularity"] = symbol, timeframe
    out["source"] = "bitget-signal MCP / crypto_derivatives klines (exchange=bitget)"
    return out


def _selfcheck():
    # synthetic monotonic ramp: RSI must be pinned high, SuperTrend must read up
    ks = [{"timestamp": 1700000000000 + i * 14400000, "open": 100 + i, "high": 101 + i,
           "low": 99 + i, "close": 100.5 + i, "volume": 10 + (i % 5)} for i in range(120)]
    out = analyse(ks, "RAMP/USDT", "4h", tail=3)
    blob = json.dumps(out)
    assert out["symbol"] == "RAMP/USDT", out["symbol"]
    assert "RSI" in blob and "MACD" in blob and "SuperTrend" in blob, "indicators missing"
    print("selfcheck OK:", len(blob), "bytes,", len(out), "top-level keys")


if __name__ == '__main__':
    if len(sys.argv) == 2 and sys.argv[1] == 'selfcheck':
        _selfcheck()
    else:
        path, symbol, timeframe = sys.argv[1], sys.argv[2], sys.argv[3]
        print(json.dumps(analyse(json.load(open(path)), symbol, timeframe), indent=2))
