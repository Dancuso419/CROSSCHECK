/**
 * Indicator engine for the `technical-analysis` Skill.
 *
 * Why this file exists: that Skill ships a Python engine (`kline_indicator_utils`) and
 * calls api.bitget.com directly — neither is available in a Next.js route on Vercel.
 * The MCP's own `technical_analysis` tool is NOT a substitute: verified against this
 * engine and an independent hand calculation on the same 200 candles, it swaps Bollinger
 * upper/lower, sign-flips the MACD signal line (reporting a death cross on a bar that had
 * crossed up), and emits a buy/sell verdict we are required to strip.
 *
 * So: klines come from the MCP (Bitget data), indicators are computed here. Values are
 * pinned to the Python engine's output in indicators.test.ts.
 *
 * ponytail: 6 indicators across trend/momentum/volatility, not the Skill's full 23.
 * Enough for a direction read and real internal divergence. Add KDJ/MFI/OBV/DMI/
 * SuperTrend only if the brief demonstrably needs them.
 */

export type Candle = { timestamp: number; open: number; high: number; low: number; close: number; volume: number };

const ema = (xs: number[], n: number): number[] => {
  const a = 2 / (n + 1);
  const out = [xs[0]];
  for (let i = 1; i < xs.length; i++) out.push(xs[i] * a + out[i - 1] * (1 - a));
  return out;
};

/** Wilder's smoothing — seeded with a simple mean, as the Python engine does. */
const wilder = (xs: number[], n: number): number[] => {
  const out: number[] = Array(xs.length).fill(NaN);
  if (xs.length < n) return out;
  let acc = xs.slice(0, n).reduce((s, v) => s + v, 0) / n;
  out[n - 1] = acc;
  for (let i = n; i < xs.length; i++) {
    acc = (acc * (n - 1) + xs[i]) / n;
    out[i] = acc;
  }
  return out;
};

/** Sample standard deviation (ddof=1) — matches pandas .std(), which the Skill uses. */
const stdev = (xs: number[]): number => {
  const m = xs.reduce((s, v) => s + v, 0) / xs.length;
  return Math.sqrt(xs.reduce((s, v) => s + (v - m) ** 2, 0) / (xs.length - 1));
};

export type Indicators = {
  price: number;
  ma: { ma7: number; ma25: number; ma99: number };
  rsi: { value: number; period: 14 };
  macd: { dif: number; dea: number; hist: number; crossedUpBarsAgo: number | null; crossedDownBarsAgo: number | null };
  boll: { upper: number; middle: number; lower: number; pctB: number; bandwidth: number };
  atr: { atr: number; natr: number };
};

export function computeIndicators(raw: Candle[]): Indicators {
  const c = [...raw].sort((a, b) => a.timestamp - b.timestamp);
  const close = c.map((k) => k.close);
  const last = close.length - 1;

  const sma = (n: number) => close.slice(-n).reduce((s, v) => s + v, 0) / n;

  // RSI (Wilder)
  const gains: number[] = [0];
  const losses: number[] = [0];
  for (let i = 1; i < close.length; i++) {
    const d = close[i] - close[i - 1];
    gains.push(Math.max(d, 0));
    losses.push(Math.max(-d, 0));
  }
  const ag = wilder(gains.slice(1), 14);
  const al = wilder(losses.slice(1), 14);
  const agL = ag[ag.length - 1];
  const alL = al[al.length - 1];
  const rsi = alL === 0 ? 100 : 100 - 100 / (1 + agL / alL);

  // MACD 12/26/9
  const f = ema(close, 12);
  const s = ema(close, 26);
  const dif = f.map((v, i) => v - s[i]);
  const dea = ema(dif, 9);
  const hist = dif.map((v, i) => v - dea[i]);
  let up: number | null = null;
  let down: number | null = null;
  for (let i = last; i > 0; i--) {
    if (up === null && hist[i] > 0 && hist[i - 1] <= 0) up = last - i;
    if (down === null && hist[i] < 0 && hist[i - 1] >= 0) down = last - i;
    if (up !== null && down !== null) break;
  }

  // Bollinger 20/2
  const w = close.slice(-20);
  const middle = w.reduce((a, v) => a + v, 0) / 20;
  const sd = stdev(w);
  const upper = middle + 2 * sd;
  const lower = middle - 2 * sd;

  // ATR. The Skill computes ATR = EMA(TR, 14) (alpha 2/15), NOT Wilder smoothing, and
  // includes the first bar where prev_close is NaN so TR reduces to high-low. Both
  // details matter: Wilder here yields 842.34, which is the buggy MCP tool's value.
  const tr: number[] = [c[0].high - c[0].low];
  for (let i = 1; i < c.length; i++) {
    tr.push(Math.max(c[i].high - c[i].low, Math.abs(c[i].high - c[i - 1].close), Math.abs(c[i].low - c[i - 1].close)));
  }
  const atr = ema(tr, 14)[tr.length - 1];

  return {
    price: close[last],
    ma: { ma7: sma(7), ma25: sma(25), ma99: sma(99) },
    rsi: { value: rsi, period: 14 },
    macd: { dif: dif[last], dea: dea[last], hist: hist[last], crossedUpBarsAgo: up, crossedDownBarsAgo: down },
    boll: { upper, middle, lower, pctB: (close[last] - lower) / (upper - lower), bandwidth: (upper - lower) / middle },
    atr: { atr, natr: (atr / close[last]) * 100 },
  };
}
