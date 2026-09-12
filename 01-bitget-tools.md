# Bitget Developer Stack — Reference Notes

> **These are notes transcribed from the handbook, not verified API docs.**
> Before writing integration code, fetch and read the live source:
> https://github.com/BitgetLimited/agent_hub
> Trust the repo README over this file wherever they disagree.

---

## What we actually need

For an **AI Trading Desk** entry, the perception layer is `bitget-signal`'s research
Skills. **These require no Bitget account and no API key.** That is the whole reason this
track is viable in the time available.

We do **not** need: order placement, an Agentic account, funded capital, or OAuth.

---

## bitget-signal — 5 research Skills, no auth required

| Skill | Capability |
|---|---|
| `macro-analyst` | Macro & cross-asset: Fed policy, BTC vs DXY / Nasdaq / Gold |
| `market-intel` | On-chain & institutional: ETF flows, whale activity, DeFi TVL |
| `news-briefing` | News aggregation & narrative synthesis, keyword search, morning briefings |
| `sentiment-analyst` | Fear & Greed index, long/short ratio, funding rates |
| `technical-analysis` | 23 indicators across 6 categories |

**Weekend Desk** leans on `news-briefing` + `macro-analyst` primarily.
**Hindsight** may use `technical-analysis` to add market context to a trade post-mortem —
optional, do not let it block the core loop.

Judging rewards "data sources / Skill integration count and effectiveness". Integrating
2–3 Skills *well* beats name-dropping all 5.

---

## Agent Hub — the wider platform

https://github.com/BitgetLimited/agent_hub

| Module | What it is |
|---|---|
| MCP Server | One-line config for Claude Desktop / Cursor / Windsurf / ChatGPT Desktop |
| CLI | `bgc` terminal tool — works with Claude Code / Codex CLI / OpenClaw |
| Tools | 89 UTA v3 operations condensed into 14 intent verbs |
| Skills | Trading Skills + the 5 `bitget-signal` research Skills above |
| Agentic Account | Dedicated sub-account, fund isolation, quota control, no withdrawals, OAuth |
| Market & Account Data | Crypto + US stocks. US stock futures live; spot on the roadmap |

Auto-setup prompt from the handbook (only if an account is ever needed):

```
Please read https://www.bitget.careers/support/articles/12560603894122
and help me complete the Bitget Agentic account authorization process.
```

---

## SAFETY — mandatory for this project

**We are building a research tool. It must never place an order.**

- Run any `bgc` session with `--read-only`.
- If write access ever becomes necessary, use `--paper-trading` (routes to Bitget's Demo
  environment, requires a separate Demo API Key) and preview with `dryRun`.
- Never connect a funded account.
- Never commit API keys. Use `.env`, and add it to `.gitignore` before the first commit.

---

## Bitget Playbook

https://www.bitget.com/zh-CN/activity/ai-get-agent/playbook?tab=explore

Natural-language → generated strategy → backtest on historical data → one-click deploy.
Built for the **Alpha Factory** track. **Not needed for our entries** — noted only so it
is not mistaken for a required dependency.

---

## Links

| Resource | URL |
|---|---|
| Submission form | https://forms.gle/GyWZCMCPocgJdJon6 |
| Handbook | https://bitget-ai.gitbook.io/bitgetai_hackathons2 |
| Agent Hub | https://github.com/BitgetLimited/agent_hub |
| Official Telegram | https://t.me/+o1tYqQ_lXxllYjgy |
| Official X | https://x.com/Bitget_AI |
| Landing page | https://www.bitget.com/activity-hub/hackathon |

Telegram is where technical questions get answered and where Bitget staff notice active
builders. Worth joining early.
