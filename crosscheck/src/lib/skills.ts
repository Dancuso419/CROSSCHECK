/**
 * The five bitget-signal research Skills, and the MCP tools each one draws on.
 *
 * `measures` is the one-line description fed to the Pass-1 normalisation prompt
 * (05-prompts.md: WHAT THIS SOURCE MEASURES). Wording is from 03-skill-integration.md,
 * including each source's known bias , the crowd lags price, flows lead it , because that
 * framing is what makes the conflict ranking defensible rather than arbitrary.
 *
 * Tool lists were derived by grepping each installed SKILL.md, not guessed.
 */

export type SkillName =
  | "macro-analyst" | "market-intel" | "news-briefing" | "sentiment-analyst" | "technical-analysis";

export type Timeframe = "intraday" | "days" | "weeks" | "months";

export type McpCall = { tool: string; args: Record<string, unknown> };

export type SkillDef = {
  name: SkillName;
  measures: string;
  timeframe: Timeframe;
  /** Independence from price action. Flows are capital moving; sentiment derives from
   *  the same candles as TA, so their agreement is near-worthless as confirmation. */
  independence: "high" | "medium" | "low";
  calls: (ticker: string) => McpCall[];
};

/** BTC -> the shapes each upstream wants. Crypto only; see PROGRESS.md on equities. */
const pair = (t: string) => `${t.toUpperCase()}/USDT`;
const futures = (t: string) => `${t.toUpperCase()}USDT`;

export const SKILLS: SkillDef[] = [
  {
    name: "macro-analyst",
    measures:
      "Fed policy, rates, and cross-asset correlation (BTC vs DXY / Nasdaq / Gold). The slow-moving structural view, usually the contrarian voice when price has run, because macro rarely moves as fast as sentiment.",
    timeframe: "months",
    independence: "high",
    // Rates and macro releases are genuinely market-wide: they describe the weather
    // every asset trades in, so they take no ticker. The correlation does take one.
    calls: (t) => [
      { tool: "rates_yields", args: { action: "rates_snapshot" } },
      { tool: "macro_indicators", args: { action: "multi_indicator" } },
      { tool: "cross_asset", args: { action: "correlation", base: t.toLowerCase(), targets: "gold,dxy,ndx,spx", period: "90d" } },
    ],
  },
  {
    name: "market-intel",
    measures:
      "ETF flows, whale activity, exchange reserves, DeFi TVL and institutional positioning. The most independent of the five, because flows are actual capital movement rather than opinion or a derivative of price. When this conflicts with anything, the conflict is informative.",
    timeframe: "weeks",
    independence: "high",
    // Market cap and stablecoin supply are structural and market-wide. Network health
    // is not: asking for BTC mempool while the user typed ETH reports the wrong chain's
    // congestion as if it were evidence about theirs.
    calls: (t) => [
      { tool: "crypto_market", args: { action: "global" } },
      { tool: "defi_analytics", args: { action: "stablecoins", limit: 5 } },
      ...(t === "ETH"
        ? [{ tool: "network_status", args: { action: "eth_gas" } }]
        : t === "BTC"
          ? [{ tool: "network_status", args: { action: "btc_mempool" } }]
          : []),
    ],
  },
  {
    name: "news-briefing",
    measures:
      "News aggregation and narrative synthesis. The catalyst layer, which explains why the other four are saying what they say. Most prose-heavy and hardest to map to a direction, so neutral is the honest answer more often than not.",
    timeframe: "days",
    independence: "medium",
    calls: (t) => [
      { tool: "news_feed", args: { action: "latest", feeds: "cointelegraph,coindesk,decrypt,blockworks", keyword: t, limit: 5 } },
    ],
  },
  {
    name: "sentiment-analyst",
    measures:
      "Fear & Greed index, long/short ratio, open interest and funding. The crowd. Frequently a lagging derivative of price, so treat with suspicion, since its agreement with technical-analysis is near-worthless as confirmation since both are downstream of the same candles.",
    timeframe: "days",
    independence: "low",
    calls: (t) => [
      { tool: "sentiment_index", args: { action: "current" } },
      { tool: "derivatives_sentiment", args: { action: "long_short", symbol: futures(t), period: "4h" } },
      { tool: "derivatives_sentiment", args: { action: "open_interest", symbol: futures(t), period: "4h" } },
    ],
  },
  {
    name: "technical-analysis",
    measures:
      "Price-action indicators across trend, momentum and volatility, on two timeframes. The most structured of the five. An indicator set at war with itself is meaningful in its own right, so internal divergence is reported rather than averaged away.",
    timeframe: "intraday",
    independence: "low",
    // This Skill calls no MCP tool of its own , it is local Python + api.bitget.com.
    // We take Bitget klines from the MCP and run indicators.ts over them instead.
    calls: (t) => [
      { tool: "crypto_derivatives", args: { action: "klines", symbol: pair(t), timeframe: "4h", limit: 200, exchange: "bitget" } },
      { tool: "crypto_derivatives", args: { action: "klines", symbol: pair(t), timeframe: "1d", limit: 200, exchange: "bitget" } },
    ],
  },
];

export const skillByName = (n: SkillName) => SKILLS.find((s) => s.name === n)!;
