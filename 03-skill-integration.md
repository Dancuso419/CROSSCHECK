# Skill Integration — the core of this project

Judging for AI Trading Desk explicitly weighs **"number and effectiveness of data source /
Skill integrations."** Crosscheck is designed so that all five are load-bearing: remove one
and the product degrades, because the product *is* the comparison between them.

Do not treat this as a checklist to satisfy. Each Skill needs a real mapping.

> Skill capabilities below are transcribed from the handbook. **Verify actual response
> shapes in the spike before writing the normalisation prompt.**

---

## The five Skills and what each contributes

### 1. `macro-analyst`
**Provides:** Fed policy, rates, cross-asset correlation (BTC vs DXY / Nasdaq / Gold).
**Role in Crosscheck:** the slow-moving structural view. Usually the *contrarian* voice
when price has run — macro rarely moves as fast as sentiment.
**Timeframe:** weeks to months.
**Normalisation note:** likely prose. Direction must be inferred, not read off a field.

### 2. `market-intel`
**Provides:** ETF flows, whale activity, DeFi TVL, institutional positioning.
**Role:** the "smart money" view. The most *independent* of the five — flows are actual
capital movement, not opinion or a derivative of price.
**Timeframe:** days to weeks.
**Why it matters most:** when this conflicts with anything, the conflict is informative.

### 3. `news-briefing`
**Provides:** news aggregation, narrative synthesis, keyword search.
**Role:** the catalyst layer. Explains *why* the other four are saying what they say.
**Timeframe:** hours to days.
**Normalisation note:** most prose-heavy. Hardest to map to a direction. Consider allowing
`neutral` liberally rather than forcing a call.

### 4. `sentiment-analyst`
**Provides:** Fear & Greed, long/short ratio, funding rates.
**Role:** the crowd. Frequently a *lagging derivative of price* — treat with suspicion.
**Timeframe:** hours to days.
**Caution:** high correlation with `technical-analysis`. Their agreement is near-worthless
as confirmation; both are downstream of the same candles.

### 5. `technical-analysis`
**Provides:** 23 indicators across 6 categories.
**Role:** the price-action view. Most structured, easiest to normalise.
**Timeframe:** minutes to days.
**Caution:** 23 indicators will not agree with each other. Aggregate *within* this Skill
first, and surface internal divergence as its own signal — an indicator set at war with
itself is meaningful.

---

## Materiality matrix — the defensible judgment

Not all disagreements carry information. Rank conflicts by this, not by raw count.

| Conflict pair | Materiality | Why |
|---|---|---|
| `market-intel` × `macro-analyst` | **High** | Two genuinely independent views of positioning vs structure |
| `market-intel` × `sentiment-analyst` | **High** | Smart money against the crowd — classic informative divergence |
| `market-intel` × `technical-analysis` | **High** | Capital flow against price action; flows often lead |
| `macro-analyst` × `news-briefing` | **Medium** | A catalyst may or may not shift the structural view |
| `macro-analyst` × `technical-analysis` | **Medium** | Different timeframes — often not a real conflict |
| `news-briefing` × `sentiment-analyst` | **Medium** | Tests whether a narrative has been absorbed |
| `news-briefing` × `technical-analysis` | **Low–Medium** | Price may already reflect the news |
| `sentiment-analyst` × `technical-analysis` | **Low** | Both derive from price. Usually noise. |
| Internal divergence within `technical-analysis` | **Medium** | Indicator set disagreeing with itself is a real signal |

**Timeframe rule:** a conflict between two sources on different timeframes is often not a
conflict at all — macro bearish over months and TA bullish over days can both be true.
Flag these as *timeframe divergence*, a separate category from genuine contradiction. This
distinction is worth calling out explicitly in the UI; it is the kind of nuance that reads
as real domain thinking.

---

## Degradation policy

If a Skill fails or returns nothing, **say so in the output.** Show four of five with the
gap named. Never silently drop a source — a missing view changes the conflict picture, and
hiding that is exactly the false-confidence failure this product exists to prevent.

## Demo implication

The demo should visibly show all five being queried and all five reporting. That is the
judging criterion made literal on screen. Show the fan-out, do not hide it behind a
spinner.
