"use client";

import { useState } from "react";
import type { Brief } from "@/lib/schema";
import { MATERIALITY_TABLE } from "@/lib/materiality";

/* ---------------------------------------------------------------- types ---- */

type CallTrace = { tool: string; action: string; status: string; detail?: string; latencyMs: number };
type Source = {
  skill: string; measures: string; timeframe: string; status: "ok" | "unavailable";
  reason?: string; raw?: unknown; calls: CallTrace[];
};
type Normalised =
  | { skill: string; status: "ok"; value: { direction: string; conviction: number; timeframe: string; evidence: string; internal_divergence: string | null } }
  | { skill: string; status: "unavailable"; reason: string };
type Result = {
  ticker: string; fetchedAt: string; cached: boolean; reporting: number; total: number;
  sources: Source[]; normalised: Normalised[] | null; brief: Brief | null;
  analyseError: string | null; models: { extract: string; reason: string };
  timings: { fanoutMs: number; normaliseMs: number; conflictMs: number; totalMs: number };
  mode: "live" | "demo" | "scenario";
  snapshot: { capturedAt: string; note: string; ticker: string } | null;
  scenario: { id: string; title: string; teaches: string } | null;
};

const SOURCES = [
  ["macro-analyst", "Fed policy, rates, cross-asset structure. Months."],
  ["market-intel", "ETF flows, exchange reserves, stablecoin supply. Weeks."],
  ["news-briefing", "Narrative and catalyst. Days."],
  ["sentiment-analyst", "Fear and greed, positioning, funding. Days."],
  ["technical-analysis", "Trend, momentum, volatility. Intraday."],
] as const;

const SCENARIOS = [
  { id: "sharp-conflict", title: "Flows against macro" },
  { id: "strong-agreement", title: "All five aligned" },
  { id: "timeframe-divergence", title: "Bearish months, bullish intraday" },
  { id: "missing-source", title: "Two Skills unavailable" },
];

const MODES = [
  { id: "live", label: "Live", note: "Queries the Skills now. Four of five are returning no data." },
  { id: "demo", label: "Recorded", note: "Real market data, captured 12 September. Not live." },
  { id: "scenario", label: "Illustrative", note: "Constructed inputs — the fixtures the tests assert against." },
] as const;

/* The landing's worked example. Same numbers as the sharp-conflict fixture the
   Pass 2 suite asserts against, so the demonstration is the tested case. */
const EXAMPLE_SOURCES = [
  { source: "market-intel", direction: "bullish", conviction: 0.75, timeframe: "weeks" },
  { source: "macro-analyst", direction: "bearish", conviction: 0.7, timeframe: "months" },
  { source: "sentiment-analyst", direction: "bullish", conviction: 0.6, timeframe: "days" },
  { source: "technical-analysis", direction: "bearish", conviction: 0.5, timeframe: "intraday" },
  { source: "news-briefing", direction: "neutral", conviction: 0.3, timeframe: "days" },
];
const EXAMPLE_LINKS = [
  { sources: ["market-intel", "macro-analyst"] as [string, string], materiality: "high", is_timeframe_divergence: false },
  { sources: ["market-intel", "technical-analysis"] as [string, string], materiality: "high", is_timeframe_divergence: true },
  { sources: ["sentiment-analyst", "macro-analyst"] as [string, string], materiality: "medium", is_timeframe_divergence: true },
  { sources: ["sentiment-analyst", "technical-analysis"] as [string, string], materiality: "low", is_timeframe_divergence: false },
];

const AGREEMENT: Record<Brief["agreement_level"], string> = {
  strong_agreement: "The sources broadly agree",
  mixed: "The sources are mixed",
  sharp_conflict: "The sources sharply conflict",
};

/* ------------------------------------------------------------ ink marks ----
   One drawn set, one stroke weight. Rank and direction are encoded in form,
   never in colour: a red badge on a research page is a verdict in disguise.  */

const RANK: Record<string, number> = { high: 3, medium: 2, low: 1 };

function MaterialityMark({ level }: { level: string }) {
  const filled = RANK[level] ?? 1;
  // Rising bars, not three equal ones: equal filled bars read as a hamburger,
  // where ascending bars read as magnitude — which is what materiality is.
  return (
    <svg width="14" height="11" viewBox="0 0 14 11" aria-hidden className="shrink-0">
      {[0, 1, 2].map((i) => (
        <rect
          key={i}
          x={0.5 + i * 4.6}
          y={10.5 - (3.4 + i * 3.4)}
          width={3.2}
          height={3.4 + i * 3.4}
          fill={i < filled ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth={0.9}
        />
      ))}
    </svg>
  );
}

function DirectionMark({ direction }: { direction: string }) {
  const d =
    direction === "bullish"
      ? "M6 10.5V1.5M6 1.5L2.2 5.3M6 1.5L9.8 5.3"
      : direction === "bearish"
        ? "M6 1.5v9M6 10.5L2.2 6.7M6 10.5L9.8 6.7"
        : "M1.5 6h9";
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden className="shrink-0">
      <path d={d} stroke="currentColor" strokeWidth={1.25} fill="none" strokeLinecap="square" />
    </svg>
  );
}

function CallMark({ status }: { status: string }) {
  return (
    <svg width="9" height="9" viewBox="0 0 9 9" aria-hidden className="shrink-0">
      <rect x={1} y={1} width={7} height={7} strokeWidth={1} stroke="currentColor" fill={status === "ok" ? "currentColor" : "none"} />
      {status === "error" && <path d="M2 2l5 5M7 2l-5 5" stroke="currentColor" strokeWidth={1} />}
    </svg>
  );
}

/* ------------------------------------------------------- protocol marks ----
   Drawn, not glyphs: one 1.6 stroke on a 40-unit box, so they sit in the same
   ink as every other mark on the sheet. Used twice — at caption scale beside
   the assets they name, and at plate scale as watermarks under the page.     */

const COINS: Record<string, { name: string; d: string }> = {
  BTC: {
    name: "Bitcoin",
    d: "M13 11h11c5 0 5 8 0 8H13m0 0h12c6 0 6 9 0 9H13m0-17v17M17.5 7v25M22.5 7v25",
  },
  ETH: {
    name: "Ethereum",
    d: "M20 4 30 21 20 27 10 21ZM20 30 30 23 20 36 10 23Z",
  },
  SOL: {
    name: "Solana",
    d: "M13 9h18l-4 4.5H9ZM9 17.5h18l4 4.5H13ZM13 26h18l-4 4.5H9Z",
  },
  BNB: {
    name: "BNB Chain",
    d: "M20 5 35 20 20 35 5 20ZM20 13.5 26.5 20 20 26.5 13.5 20Z",
  },
  USDT: {
    name: "Tether",
    d: "M9 9h22M20 9v23M13.5 17.5h13",
  },
};

function CoinMark({ symbol, size = 40, strokeWidth = 1.6 }: { symbol: string; size?: number; strokeWidth?: number }) {
  const coin = COINS[symbol];
  if (!coin) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden className="shrink-0">
      <path d={coin.d} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinejoin="round" />
    </svg>
  );
}

/* Watermark field. Positions are hand-placed into the page's quiet regions
   rather than tiled, so no mark ever lands under a measure of reading copy. */
const WATERMARKS = [
  { symbol: "BTC", top: "3%", left: "-3%", size: 300, rotate: -8 },
  { symbol: "ETH", top: "26%", right: "-4%", size: 340, rotate: 10 },
  { symbol: "SOL", top: "56%", left: "-4%", size: 280, rotate: -5 },
  { symbol: "BNB", top: "78%", right: "-3%", size: 300, rotate: 7 },
  { symbol: "USDT", top: "92%", left: "6%", size: 240, rotate: -11 },
] as const;

function Watermarks() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {WATERMARKS.map((w, i) => (
        <div
          key={i}
          className="watermark"
          style={{
            top: w.top,
            left: "left" in w ? w.left : undefined,
            right: "right" in w ? w.right : undefined,
            transform: `rotate(${w.rotate}deg)`,
          }}
        >
          <CoinMark symbol={w.symbol} size={w.size} strokeWidth={0.7} />
        </div>
      ))}
    </div>
  );
}

function ArrowDown() {
  return (
    <svg width="16" height="26" viewBox="0 0 16 26" aria-hidden className="mx-auto">
      <path d="M8 0v24M8 24.5L1.5 18M8 24.5L14.5 18" stroke="currentColor" strokeWidth={1.1} fill="none" strokeLinecap="square" />
    </svg>
  );
}

/* ------------------------------------------------------------- the plate ---
   The figure this page was missing. Crosscheck's whole claim is that five
   sources point different ways over different horizons — which is a shape, not
   a sentence, and every version of this page before now only described it.

   Horizon runs left to right, direction bottom to top, so a source's position
   is its entire claim. Conviction sets the mark's size. A conflict is drawn as
   a link between two marks, its weight the materiality the code assigned, and
   dashed where the pair only diverges by horizon and is not a contradiction.
   No colour: the ranking is in the line weight, where it cannot be mistaken
   for a buy or a sell.                                                       */

const HORIZONS = ["intraday", "days", "weeks", "months"] as const;
const DIRECTIONS = ["bullish", "neutral", "bearish"] as const;

type PlateSource = { source: string; direction: string; conviction: number; timeframe: string };
type PlateLink = { sources: [string, string]; materiality: string; is_timeframe_divergence: boolean };

function SourcePlate({ sources, links }: { sources: PlateSource[]; links: PlateLink[] }) {
  const W = 760;
  const H = 330;
  const L = 96;
  const R = 18;
  const T = 20;
  const B = 44;
  const colW = (W - L - R) / HORIZONS.length;
  const rowH = (H - T - B) / DIRECTIONS.length;

  // Two sources can share a cell, so nudge them apart rather than overprint.
  const cells = new Map<string, PlateSource[]>();
  for (const s of sources) {
    const key = `${s.timeframe}|${s.direction}`;
    cells.set(key, [...(cells.get(key) ?? []), s]);
  }
  const pos = new Map<string, { x: number; y: number }>();
  for (const [key, group] of cells) {
    const [tf, dir] = key.split("|");
    const hi = Math.max(0, HORIZONS.indexOf(tf as (typeof HORIZONS)[number]));
    const di = Math.max(0, DIRECTIONS.indexOf(dir as (typeof DIRECTIONS)[number]));
    group.forEach((s, i) => {
      pos.set(s.source, {
        x: L + (hi + 0.5) * colW + (i - (group.length - 1) / 2) * 62,
        y: T + (di + 0.5) * rowH + (i - (group.length - 1) / 2) * 15,
      });
    });
  }

  const weight = (m: string) => (m === "high" ? 2 : m === "medium" ? 1.15 : 0.6);
  const size = (c: number) => 4 + Math.max(0, Math.min(1, c)) * 6;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img"
      aria-label="Each source plotted by the horizon it describes and the direction it reads, with its disagreements linked.">
      {/* horizon columns */}
      {HORIZONS.map((h, i) => (
        <g key={h}>
          {i > 0 && (
            <line x1={L + i * colW} y1={T} x2={L + i * colW} y2={H - B} stroke="var(--rule)" strokeWidth={1} />
          )}
          <text
            x={L + (i + 0.5) * colW} y={H - B + 20} textAnchor="middle"
            className="font-[family-name:var(--font-data)]"
            fontSize={11} letterSpacing="1.6" fill="var(--ink-3)"
          >
            {h.toUpperCase()}
          </text>
        </g>
      ))}

      {/* direction rows */}
      {DIRECTIONS.map((d, i) => (
        <g key={d}>
          <line
            x1={L} y1={T + (i + 0.5) * rowH} x2={W - R} y2={T + (i + 0.5) * rowH}
            stroke="var(--rule)" strokeWidth={d === "neutral" ? 1 : 0.6}
            strokeDasharray={d === "neutral" ? "none" : "2 4"}
          />
          <text
            x={L - 12} y={T + (i + 0.5) * rowH + 3.5} textAnchor="end"
            className="font-[family-name:var(--font-data)]"
            fontSize={11} letterSpacing="1.6" fill="var(--ink-3)"
          >
            {d.toUpperCase()}
          </text>
        </g>
      ))}

      {/* conflicts, drawn under the marks so the marks stay legible */}
      {links.map((l, i) => {
        const a = pos.get(l.sources[0]);
        const b = pos.get(l.sources[1]);
        if (!a || !b) return null;
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2 + (a.y < b.y ? -22 : 22);
        return (
          <path
            key={i}
            d={`M${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`}
            fill="none" stroke="var(--ink)" strokeWidth={weight(l.materiality)}
            strokeDasharray={l.is_timeframe_divergence ? "5 4" : "none"}
            opacity={l.materiality === "low" ? 0.45 : 0.85}
          />
        );
      })}

      {/* the sources */}
      {sources.map((s) => {
        const p = pos.get(s.source);
        if (!p) return null;
        const k = size(s.conviction);
        return (
          <g key={s.source}>
            <rect
              x={p.x - k / 2} y={p.y - k / 2} width={k} height={k}
              fill={s.direction === "neutral" ? "var(--sheet)" : "var(--ink)"}
              stroke="var(--ink)" strokeWidth={1.1}
            />
            <text
              x={p.x} y={p.y + k / 2 + 16} textAnchor="middle"
              className="font-[family-name:var(--font-data)]"
              fontSize={12} fill="var(--ink)"
              stroke="var(--sheet)" strokeWidth={3.5} paintOrder="stroke"
            >
              {s.source}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ---------------------------------------------------------------- atoms ---- */

function Label({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={`font-[family-name:var(--font-data)] text-[10px] uppercase tracking-[0.16em] text-[var(--ink-3)] ${className}`}
    >
      {children}
    </span>
  );
}

function Hair({ delay = 0 }: { delay?: number }) {
  return (
    <div
      aria-hidden
      className="rule-draw h-px bg-[var(--rule)]"
      style={{ animationDelay: `${delay}ms` }}
    />
  );
}

/* Section opener: a caption line, then the heading, then the sheet's own rule. */
function Opener({ label, title, delay = 0 }: { label: string; title: string; delay?: number }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 pb-3">
      <h2 className="font-[family-name:var(--font-display)] text-[1.5rem] leading-tight tracking-[-0.015em]">
        {title}
      </h2>
      <Label>{label}</Label>
      <div className="w-full pt-3">
        <Hair delay={delay} />
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- page ---- */

export default function Home() {
  const [ticker, setTicker] = useState("BTC");
  const [mode, setMode] = useState<"live" | "demo" | "scenario">("live");
  const [scenario, setScenario] = useState(SCENARIOS[0].id);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setRes(null);
    try {
      const r = await fetch("/api/crosscheck", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ticker, mode, scenario }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error ?? `The request failed (${r.status}).`);
      setRes(body);
      requestAnimationFrame(() => document.getElementById("brief")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const brief = res?.brief;
  const norm = (skill: string) => res?.normalised?.find((n) => n.skill === skill);
  const activeNote = MODES.find((m) => m.id === mode)!.note;

  const PAD = "px-5 sm:px-10 lg:px-16";

  return (
    <main className="min-h-dvh">
      <div className="sheet min-h-dvh">
        <Watermarks />
        {/* Everything below rides above the watermark field. */}
        {/* ================================================== masthead ==== */}
        <div className={`band flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3.5 ${PAD}`}>
          <div className="flex items-baseline gap-2.5">
            <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden>
              <path d="M1 4h13M1 11h13M4.5 1v13M10.5 1v13" stroke="currentColor" strokeWidth={1.2} fill="none" />
            </svg>
            <span className="font-[family-name:var(--font-data)] text-[0.9rem] font-medium tracking-[0.02em]">
              Crosscheck
            </span>
          </div>
          <Label>
            {res ? `No. ${res.ticker} · ` : ""}
            {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
            {" · Read-only · no verdict"}
          </Label>
        </div>

        {/* ====================================================== hero ==== */}
        <div className={`band py-14 text-center sm:py-20 ${PAD}`}>
          <h1 className="mx-auto max-w-[26ch] font-[family-name:var(--font-display)] text-[clamp(2.1rem,5.4vw,3.9rem)] leading-[1.04] tracking-[-0.022em]">
            Five research sources, and the disagreements that matter
          </h1>
          <p className="mx-auto mt-6 max-w-[64ch] text-[0.95rem] leading-relaxed text-[var(--ink-2)]">
            Crosscheck queries five independent Bitget research Skills on one ticker, ranks
            where they contradict each other by how much each contradiction is worth, and
            shows what would have to be true for each side to be right.
          </p>
        </div>

        {/* ================================ three cells: the pitch ======== */}
        <div className="band cells sm:grid-cols-[1fr_1.25fr_1fr]">
          {/* left: what is being asked */}
          <div className={`py-10 ${PAD}`}>
            <Label>The five sources</Label>
            <ul className="mt-4 space-y-3">
              {SOURCES.map(([name, what]) => (
                <li key={name}>
                  <div className="font-[family-name:var(--font-data)] text-[0.78rem]">{name}</div>
                  <div className="mt-0.5 text-[0.8rem] leading-snug text-[var(--ink-3)]">{what}</div>
                </li>
              ))}
            </ul>
          </div>

          {/* centre: the argument and the action */}
          <div className={`flex flex-col justify-center py-10 text-center sm:py-14 ${PAD}`}>
            <h2 className="mx-auto max-w-[20ch] font-[family-name:var(--font-display)] text-[clamp(1.6rem,3.4vw,2.3rem)] leading-[1.08] tracking-[-0.018em]">
              Consensus is the risk
            </h2>
            <p className="mx-auto mt-4 max-w-[42ch] text-[0.88rem] leading-relaxed text-[var(--ink-2)]">
              Every other tool flattens five views into one confident answer. That flattening is
              where a trader gets hurt.
            </p>

            <form onSubmit={run} className="mt-8">
              <div className="flex items-end justify-center gap-2.5">
                <Label className="pb-1.5">Ticker</Label>
                <input
                  value={ticker}
                  onChange={(e) => setTicker(e.target.value.toUpperCase())}
                  placeholder="BTC"
                  spellCheck={false}
                  aria-label="Ticker"
                  className="w-[5.5rem] border-0 border-b border-[var(--frame)] bg-transparent pb-1 text-center font-[family-name:var(--font-display)] text-[1.5rem] font-medium leading-none tracking-[-0.01em] outline-none"
                />
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-2">
                {MODES.map((m, i) => (
                  <span key={m.id} className="flex items-center gap-2.5">
                    {i > 0 && <span aria-hidden className="h-3 w-px bg-[var(--rule)]" />}
                    <button
                      type="button"
                      onClick={() => setMode(m.id)}
                      aria-pressed={mode === m.id}
                      className={`text-[0.82rem] transition-colors ${
                        mode === m.id
                          ? "font-medium text-[var(--ink)] underline decoration-[1.5px] underline-offset-[5px]"
                          : "text-[var(--ink-3)] hover:text-[var(--ink-2)]"
                      }`}
                    >
                      {m.label}
                    </button>
                  </span>
                ))}
              </div>

              {mode === "scenario" && (
                <label className="mt-4 flex items-baseline justify-center gap-2.5">
                  <Label>Case</Label>
                  <select
                    value={scenario}
                    onChange={(e) => setScenario(e.target.value)}
                    aria-label="Illustrative case"
                    className="border-0 border-b border-[var(--rule)] bg-transparent pb-0.5 pr-5 text-[0.82rem] outline-none"
                  >
                    {SCENARIOS.map((s) => (
                      <option key={s.id} value={s.id}>{s.title}</option>
                    ))}
                  </select>
                </label>
              )}

              <p className="mx-auto mt-4 max-w-[44ch] text-[0.75rem] leading-snug text-[var(--ink-3)]">
                {activeNote}
              </p>

              <button
                type="submit"
                disabled={busy}
                className="mt-6 font-[family-name:var(--font-display)] text-[1.15rem] italic underline decoration-[1.5px] underline-offset-[6px] transition-all hover:decoration-[2.5px] disabled:cursor-not-allowed disabled:text-[var(--ink-3)] disabled:no-underline"
              >
                {busy ? "Querying five Skills…" : "Compare the sources"}
              </button>
            </form>
          </div>

          {/* right: what it refuses to do */}
          <div className={`py-10 ${PAD}`}>
            <Label>What it refuses</Label>
            <ul className="mt-4 space-y-4 text-[0.83rem] leading-snug text-[var(--ink-2)]">
              <li>
                <span className="font-medium text-[var(--ink)]">No verdict.</span> No buy, sell or
                hold. No direction call, no price target.
              </li>
              <li>
                <span className="font-medium text-[var(--ink)]">No invented conflict.</span>{" "}
                Detection and ranking are deterministic code, not model judgment, so agreement can
                be reported as agreement.
              </li>
              <li>
                <span className="font-medium text-[var(--ink)]">No hidden gaps.</span> A source that
                fails is named with its reason. A missing view changes the picture.
              </li>
              <li>
                <span className="font-medium text-[var(--ink)]">No orders.</span> Read-only. It
                cannot reach an exchange.
              </li>
            </ul>
          </div>
        </div>

        {/* ======================================= the worked example ==== */}
        {!res && !busy && (
          <>
            <div className={`band cells py-0 sm:grid-cols-[1.35fr_1fr]`}>
              <figure className={`py-10 ${PAD}`}>
                <SourcePlate sources={EXAMPLE_SOURCES} links={EXAMPLE_LINKS} />
                <figcaption className="mt-4 text-[0.78rem] leading-relaxed text-[var(--ink-3)]">
                  <span className="font-[family-name:var(--font-display)] italic text-[var(--ink-2)]">
                    Example, constructed.{" "}
                  </span>
                  Mark size is how strongly a source states its view. A link is a disagreement,
                  its weight the materiality the code assigned; dashed where the two only differ
                  by horizon and can both be right.
                </figcaption>
              </figure>

              <div className={`flex flex-col justify-center py-10 ${PAD}`}>
                <p className="font-[family-name:var(--font-display)] text-[clamp(1.2rem,2.6vw,1.7rem)] leading-snug">
                  “Manufactured consensus hides the fact that the sources are in conflict.”
                </p>
                <p className="mt-5 max-w-[44ch] text-[0.86rem] leading-relaxed text-[var(--ink-2)]">
                  Read the plate left to right and you have the whole argument before a word of
                  prose: flows bullish over weeks, macro bearish over months, and the crowd and
                  the candles split at the short end. The heavy link is the one worth your
                  attention. The dashed ones are horizons talking past each other.
                </p>
                <div className="mt-7 text-[var(--ink-3)]">
                  <ArrowDown />
                </div>
              </div>
            </div>
          </>
        )}

        {/* ================================== how it works =============== */}
        {!res && !busy && (
          <>
            <div className={`band pt-10 ${PAD}`}>
              <Opener label="Four steps" title="What happens when you press it" />
            </div>
            <div className="band cells sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["Fan out", "One ticker goes to all five Skills at once. Every call, its status and its latency are printed below the brief — the gathering is shown, not hidden behind a spinner."],
                ["Normalise", "Each Skill's raw output becomes one comparable claim: a direction, how strongly it is held, the horizon it describes, and the figures it cites. One pass per source, so a malformed answer cannot corrupt the others."],
                ["Detect and rank", "Code decides which pairs actually conflict and what each conflict is worth. A model is never asked to find disagreement, which is why agreement can be reported as agreement."],
                ["Brief", "Each disagreement is explained with both cases — what would have to be true for either side to be right — and one observable that would settle it."],
              ].map(([title, body], i) => (
                <div key={title} className={`py-9 ${PAD}`}>
                  <div className="flex items-baseline gap-3">
                    <span aria-hidden className="font-[family-name:var(--font-display)] text-[2.1rem] leading-none text-[var(--ink-3)]">
                      {i + 1}
                    </span>
                    <h3 className="font-[family-name:var(--font-display)] text-[1.15rem] leading-tight">{title}</h3>
                  </div>
                  <p className="mt-3 max-w-[42ch] text-[0.85rem] leading-relaxed text-[var(--ink-2)]">{body}</p>
                </div>
              ))}
            </div>

            {/* ============================= the materiality matrix ======== */}
            <div className={`band py-10 ${PAD}`}>
              <Opener label="The defensible part" title="Which disagreements are worth your attention" />
              <p className="max-w-[74ch] text-[0.88rem] leading-relaxed text-[var(--ink-2)]">
                Anyone can count disagreements. The judgment is knowing which ones carry
                information. Sentiment and technicals contradict each other constantly and it means
                almost nothing — both are derived from the same candles. Capital flow
                contradicting macro structure means something, because the two are genuinely
                independent. That judgment is this table, and the table is the code: the page reads
                it from the same module the ranking runs on, so what is published here and what
                actually ranks your brief cannot drift apart.
              </p>

              <div className="mt-8 overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-[var(--frame)]">
                      <th className="py-2 pr-4"><Label>Pairing</Label></th>
                      <th className="py-2 pr-4"><Label>Worth</Label></th>
                      <th className="py-2"><Label>Why</Label></th>
                    </tr>
                  </thead>
                  <tbody>
                    {MATERIALITY_TABLE.map((row) => (
                      <tr key={`${row.a}|${row.b}`} className="border-b border-[var(--rule)] align-top">
                        <td className="py-3 pr-4 font-[family-name:var(--font-data)] text-[0.76rem] leading-snug">
                          {row.a}
                          <span className="text-[var(--ink-3)]"> × </span>
                          {row.b}
                        </td>
                        <td className="py-3 pr-4">
                          <span className="flex items-center gap-1.5">
                            <MaterialityMark level={row.materiality} />
                            <Label>{row.materiality}</Label>
                          </span>
                        </td>
                        <td className="max-w-[46ch] py-3 text-[0.84rem] leading-relaxed text-[var(--ink-2)]">
                          {row.why}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="mt-6 max-w-[74ch] text-[0.84rem] leading-relaxed text-[var(--ink-3)]">
                One rule sits on top of the table. Two sources pointing opposite ways across
                horizons two or more steps apart are usually not contradicting each other at all
                — bearish over months and bullish intraday can both be true. Those are marked
                as timeframe divergence and never counted as a sharp conflict.
              </p>
            </div>

            {/* =================================== covered assets ========== */}
            <div className={`band pt-10 ${PAD}`}>
              <Opener label="Crypto majors" title="What you can ask about" />
            </div>
            <div className="band cells sm:grid-cols-3">
              {[
                ["BTC", "The deepest coverage. All five Skills have something to say, and the technical plate runs on Bitget's own 4h and 1d candles."],
                ["ETH", "Same five sources, same ranking. Horizon and conviction are read per source, never inherited from BTC."],
                ["SOL", "Covered on the same path. Anything outside the majors has thinner source coverage, and the brief will say so."],
              ].map(([sym, body]) => (
                <div key={sym} className={`py-10 ${PAD}`}>
                  <div className="flex items-center gap-4">
                    <span className="text-[var(--ink)]">
                      <CoinMark symbol={sym} size={44} />
                    </span>
                    <div>
                      <div className="font-[family-name:var(--font-display)] text-[1.5rem] leading-none">{sym}</div>
                      <div className="mt-1"><Label>{COINS[sym].name}</Label></div>
                    </div>
                  </div>
                  <p className="mt-4 max-w-[40ch] text-[0.85rem] leading-relaxed text-[var(--ink-2)]">{body}</p>
                </div>
              ))}
            </div>

            {/* ================================= honest status ============= */}
            <div className={`band py-10 ${PAD}`}>
              <Opener label="As of today" title="What is actually working" />
              <div className="grid gap-x-12 gap-y-5 sm:grid-cols-2">
                <p className="max-w-[48ch] text-[0.86rem] leading-relaxed text-[var(--ink-2)]">
                  The research MCP behind the five Skills is currently returning no data for four
                  of them. That is an outage on the provider's side, not in this application. Live
                  mode says so plainly and names every gap, rather than quietly showing four fifths
                  of a picture and calling it a brief.
                </p>
                <p className="max-w-[48ch] text-[0.86rem] leading-relaxed text-[var(--ink-2)]">
                  <span className="font-[family-name:var(--font-display)] italic">Recorded</span>{" "}
                  runs the whole pipeline over a real five-source capture.{" "}
                  <span className="font-[family-name:var(--font-display)] italic">Illustrative</span>{" "}
                  runs it over the same constructed fixtures the test suite asserts against. Both
                  are labelled wherever they appear, and only the upstream data is stand-in —
                  the normalisation, the ranking and the brief run for real on top of it.
                </p>
              </div>
            </div>
          </>
        )}

        {/* =================================================== error ====== */}
        {err && (
          <div className={`band py-8 ${PAD}`}>
            <Label>Could not complete</Label>
            <p className="mt-2 max-w-[62ch] text-[0.92rem] leading-relaxed">{err}</p>
          </div>
        )}

        {/* ========================================== in-flight fan-out ===
            Shown while it happens rather than hidden behind a spinner.     */}
        {busy && (
          <div className={`band py-10 ${PAD}`}>
            <Opener label="In flight" title="Querying five Skills" />
            <ul>
              {SOURCES.map(([name]) => (
                <li key={name} className="flex items-center justify-between gap-4 border-b border-[var(--rule)] py-3 last:border-0">
                  <span className="font-[family-name:var(--font-data)] text-[0.8rem]">{name}</span>
                  <span aria-hidden className="relative h-px w-20 overflow-hidden bg-[var(--rule)]">
                    <span className="rule-travel absolute inset-y-0 left-0 w-1/4 bg-[var(--ink-2)]" />
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-5 max-w-[58ch] text-[0.78rem] leading-relaxed text-[var(--ink-3)]">
              Dead upstreams are capped at twelve seconds each, so a first query takes around half
              a minute. The result is cached afterwards.
            </p>
          </div>
        )}

        {/* =================================================== result ===== */}
        {res && (
          <div id="brief">
            {/* provenance, stated before anything it could be mistaken for */}
            {res.mode !== "live" && (
              <div className={`band py-5 ${PAD}`}>
                <Label>{res.mode === "demo" ? "Recorded snapshot" : "Illustrative example"}</Label>
                <p className="mt-2 max-w-[74ch] text-[0.82rem] leading-relaxed text-[var(--ink-2)]">
                  {res.mode === "demo" && res.snapshot && (
                    <>Real market data, captured {new Date(res.snapshot.capturedAt).toLocaleString()}. Not live. {res.snapshot.note}</>
                  )}
                  {res.mode === "scenario" && res.scenario && (
                    <>
                      Constructed data, not real market data — “{res.scenario.title}”.{" "}
                      {res.scenario.teaches} Conflict detection, ranking and the brief run for real
                      on these inputs; normalisation is skipped because the sources arrive already
                      normalised.
                    </>
                  )}
                </p>
              </div>
            )}

            {/* headline: the count at display scale, centred like the hero */}
            <div className={`band py-12 text-center ${PAD}`}>
              <div className="mb-3 flex items-center justify-center gap-3">
                <Label>
                  {res.mode === "demo" ? "Recorded" : res.mode === "scenario" ? "Illustrative" : res.cached ? "Cached" : "Live"}
                  {" · "}
                  {new Date(res.fetchedAt).toLocaleTimeString()}
                </Label>
              </div>
              <h2 className="font-[family-name:var(--font-display)] text-[clamp(2rem,6vw,3.4rem)] leading-[1] tracking-[-0.024em]">
                {res.ticker} · {res.reporting} of {res.total}
              </h2>
              <p className="mt-2 font-[family-name:var(--font-display)] text-[clamp(1rem,2.2vw,1.4rem)] italic text-[var(--ink-2)]">
                {brief ? AGREEMENT[brief.agreement_level] : "sources reporting"}
              </p>

              {res.analyseError && (
                <p className="mx-auto mt-6 max-w-[62ch] text-left text-[0.88rem] leading-relaxed text-[var(--ink-2)]">
                  The analysis pass did not complete: {res.analyseError}
                </p>
              )}

              {res.normalised && res.normalised.some((n) => n.status === "ok") && (
                <figure className="mx-auto mt-10 max-w-[52rem]">
                  <SourcePlate
                    sources={res.normalised.flatMap((n) =>
                      n.status === "ok"
                        ? [{ source: n.skill, direction: n.value.direction, conviction: n.value.conviction, timeframe: n.value.timeframe }]
                        : [],
                    )}
                    links={brief?.conflicts.map((c) => ({
                      sources: c.sources,
                      materiality: c.materiality,
                      is_timeframe_divergence: c.is_timeframe_divergence,
                    })) ?? []}
                  />
                </figure>
              )}

              {brief && (
                /* A drop cap: the summary is the page's one long read, and an editorial
                   page marks where the reading starts. */
                <p className="mx-auto mt-9 max-w-[70ch] text-left text-[0.98rem] leading-[1.62] [&::first-letter]:float-left [&::first-letter]:mt-[0.1em] [&::first-letter]:mr-[0.07em] [&::first-letter]:font-[family-name:var(--font-display)] [&::first-letter]:text-[3.1em] [&::first-letter]:leading-[0.78]">
                  {brief.consensus_summary}
                </p>
              )}
            </div>

            {/* --------------------------------------- disagreements ----- */}
            {brief && brief.conflicts.length > 0 && (
              <div className={`band py-10 ${PAD}`}>
                <Opener label={`${brief.conflicts.length} found`} title="Disagreements, most material first" />
                <ol>
                  {brief.conflicts.map((c, i) => (
                    <li key={i} className="grid grid-cols-[2.2rem_1fr] gap-x-4 border-b border-[var(--rule)] py-8 last:border-0 sm:grid-cols-[3.6rem_1fr] sm:gap-x-8">
                      {/* the ordinal carries information: this list is ranked */}
                      <span aria-hidden className="font-[family-name:var(--font-display)] text-[2.6rem] leading-[0.7] text-[var(--ink-3)] sm:text-[3.2rem]">
                        {i + 1}
                      </span>

                      <div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                          <h3 className="font-[family-name:var(--font-data)] text-[0.88rem]">
                            {c.sources[0]} <span className="text-[var(--ink-3)]">vs</span> {c.sources[1]}
                          </h3>
                          <span className="flex items-center gap-1.5">
                            <MaterialityMark level={c.materiality} />
                            <Label>{c.materiality}</Label>
                          </span>
                          {c.is_timeframe_divergence && (
                            <span className="border border-[var(--rule)] px-1.5 py-px">
                              <Label>timeframe divergence</Label>
                            </span>
                          )}
                        </div>

                        <p className="mt-2 max-w-[68ch] font-[family-name:var(--font-display)] text-[0.95rem] italic leading-snug text-[var(--ink-2)]">
                          {c.why_it_matters}
                        </p>

                        <p className="mt-4 max-w-[70ch] text-[0.93rem] leading-[1.6]">{c.description}</p>

                        {/* the two cases, divided by a rule rather than boxed */}
                        <div className="mt-7 grid gap-x-8 gap-y-6 sm:grid-cols-2">
                          {([[c.sources[0], c.case_for_a], [c.sources[1], c.case_for_b]] as const).map(
                            ([name, text], k) => (
                              <div key={name} className={k === 1 ? "sm:border-l sm:border-[var(--rule)] sm:pl-8" : ""}>
                                <Label>For {name} to be right</Label>
                                <p className="mt-2 text-[0.87rem] leading-[1.6] text-[var(--ink-2)]">{text || "—"}</p>
                              </div>
                            ),
                          )}
                        </div>

                        {c.what_would_resolve_it && (
                          <div className="mt-7">
                            <Hair delay={120} />
                            <p className="mt-3 max-w-[70ch] text-[0.9rem] leading-[1.6]">
                              <span className="font-[family-name:var(--font-display)] italic">What resolves it. </span>
                              {c.what_would_resolve_it}
                            </p>
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* agreement reported as agreement, not dressed as drama */}
            {brief && brief.conflicts.length === 0 && !res.analyseError && (
              <div className={`band py-12 text-center ${PAD}`}>
                <p className="mx-auto max-w-[46ch] font-[family-name:var(--font-display)] text-[clamp(1.15rem,2.4vw,1.55rem)] leading-snug">
                  No directional disagreement between the sources that reported.
                </p>
                <p className="mx-auto mt-4 max-w-[62ch] text-[0.88rem] leading-relaxed text-[var(--ink-2)]">
                  That is the finding. Nothing has been manufactured to fill this space — a page
                  that always finds conflict is a page nobody should trust.
                </p>
              </div>
            )}

            {/* ------------------------------- internal divergence ------- */}
            {brief && brief.internal_divergences.length > 0 && (
              <div className={`band py-10 ${PAD}`}>
                <Opener label="Medium materiality" title="Sources disagreeing with themselves" />
                <ul>
                  {brief.internal_divergences.map((d) => (
                    <li key={d.source} className="border-b border-[var(--rule)] py-4 last:border-0">
                      <div className="flex flex-wrap items-center gap-x-3">
                        <span className="font-[family-name:var(--font-data)] text-[0.84rem]">{d.source}</span>
                        <MaterialityMark level="medium" />
                      </div>
                      <p className="mt-2 max-w-[72ch] text-[0.89rem] leading-[1.6] text-[var(--ink-2)]">{d.detail}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* ----------------------------------------- named gaps ------ */}
            {brief && brief.unavailable_sources.length > 0 && (
              <div className={`band py-10 ${PAD}`}>
                <Opener label={`${brief.unavailable_sources.length} of ${res.total}`} title="Did not report" />
                <p className="max-w-[64ch] text-[0.84rem] leading-relaxed text-[var(--ink-3)]">
                  A missing view changes the conflict picture, so every gap is named rather than
                  quietly dropped.
                </p>
                <dl className="mt-5">
                  {brief.unavailable_sources.map((u) => (
                    <div key={u.source} className="flex flex-wrap items-baseline gap-x-3 border-b border-dashed border-[var(--rule)] py-2.5 last:border-0">
                      <dt className="font-[family-name:var(--font-data)] text-[0.82rem]">{u.source}</dt>
                      <dd className="text-[0.82rem] text-[var(--ink-3)]">{u.reason}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}

            {/* -------------------------------------------- appendix ----- */}
            <div className={`band py-10 ${PAD}`}>
              <Opener label="Provenance" title="How this was gathered" />
              <p className="max-w-[70ch] text-[0.83rem] leading-relaxed text-[var(--ink-3)]">
                Five Skills queried in parallel. Normalisation on {res.models.extract}, conflict
                explanation on {res.models.reason}. Detection and ranking are deterministic code,
                not model judgment.
                {res.mode === "scenario" && " No Skills were queried for this example, so no calls or latencies are shown."}
              </p>
              <p className="mt-2 font-[family-name:var(--font-data)] text-[0.74rem] text-[var(--ink-3)]">
                fan-out {(res.timings.fanoutMs / 1000).toFixed(1)}s · normalise{" "}
                {(res.timings.normaliseMs / 1000).toFixed(1)}s · conflict{" "}
                {(res.timings.conflictMs / 1000).toFixed(1)}s · total{" "}
                {(res.timings.totalMs / 1000).toFixed(1)}s
              </p>

              <ul className="mt-7">
                {res.sources.map((s) => {
                  const n = norm(s.skill);
                  return (
                    <li key={s.skill} className="border-t border-[var(--rule)] py-4">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                        <span className="font-[family-name:var(--font-data)] text-[0.84rem]">{s.skill}</span>
                        {n?.status === "ok" ? (
                          <span className="flex items-center gap-2 text-[0.8rem]">
                            <DirectionMark direction={n.value.direction} />
                            {n.value.direction}
                            <span className="text-[var(--ink-3)]">
                              conviction {n.value.conviction} · {n.value.timeframe}
                            </span>
                          </span>
                        ) : (
                          <span className="text-[0.8rem] italic text-[var(--ink-3)]">did not report</span>
                        )}
                      </div>

                      {s.calls.length > 0 && (
                        <ul className="mt-2.5 space-y-1">
                          {s.calls.map((c, i) => (
                            <li key={i} className="flex flex-wrap items-center gap-x-2.5 font-[family-name:var(--font-data)] text-[0.72rem] text-[var(--ink-3)]">
                              <span className={c.status === "ok" ? "text-[var(--ink-2)]" : ""}>
                                <CallMark status={c.status} />
                              </span>
                              <span>{c.tool}/{c.action}</span>
                              <span>{c.latencyMs}ms</span>
                              {c.detail && <span className="truncate">{c.detail}</span>}
                            </li>
                          ))}
                        </ul>
                      )}

                      {n?.status === "ok" && (
                        <p className="mt-2.5 max-w-[74ch] text-[0.82rem] leading-[1.6] text-[var(--ink-2)]">
                          {n.value.evidence}
                        </p>
                      )}

                      {s.status === "ok" && (
                        <details className="mt-2">
                          <summary className="cursor-pointer list-none text-[0.74rem] text-[var(--ink-3)] underline decoration-dotted underline-offset-[4px] hover:text-[var(--ink-2)]">
                            Raw output
                          </summary>
                          <pre className="mt-2 max-h-72 overflow-auto border border-[var(--rule)] bg-[var(--sheet-sunken)] p-3 font-[family-name:var(--font-data)] text-[0.7rem] leading-relaxed">
                            {JSON.stringify(s.raw, null, 2)}
                          </pre>
                        </details>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        )}

        {/* =================================================== colophon === */}
        <div className={`flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 py-5 ${PAD}`}>
          <p className="max-w-[66ch] text-[0.78rem] leading-relaxed text-[var(--ink-3)]">
            Crosscheck reports disagreement between sources. It issues no verdict, no direction
            call and no price target, and it is read-only — it cannot place an order.
          </p>
          <Label>Bitget AI Base Camp S2 · Open Theme</Label>
        </div>
      </div>
    </main>
  );
}
