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
  snapshotTickers?: string[];
};

/* Which tickers have a recording. Mirrors snapshot.json; the route sends the
   authoritative list back with every response. */
const RECORDED = ["BTC", "ETH", "SOL"];

const SOURCES = [
  ["macro-analyst", "The economy", "Interest rates, inflation, the strength of the dollar. Slow to move, and it sets the weather everything else trades in."],
  ["market-intel", "The money", "What large institutions are actually doing: fund inflows, coins leaving exchanges, stablecoins being readied to buy with."],
  ["news-briefing", "The story", "What is being reported, and which narrative is forming around it before it shows up in the price."],
  ["sentiment-analyst", "The crowd", "Fear and greed, and how heavily ordinary traders are betting in one direction."],
  ["technical-analysis", "The chart", "Trend, momentum and volatility read straight off the candles. Fastest to move, and the easiest to over-read."],
] as const;

const SCENARIOS = [
  { id: "sharp-conflict", title: "Flows against macro" },
  { id: "strong-agreement", title: "All five aligned" },
  { id: "timeframe-divergence", title: "Bearish months, bullish intraday" },
  { id: "missing-source", title: "Two Skills unavailable" },
];

const MODES = [
  { id: "live", label: "Live", note: "Queries the Skills now. Four of five are returning no data." },
  { id: "demo", label: "Recorded", note: "Real market data, captured and held. Not live." },
  { id: "scenario", label: "Illustrative", note: "Constructed inputs, the same fixtures the tests assert against." },
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

/* Conviction as a filled bar. "0.35" means nothing to someone new; a bar that is
   a third full is read instantly. Ten cells so the value stays countable. */
function ConvictionBar({ value }: { value: number }) {
  const filled = Math.round(Math.max(0, Math.min(1, value)) * 10);
  return (
    <svg width="52" height="9" viewBox="0 0 52 9" aria-hidden className="shrink-0">
      {Array.from({ length: 10 }, (_, i) => (
        <rect
          key={i}
          x={i * 5.2 + 0.5}
          y={0.5}
          width={4.2}
          height={8}
          fill={i < filled ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth={0.7}
        />
      ))}
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
  BTC: { name: "Bitcoin", d: "M13 11h11c5 0 5 8 0 8H13m0 0h12c6 0 6 9 0 9H13m0-17v17M17.5 7v25M22.5 7v25" },
  ETH: { name: "Ethereum", d: "M20 4 30 21 20 27 10 21ZM20 30 30 23 20 36 10 23Z" },
  SOL: { name: "Solana", d: "M13 9h18l-4 4.5H9ZM9 17.5h18l4 4.5H13ZM13 26h18l-4 4.5H9Z" },
  BNB: { name: "BNB Chain", d: "M20 5 35 20 20 35 5 20ZM20 13.5 26.5 20 20 26.5 13.5 20Z" },
  USDT: { name: "Tether", d: "M9 9h22M20 9v23M13.5 17.5h13" },
  XRP: { name: "XRP", d: "M8 8c6 9 18 9 24 0M8 32c6-9 18-9 24 0" },
  ADA: { name: "Cardano", d: "M20 15.5a4.5 4.5 0 1 0 .1 0ZM20 4a3 3 0 1 0 .1 0ZM20 33a3 3 0 1 0 .1 0ZM7 12a3 3 0 1 0 .1 0ZM33 12a3 3 0 1 0 .1 0ZM7 25a3 3 0 1 0 .1 0ZM33 25a3 3 0 1 0 .1 0Z" },
  DOGE: { name: "Dogecoin", d: "M15 9h7c8 0 8 22 0 22h-7V9M9 20h12" },
  LINK: { name: "Chainlink", d: "M20 5 33 12.5v15L20 35 7 27.5v-15ZM20 13 27 17v6l-7 4-7-4v-6Z" },
  AVAX: { name: "Avalanche", d: "M20 5 35 33H5ZM24 33l-5-9-5 9" },
  DOT: { name: "Polkadot", d: "M20 6c5 0 9 2.2 9 5s-4 5-9 5-9-2.2-9-5 4-5 9-5ZM11 22c2.5-4.3 6.6-6.4 9-5s1.6 6-0.9 10.3-6.6 6.4-9 5-1.6-6 .9-10.3ZM29 22c2.5 4.3 3.3 8.9.9 10.3s-6.5-.7-9-5-3.3-8.9-.9-10.3 6.5.7 9 5Z" },
  LTC: { name: "Litecoin", d: "M23 8h-5l-4 16h13M9 21l13-4.5" },
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

/* Watermark field. Hand-placed into the page’s quiet regions rather than tiled,
   so no mark ever lands under a measure of reading copy. Each one drifts on one of
   three paths and turns inside that drift, on periods that never line up.

   Turn these up if the field should be livelier — DRIFT_SECONDS down for faster
   travel, TURN_SECONDS down for faster rotation. Both are deliberately slow: motion
   in the periphery of a prose-heavy page competes with reading. */
const DRIFT_SECONDS = 46;
const TURN_SECONDS = 300;

const WATERMARKS = [
  { symbol: "BTC", top: "2%", left: "-4%", size: 300, r: -8, path: "a", k: 1.0 },
  { symbol: "ETH", top: "12%", right: "-3%", size: 330, r: 10, path: "b", k: 1.3 },
  { symbol: "XRP", top: "23%", left: "4%", size: 220, r: -14, path: "c", k: 0.8 },
  { symbol: "SOL", top: "33%", left: "-3%", size: 280, r: -5, path: "b", k: 1.5 },
  { symbol: "LINK", top: "40%", right: "5%", size: 250, r: 12, path: "a", k: 0.9 },
  { symbol: "ADA", top: "51%", right: "-4%", size: 300, r: 6, path: "c", k: 1.2 },
  { symbol: "DOGE", top: "60%", left: "6%", size: 230, r: -10, path: "a", k: 1.6 },
  { symbol: "BNB", top: "69%", right: "3%", size: 290, r: 7, path: "b", k: 1.1 },
  { symbol: "AVAX", top: "78%", left: "-2%", size: 260, r: -6, path: "c", k: 1.4 },
  { symbol: "DOT", top: "86%", right: "6%", size: 240, r: 9, path: "a", k: 0.85 },
  { symbol: "USDT", top: "93%", left: "5%", size: 230, r: -11, path: "b", k: 1.25 },
  { symbol: "LTC", top: "97%", right: "-3%", size: 250, r: 5, path: "c", k: 1.05 },
] as const;

function Watermarks() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {WATERMARKS.map((w, i) => (
        <div
          key={i}
          className="watermark"
          style={{
            top: w.top,
            left: "left" in w ? w.left : undefined,
            right: "right" in w ? w.right : undefined,
            animation: `drift-${w.path} ${DRIFT_SECONDS * w.k}s ease-in-out ${-i * 3}s infinite`,
          }}
        >
          <div
            className="wm-turn"
            style={
              {
                "--r": `${w.r}deg`,
                "--turn": `${TURN_SECONDS * w.k}s`,
              } as React.CSSProperties
            }
          >
            <CoinMark symbol={w.symbol} size={w.size} strokeWidth={0.7} />
          </div>
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
            opacity={l.materiality === "low" ? 0.45 : 0.85}
            className={l.is_timeframe_divergence ? undefined : "plate-link"}
            strokeDasharray={l.is_timeframe_divergence ? "5 4" : undefined}
            style={
              l.is_timeframe_divergence
                ? undefined
                : ({ "--len": 520, animationDelay: `${260 + i * 130}ms` } as React.CSSProperties)
            }
          />
        );
      })}

      {/* the sources */}
      {sources.map((s, i) => {
        const p = pos.get(s.source);
        if (!p) return null;
        const k = size(s.conviction);
        return (
          <g key={s.source}>
            <rect
              className="plate-mark"
              style={{ animationDelay: `${i * 90}ms` }}
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

  function chooseMode(m: "live" | "demo" | "scenario") {
    setMode(m);
    // Recorded only has captures for some tickers, so entering it with an
    // uncovered ticker would fail on submit. Snap to a covered one instead.
    if (m === "demo" && !RECORDED.includes(ticker)) setTicker(RECORDED[0]);
  }

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
          <a
            href="/"
            aria-label="Crosscheck home"
            className="flex items-baseline gap-2.5 no-underline transition-opacity hover:opacity-70"
          >
            <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden>
              <path d="M1 4h13M1 11h13M4.5 1v13M10.5 1v13" stroke="currentColor" strokeWidth={1.2} fill="none" />
            </svg>
            <span className="font-[family-name:var(--font-data)] text-[0.9rem] font-medium tracking-[0.02em]">
              Crosscheck
            </span>
          </a>
          <Label>
            {res ? `No. ${res.ticker} · ` : ""}
            {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
            {" · Read-only · no verdict"}
          </Label>
        </div>

        {/* ====================================================== hero ==== */}
        <div className={`band pt-16 pb-10 text-center sm:pt-28 sm:pb-20 ${PAD}`}>
          <h1 className="mx-auto max-w-[24ch] font-[family-name:var(--font-display)] text-[clamp(2.1rem,5.4vw,3.9rem)] leading-[1.04] tracking-[-0.022em]">
            Five kinds of research on one coin, and every place they disagree
          </h1>
          <p className="mx-auto mt-7 max-w-[68ch] text-[1.02rem] leading-[1.6] text-[var(--ink-2)]">
            The economy, the money, the news, the crowd and the chart rarely say the same thing
            about a coin at the same time. Crosscheck asks all five, then shows you exactly where
            they contradict each other, which contradictions are worth your attention, and what to
            watch to find out who was right.
          </p>
          <p className="mx-auto mt-4 max-w-[56ch] text-[0.9rem] leading-relaxed text-[var(--ink-3)]">
            It never tells you to buy or sell. That part stays yours.
          </p>
        </div>

        {/* ================================ three cells: the pitch ======== */}
        <div className="band cells sm:grid-cols-[1fr_1.25fr_1fr]">
          {/* left: what is being asked */}
          <div className={`py-8 sm:py-10 ${PAD}`}>
            <Label>The five sources</Label>
            <ul className="mt-4 space-y-4">
              {SOURCES.map(([name, plain, what]) => (
                <li key={name}>
                  <div className="font-[family-name:var(--font-display)] text-[1.02rem] leading-none">{plain}</div>
                  <div className="mt-1 font-[family-name:var(--font-data)] text-[0.7rem] text-[var(--ink-3)]">{name}</div>
                  <div className="mt-1.5 max-w-[38ch] text-[0.81rem] leading-snug text-[var(--ink-2)]">{what}</div>
                </li>
              ))}
            </ul>
          </div>

          {/* centre: the argument and the action */}
          <div className={`flex flex-col justify-center py-9 text-center sm:py-14 ${PAD}`}>
            <h2 className="mx-auto max-w-[20ch] font-[family-name:var(--font-display)] text-[clamp(1.6rem,3.4vw,2.3rem)] leading-[1.08] tracking-[-0.018em]">
              Consensus is the risk
            </h2>
            <p className="mx-auto mt-4 max-w-[42ch] text-[0.88rem] leading-relaxed text-[var(--ink-2)]">
              Every other tool flattens five views into one confident answer. That flattening is
              where a trader gets hurt.
            </p>

            <form onSubmit={run} className="mt-8">
              {mode === "live" ? (
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
              ) : (
                /* A control that cannot change the outcome should not look editable. */
                <div className="flex flex-col items-center gap-1.5">
                  <Label>{mode === "demo" ? "Recorded ticker" : "Not tied to a ticker"}</Label>
                  {mode === "demo" ? (
                    <div className="flex items-baseline gap-3">
                      {RECORDED.map((t, i) => (
                        <span key={t} className="flex items-baseline gap-3">
                          {i > 0 && <span aria-hidden className="h-3 w-px self-center bg-[var(--rule)]" />}
                          <button
                            type="button"
                            onClick={() => setTicker(t)}
                            aria-pressed={ticker === t}
                            className={`font-[family-name:var(--font-display)] text-[1.35rem] font-medium leading-none transition-colors ${
                              ticker === t
                                ? "text-[var(--ink)] underline decoration-[1.5px] underline-offset-[6px]"
                                : "text-[var(--ink-3)] hover:text-[var(--ink-2)]"
                            }`}
                          >
                            {t}
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="font-[family-name:var(--font-display)] text-[1.5rem] font-medium leading-none text-[var(--ink-2)]">
                      Constructed example
                    </span>
                  )}
                  <span className="max-w-[34ch] text-center text-[0.72rem] leading-snug text-[var(--ink-3)]">
                    {mode === "demo"
                      ? "Three five-source captures exist. Switch to Live to query any other ticker."
                      : "These cases are built to exercise the ranking, so no real ticker is involved. Switch to Live to query one."}
                  </span>
                </div>
              )}

              <div className="mt-5 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-2">
                {MODES.map((m, i) => (
                  <span key={m.id} className="flex items-center gap-2.5">
                    {i > 0 && <span aria-hidden className="h-3 w-px bg-[var(--rule)]" />}
                    <button
                      type="button"
                      onClick={() => chooseMode(m.id)}
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
          <div className={`py-8 sm:py-10 ${PAD}`}>
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
              <figure className={`py-8 sm:py-10 ${PAD}`}>
                <div className="-mx-1 overflow-x-auto pb-1">
                  <div className="min-w-[34rem]">
                    <SourcePlate sources={EXAMPLE_SOURCES} links={EXAMPLE_LINKS} />
                  </div>
                </div>
                <figcaption className="mt-4 text-[0.78rem] leading-relaxed text-[var(--ink-3)]">
                  <span className="font-[family-name:var(--font-display)] italic text-[var(--ink-2)]">
                    Example, constructed.{" "}
                  </span>
                  Mark size is how strongly a source states its view. A link is a disagreement,
                  its weight the materiality the code assigned; dashed where the two only differ
                  by horizon and can both be right.
                </figcaption>
              </figure>

              <div className={`flex flex-col justify-center py-8 sm:py-10 ${PAD}`}>
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
            <div className={`band pt-8 sm:pt-10 ${PAD}`}>
              <Opener label="Four steps" title="What happens when you press it" />
            </div>
            <div className="band cells arrive sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["Fan out", "One ticker goes to all five Skills at once. Every call, its status and its latency are printed below the brief, so the gathering is shown rather than hidden behind a spinner."],
                ["Normalise", "Each Skill's raw output becomes one comparable claim: a direction, how strongly it is held, the horizon it describes, and the figures it cites. One pass per source, so a malformed answer cannot corrupt the others."],
                ["Detect and rank", "Code decides which pairs actually conflict and what each conflict is worth. A model is never asked to find disagreement, which is why agreement can be reported as agreement."],
                ["Brief", "Each disagreement is explained with both cases, meaning what would have to be true for either side to be right, plus one observable that would settle it."],
              ].map(([title, body], i) => (
                <div key={title} className={`py-7 sm:py-9 ${PAD}`}>
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
            <div className={`band arrive py-10 ${PAD}`}>
              <Opener label="The defensible part" title="Which disagreements are worth your attention" />
              <p className="max-w-[74ch] text-[0.88rem] leading-relaxed text-[var(--ink-2)]">
                Anyone can count disagreements. The judgment is knowing which ones carry
                information. Sentiment and technicals contradict each other constantly and it means
                almost nothing, because both are derived from the same candles. Capital flow
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
                at all. Bearish over months and bullish intraday can both be true, and those are marked
                as timeframe divergence and never counted as a sharp conflict.
              </p>
            </div>

            {/* =================================== covered assets ========== */}
            <div className={`band pt-8 sm:pt-10 ${PAD}`}>
              <Opener label="Crypto majors" title="What you can ask about" />
            </div>
            <div className="band cells arrive sm:grid-cols-3">
              {[
                ["BTC", "The deepest coverage. All five Skills have something to say, and the technical plate runs on Bitget's own 4h and 1d candles."],
                ["ETH", "Same five sources, same ranking. Horizon and conviction are read per source, never inherited from BTC."],
                ["SOL", "Covered on the same path. Anything outside the majors has thinner source coverage, and the brief will say so."],
              ].map(([sym, body]) => (
                <div key={sym} className={`py-8 sm:py-10 ${PAD}`}>
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

            {/* =================================== a worked morning ======== */}
            <div className={`band arrive py-12 ${PAD}`}>
              <Opener label="Why this exists" title="Two true things that point opposite ways" />
              <div className="grid gap-x-12 gap-y-6 lg:grid-cols-[1fr_1fr]">
                <div>
                  <p className="max-w-[52ch] text-[0.95rem] leading-[1.62] text-[var(--ink-2)]">
                    You open two research notes on the same morning. The first says institutions
                    have been buying for a week and coins are leaving exchanges. The second says
                    inflation came in hot, rate expectations moved, and the setup is broken.
                  </p>
                  <p className="mt-4 max-w-[52ch] text-[0.95rem] leading-[1.62] text-[var(--ink-2)]">
                    Both are accurate. They are describing different forces over different lengths
                    of time. But you have to act once, so you pick the one that matches what you
                    already believed, and you call that research.
                  </p>
                </div>
                <div>
                  <p className="max-w-[52ch] text-[0.95rem] leading-[1.62] text-[var(--ink-2)]">
                    Every tool built on these sources will hide that from you. It will average the
                    five into one confident sentence, because one sentence is easier to sell than
                    a contradiction. The disagreement was the most useful thing on the page and it
                    is the first thing thrown away.
                  </p>
                  <p className="mt-4 max-w-[52ch] font-[family-name:var(--font-display)] text-[1.1rem] leading-snug">
                    Crosscheck keeps the contradiction, ranks it, and tells you what would settle
                    it.
                  </p>
                </div>
              </div>
            </div>

            {/* ================================ how to read a brief ======== */}
            <div className={`band pt-8 sm:pt-10 ${PAD}`}>
              <Opener label="Anatomy" title="How to read what comes back" />
            </div>
            <div className="band cells arrive sm:grid-cols-2 lg:grid-cols-3">
              {[
                ["The count", "How many of the five actually answered, and whether they agree. Two of five reporting is a much weaker picture than five of five, so the number is stated before anything else."],
                ["The plate", "One figure showing every source at once. Left to right is how far ahead it is looking; up and down is whether it reads bullish or bearish. Lines join the sources that disagree."],
                ["The summary", "A plain paragraph naming who said what, citing the actual figures each one used. Every claim traces back to a named source."],
                ["The disagreements", "Listed with the most consequential first. Each one says who disagrees, how much that particular pairing is worth, and what the disagreement is actually about."],
                ["Both cases", "For each disagreement, what would have to be true for either side to turn out right. Not a prediction, just a pair of conditions you can check."],
                ["What resolves it", "One observable thing that would settle the argument: a data release, a flow figure, a level on the chart. Never “wait and see”."],
              ].map(([title, body], i) => (
                <div key={title} className={`py-7 sm:py-9 ${PAD}`}>
                  <div className="flex items-baseline gap-3">
                    <span aria-hidden className="font-[family-name:var(--font-display)] text-[1.7rem] leading-none text-[var(--ink-3)]">
                      {i + 1}
                    </span>
                    <h3 className="font-[family-name:var(--font-display)] text-[1.1rem] leading-tight">{title}</h3>
                  </div>
                  <p className="mt-3 max-w-[40ch] text-[0.84rem] leading-relaxed text-[var(--ink-2)]">{body}</p>
                </div>
              ))}
            </div>

            {/* ========================================= the glossary ====== */}
            <div className={`band arrive py-12 ${PAD}`}>
              <Opener label="Plain English" title="Four words this page uses" />
              <dl className="grid gap-x-12 gap-y-6 sm:grid-cols-2">
                {[
                  ["Horizon", "How far ahead a source is looking. The chart talks about the next few hours; the economy talks about the next few months. Two sources can disagree completely and both be right if their horizons are far enough apart."],
                  ["Conviction", "How strongly a source states its own view, from 0 to 1. It measures confidence, not correctness, and a source can be loudly wrong."],
                  ["Materiality", "How much a particular disagreement is worth knowing about. The crowd contradicting the chart is close to meaningless, because both are read from the same price. Institutional money contradicting the economy is worth stopping for."],
                  ["Timeframe divergence", "A disagreement that is not really a disagreement: two sources pointing opposite ways about two different stretches of time. Marked separately so it is never counted as a fight."],
                ].map(([term, def]) => (
                  <div key={term}>
                    <dt className="font-[family-name:var(--font-display)] text-[1.12rem]">{term}</dt>
                    <dd className="mt-2 max-w-[48ch] text-[0.86rem] leading-relaxed text-[var(--ink-2)]">{def}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* ============================================ who for ======== */}
            <div className={`band arrive py-12 ${PAD}`}>
              <div className="grid gap-x-12 gap-y-5 lg:grid-cols-[1.2fr_1fr]">
                <div>
                  <h2 className="max-w-[24ch] font-[family-name:var(--font-display)] text-[clamp(1.5rem,3vw,2.1rem)] leading-tight tracking-[-0.015em]">
                    Built for the trader who already reads too much
                  </h2>
                  <p className="mt-5 max-w-[56ch] text-[0.95rem] leading-[1.62] text-[var(--ink-2)]">
                    If you follow a chart account, a macro newsletter and crypto Twitter, you are
                    not short of opinions. You are short of a way to tell which of their
                    contradictions is signal and which is two people talking about different
                    weeks. That is the entire job of this page.
                  </p>
                </div>
                <div className="self-end">
                  <p className="max-w-[44ch] text-[0.86rem] leading-relaxed text-[var(--ink-3)]">
                    It is read-only and always will be. There is no account, no connected wallet
                    and no order button anywhere in it. Nothing here can touch an exchange,
                    by construction rather than by promise.
                  </p>
                </div>
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
          <div className={`band arrive py-10 ${PAD}`}>
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
              <div className={`band py-4 sm:py-5 ${PAD}`}>
                <Label>{res.mode === "demo" ? "Recorded snapshot" : "Illustrative example"}</Label>
                <p className="mt-2 max-w-[74ch] text-[0.82rem] leading-relaxed text-[var(--ink-2)]">
                  {res.mode === "demo" && res.snapshot && (
                    <>Real market data, captured {new Date(res.snapshot.capturedAt).toLocaleString()}. Not live. {res.snapshot.note}</>
                  )}
                  {res.mode === "scenario" && res.scenario && (
                    <>
                      Constructed data, not real market data. “{res.scenario.title}”.{" "}
                      {res.scenario.teaches} Conflict detection, ranking and the brief run for real
                      on these inputs; normalisation is skipped because the sources arrive already
                      normalised.
                    </>
                  )}
                </p>
              </div>
            )}

            {/* headline: the count at display scale, centred like the hero */}
            <div className={`band py-10 sm:py-12 text-center ${PAD}`}>
              <div className="mb-3 flex items-center justify-center gap-3">
                <Label>
                  {res.mode === "demo" ? "Recorded" : res.mode === "scenario" ? "Illustrative" : res.cached ? "Cached" : "Live"}
                  {" · "}
                  {new Date(res.fetchedAt).toLocaleTimeString()}
                </Label>
              </div>
              <h2 className="font-[family-name:var(--font-display)] text-[clamp(1.7rem,6vw,3.4rem)] leading-[1.05] tracking-[-0.024em]">
                {res.mode === "scenario" && res.scenario ? res.scenario.title : res.ticker}
                <span className="text-[var(--ink-3)]"> · </span>
                {res.reporting} of {res.total}
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
                <figure className="mx-auto mt-8 max-w-[52rem] overflow-x-auto sm:mt-10">
                  <div className="min-w-[34rem]">
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
                  </div>
                </figure>
              )}

              {/* The split, as a picture. Which camp each source is in, how hard it is
                  leaning, and how far ahead it is looking — before a word of prose. */}
              {res.normalised && res.normalised.some((n) => n.status === "ok") && (
                <div className="mx-auto mt-9 max-w-[46rem] text-left">
                  <div className="grid grid-cols-3 border-y border-[var(--frame)]">
                    {(["bearish", "neutral", "bullish"] as const).map((dir, di) => {
                      const inCamp = (res.normalised ?? []).flatMap((n) =>
                        n.status === "ok" && n.value.direction === dir ? [n] : [],
                      );
                      return (
                        <div key={dir} className={di > 0 ? "border-l border-[var(--rule)] p-3 sm:p-4" : "p-3 sm:p-4"}>
                          <div className="flex items-center gap-1.5">
                            <DirectionMark direction={dir} />
                            <Label>{dir}</Label>
                            <span className="ml-auto font-[family-name:var(--font-display)] text-[1.15rem] leading-none">
                              {inCamp.length}
                            </span>
                          </div>
                          <ul className="mt-3 space-y-2.5">
                            {inCamp.length === 0 && (
                              <li className="text-[0.75rem] italic text-[var(--ink-3)]">none</li>
                            )}
                            {inCamp.map((n) => (
                              <li key={n.skill}>
                                <div className="font-[family-name:var(--font-data)] text-[0.7rem] leading-tight">
                                  {n.skill}
                                </div>
                                {n.status === "ok" && (
                                  <div className="mt-1 flex items-center gap-1.5 text-[var(--ink-2)]">
                                    <ConvictionBar value={n.value.conviction} />
                                    <span className="text-[0.65rem] text-[var(--ink-3)]">{n.value.timeframe}</span>
                                  </div>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                  {(res.normalised ?? []).some((n) => n.status === "unavailable") && (
                    <p className="mt-2 text-[0.72rem] text-[var(--ink-3)]">
                      Not reporting:{" "}
                      {(res.normalised ?? []).filter((n) => n.status === "unavailable").map((n) => n.skill).join(", ")}
                    </p>
                  )}
                </div>
              )}

              {brief && brief.headline && (
                <p className="mx-auto mt-9 max-w-[40ch] font-[family-name:var(--font-display)] text-[clamp(1.15rem,2.6vw,1.6rem)] leading-snug">
                  {brief.headline}
                </p>
              )}

              {brief && (
                /* The full summary is dense by design — it cites every figure. It stays,
                   but it is no longer the first thing a newcomer has to wade through. */
                <details className="mx-auto mt-7 max-w-[70ch] text-left">
                  <summary className="cursor-pointer list-none text-[0.8rem] text-[var(--ink-3)] underline decoration-dotted underline-offset-[4px] hover:text-[var(--ink-2)]">
                    Read the full summary, with every figure cited
                  </summary>
                  <p className="mt-4 text-[0.96rem] leading-[1.62] [&::first-letter]:float-left [&::first-letter]:mt-[0.1em] [&::first-letter]:mr-[0.07em] [&::first-letter]:font-[family-name:var(--font-display)] [&::first-letter]:text-[3.1em] [&::first-letter]:leading-[0.78]">
                    {brief.consensus_summary}
                  </p>
                </details>
              )}
            </div>

            {/* --------------------------------------- disagreements ----- */}
            {brief && brief.conflicts.length > 0 && (
              <div className={`band arrive py-10 ${PAD}`}>
                <Opener label={`${brief.conflicts.length} found`} title="Disagreements, most material first" />
                <ol>
                  {brief.conflicts.map((c, i) => (
                    <li key={i} className="border-b border-[var(--rule)] last:border-0">
                      <details open={i === 0} className="group">
                        <summary className="grid cursor-pointer list-none grid-cols-[1.6rem_1fr] gap-x-3 py-5 sm:grid-cols-[2.4rem_1fr] sm:gap-x-5">
                          <span
                            aria-hidden
                            className="font-[family-name:var(--font-display)] text-[1.6rem] leading-[0.8] text-[var(--ink-3)] sm:text-[2rem]"
                          >
                            {i + 1}
                          </span>
                          <span>
                            <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                              <span className="font-[family-name:var(--font-data)] text-[0.78rem]">
                                {c.sources[0]} <span className="text-[var(--ink-3)]">vs</span> {c.sources[1]}
                              </span>
                              <span className="flex items-center gap-1.5">
                                <MaterialityMark level={c.materiality} />
                                <Label>{c.materiality}</Label>
                              </span>
                              {c.is_timeframe_divergence && (
                                <span className="border border-[var(--rule)] px-1.5 py-px">
                                  <Label>both can be right</Label>
                                </span>
                              )}
                              <span className="ml-auto text-[0.7rem] text-[var(--ink-3)] group-open:hidden">
                                open
                              </span>
                            </span>
                            {c.in_plain_terms && (
                              <span className="mt-2 block max-w-[62ch] text-[0.95rem] leading-[1.55]">
                                {c.in_plain_terms}
                              </span>
                            )}
                          </span>
                        </summary>

                        <div className="grid grid-cols-[1.6rem_1fr] gap-x-3 pb-7 sm:grid-cols-[2.4rem_1fr] sm:gap-x-5">
                          <span aria-hidden />
                          <div>
                            <p className="max-w-[64ch] font-[family-name:var(--font-display)] text-[0.9rem] italic leading-snug text-[var(--ink-2)]">
                              {c.why_it_matters}
                            </p>

                            {/* The two cases, as a balance rather than two paragraphs. */}
                            <div className="mt-5 grid gap-x-7 gap-y-5 sm:grid-cols-2">
                              {([[c.sources[0], c.case_for_a], [c.sources[1], c.case_for_b]] as const).map(
                                ([name, text], k) => (
                                  <div key={name} className={k === 1 ? "sm:border-l sm:border-[var(--rule)] sm:pl-7" : ""}>
                                    <Label>For {name} to be right</Label>
                                    <p className="mt-2 text-[0.85rem] leading-[1.6] text-[var(--ink-2)]">{text || "not stated"}</p>
                                  </div>
                                ),
                              )}
                            </div>

                            <details className="mt-5">
                              <summary className="cursor-pointer list-none text-[0.76rem] text-[var(--ink-3)] underline decoration-dotted underline-offset-[4px] hover:text-[var(--ink-2)]">
                                The detail, with figures
                              </summary>
                              <p className="mt-3 max-w-[70ch] text-[0.88rem] leading-[1.6] text-[var(--ink-2)]">
                                {c.description}
                              </p>
                            </details>
                          </div>
                        </div>
                      </details>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {brief && brief.conflicts.some((c) => c.what_would_resolve_it) && (
              <div className={`band arrive py-9 sm:py-12 ${PAD}`}>
                <Opener label="The actionable part" title="What to watch" />
                <p className="max-w-[64ch] text-[0.84rem] leading-relaxed text-[var(--ink-3)]">
                  Each disagreement resolves itself the moment one of these prints. Nothing here is
                  a recommendation. They are the observables that would settle the argument.
                </p>
                <ol className="mt-5">
                  {brief.conflicts
                    .filter((c) => c.what_would_resolve_it)
                    .map((c, i) => (
                      <li
                        key={i}
                        className="grid grid-cols-[1.4rem_1fr] gap-x-3 border-b border-[var(--rule)] py-3.5 last:border-0 sm:grid-cols-[1.8rem_1fr]"
                      >
                        <span aria-hidden className="pt-0.5">
                          <MaterialityMark level={c.materiality} />
                        </span>
                        <span>
                          <span className="font-[family-name:var(--font-data)] text-[0.7rem] text-[var(--ink-3)]">
                            {c.sources[0]} vs {c.sources[1]}
                          </span>
                          <span className="mt-1 block max-w-[66ch] text-[0.89rem] leading-[1.55]">
                            {c.what_would_resolve_it}
                          </span>
                        </span>
                      </li>
                    ))}
                </ol>
              </div>
            )}

            {/* agreement reported as agreement, not dressed as drama */}
            {brief && brief.conflicts.length === 0 && !res.analyseError && (
              <div className={`band py-10 sm:py-12 text-center ${PAD}`}>
                <p className="mx-auto max-w-[46ch] font-[family-name:var(--font-display)] text-[clamp(1.15rem,2.4vw,1.55rem)] leading-snug">
                  No directional disagreement between the sources that reported.
                </p>
                <p className="mx-auto mt-4 max-w-[62ch] text-[0.88rem] leading-relaxed text-[var(--ink-2)]">
                  That is the finding. Nothing has been manufactured to fill this space, because a page
                  that always finds conflict is a page nobody should trust.
                </p>
              </div>
            )}

            {/* ------------------------------- internal divergence ------- */}
            {brief && brief.internal_divergences.length > 0 && (
              <div className={`band arrive py-10 ${PAD}`}>
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
              <div className={`band arrive py-10 ${PAD}`}>
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
            <div className={`band arrive py-10 ${PAD}`}>
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
            call and no price target, and it is read-only, so it cannot place an order.
          </p>
          <Label>Bitget AI Base Camp S2 · Open Theme</Label>
        </div>
      </div>
    </main>
  );
}
