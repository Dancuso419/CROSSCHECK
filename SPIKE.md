# SPIKE — run before writing any product code

**Time budget: 2 hours. No UI. Throwaway code in `/spike`.**

Crosscheck rests on two assumptions the handbook does not confirm. Test both now.

---

## Question 1 — Do the Skills respond at all?

Call each of the five `bitget-signal` Skills. Handbook says no Bitget account and no API
key are required. Verify that.

- [ ] `macro-analyst`
- [ ] `market-intel`
- [ ] `news-briefing`
- [ ] `sentiment-analyst`
- [ ] `technical-analysis`

Record for each: auth needed? latency? rate limits observed?

## Question 2 — What shape is each response?

Dump the raw output of each Skill verbatim into `spike/raw/`. Do not summarise. We need to
see whether we are dealing with structured numerics, prose, or a mix.

Expected difficulty: `technical-analysis` likely returns indicator values;
`news-briefing` likely returns prose. Those are the two extremes — if they can both be
normalised, the rest will follow.

## Question 3 — Can one LLM pass normalise all five?

Attempt a single pass producing, per source:

```
{ source, direction: bullish|bearish|neutral, conviction: 0-1, evidence: string, timeframe }
```

Run it across **three tickers**: one large-cap equity, one mid-cap, one crypto major.

- [ ] Does every Skill map cleanly, or do some resist the schema?
- [ ] Is `direction` stable across repeat runs on the same input?
- [ ] Does `conviction` mean anything, or is the model just guessing a number?

**Instability here is a finding, not a failure to hide.** If conviction is noise, we drop
the field rather than shipping a number that looks precise and isn't.

## Question 4 — The one that can kill the idea

**Do the five sources actually disagree in informative ways?**

Or are all five downstream of the same recent price move, producing echo rather than
independent signal? If everything just reflects "price went up so sentiment is greedy and
TA is overbought and news is positive," there is no product here.

For each of the three tickers, record: how many sources conflict, and is the conflict
*interesting* or mechanical?

---

## Report back with

1. Which Skills work, and their auth/latency reality
2. Raw response shape per Skill
3. Whether normalisation held across 3 tickers
4. **A blunt yes/no on Question 4, with the evidence**
5. Your recommendation: build, adapt, or abandon

Do not start the app until this is answered. If the answer to Q4 is no, say so directly —
falling back to Weekend Desk with 10 days left is a good outcome; discovering this on
day 8 is not.
