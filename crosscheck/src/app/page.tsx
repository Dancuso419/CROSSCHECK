"use client";

import { useState } from "react";
import type { Brief } from "@/lib/schema";

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
};

const AGREEMENT: Record<Brief["agreement_level"], { label: string; cls: string }> = {
  strong_agreement: { label: "Sources broadly agree", cls: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200" },
  mixed: { label: "Mixed", cls: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" },
  sharp_conflict: { label: "Sharp conflict", cls: "bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200" },
};

const MATERIALITY: Record<string, string> = {
  high: "bg-rose-600 text-white",
  medium: "bg-amber-500 text-white",
  low: "bg-neutral-400 text-white dark:bg-neutral-600",
};

const DOT: Record<string, string> = { ok: "bg-emerald-500", dead: "bg-amber-500", error: "bg-rose-500" };
const DIR: Record<string, string> = {
  bullish: "text-emerald-700 dark:text-emerald-400",
  bearish: "text-rose-700 dark:text-rose-400",
  neutral: "text-neutral-600 dark:text-neutral-400",
};

function Pill({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${className}`}>{children}</span>;
}

export default function Home() {
  const [ticker, setTicker] = useState("BTC");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null); setRes(null);
    try {
      const r = await fetch("/api/crosscheck", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ticker }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
      setRes(body);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const brief = res?.brief;
  const norm = (skill: string) => res?.normalised?.find((n) => n.skill === skill);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Crosscheck</h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          Five independent research Skills on one ticker. Shows where they disagree and why it matters.
          It never issues a verdict.
        </p>
      </header>

      <form onSubmit={run} className="mt-6 flex flex-wrap gap-2">
        <input
          value={ticker}
          onChange={(e) => setTicker(e.target.value)}
          placeholder="BTC"
          aria-label="Ticker"
          className="w-36 rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
        >
          {busy ? "Querying five Skills…" : "Crosscheck"}
        </button>
        <span className="self-center text-xs text-neutral-500">Crypto majors — BTC, ETH, SOL</span>
      </form>

      {err && <p className="mt-4 rounded-md bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-950/50 dark:text-rose-200">{err}</p>}

      {res && (
        <>
          {/* ---------- headline ---------- */}
          <section className="mt-8 border-t border-neutral-200 pt-6 dark:border-neutral-800">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h2 className="text-lg font-semibold">{res.ticker}</h2>
              {brief && <Pill className={AGREEMENT[brief.agreement_level].cls}>{AGREEMENT[brief.agreement_level].label}</Pill>}
              <span className={`text-sm ${res.reporting === res.total ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}`}>
                {res.reporting} of {res.total} sources reporting
              </span>
              <span className="text-xs text-neutral-500">
                {res.cached ? "cached" : "live"} · {new Date(res.fetchedAt).toLocaleTimeString()}
              </span>
            </div>

            {res.analyseError && (
              <p className="mt-3 rounded-md bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                Analysis unavailable: {res.analyseError}
              </p>
            )}

            {brief && (
              <p className="mt-4 text-[15px] leading-relaxed text-neutral-800 dark:text-neutral-200">
                {brief.consensus_summary}
              </p>
            )}
          </section>

          {/* ---------- conflicts, ranked by materiality ---------- */}
          {brief && brief.conflicts.length > 0 && (
            <section className="mt-8">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
                Disagreements, most material first
              </h3>
              <ul className="mt-3 space-y-4">
                {brief.conflicts.map((c, i) => (
                  <li key={i} className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="text-sm font-medium">{c.sources[0]}</code>
                      <span className="text-neutral-400">vs</span>
                      <code className="text-sm font-medium">{c.sources[1]}</code>
                      <Pill className={MATERIALITY[c.materiality]}>{c.materiality} materiality</Pill>
                      {c.is_timeframe_divergence && (
                        <Pill className="bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200">timeframe divergence</Pill>
                      )}
                    </div>

                    <p className="mt-1 text-xs italic text-neutral-500">{c.why_it_matters}</p>
                    <p className="mt-3 text-sm leading-relaxed text-neutral-800 dark:text-neutral-200">{c.description}</p>

                    {/* What would have to be true for each side — the spec's framing */}
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      {([[c.sources[0], c.case_for_a], [c.sources[1], c.case_for_b]] as const).map(([name, text]) => (
                        <div key={name} className="rounded-md bg-neutral-50 p-3 dark:bg-neutral-900">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                            For {name} to be right
                          </p>
                          <p className="mt-1 text-sm leading-relaxed">{text || "—"}</p>
                        </div>
                      ))}
                    </div>

                    {c.what_would_resolve_it && (
                      <p className="mt-3 text-sm">
                        <span className="font-semibold">What resolves it: </span>
                        <span className="text-neutral-800 dark:text-neutral-200">{c.what_would_resolve_it}</span>
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Agreement is reported as agreement, never dressed up as drama. */}
          {brief && brief.conflicts.length === 0 && !res.analyseError && (
            <section className="mt-8 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
              No directional disagreement found between the reporting sources. That is the finding — nothing
              has been manufactured to fill this space.
            </section>
          )}

          {/* ---------- internal divergence ---------- */}
          {brief && brief.internal_divergences.length > 0 && (
            <section className="mt-8">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
                Sources disagreeing with themselves
              </h3>
              <ul className="mt-3 space-y-2">
                {brief.internal_divergences.map((d) => (
                  <li key={d.source} className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
                    <div className="flex items-center gap-2">
                      <code className="text-sm font-medium">{d.source}</code>
                      <Pill className={MATERIALITY.medium}>medium</Pill>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-neutral-800 dark:text-neutral-200">{d.detail}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* ---------- named gaps: never silently dropped ---------- */}
          {brief && brief.unavailable_sources.length > 0 && (
            <section className="mt-8">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
                Sources that did not report
              </h3>
              <p className="mt-2 text-xs text-neutral-500">
                A missing view changes the conflict picture, so each gap is named rather than hidden.
              </p>
              <ul className="mt-3 space-y-1.5">
                {brief.unavailable_sources.map((u) => (
                  <li key={u.source} className="text-sm">
                    <code className="font-medium">{u.source}</code>
                    <span className="text-neutral-500"> — {u.reason}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* ---------- the fan-out, shown rather than hidden ---------- */}
          <section className="mt-10 border-t border-neutral-200 pt-6 dark:border-neutral-800">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
              How this was gathered
            </h3>
            <p className="mt-2 text-xs text-neutral-500">
              Five Skills queried in parallel · Pass 1 {res.models.extract} · Pass 2 {res.models.reason} ·
              conflict detection and ranking are deterministic, not model judgment
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              fan-out {(res.timings.fanoutMs / 1000).toFixed(1)}s · normalise{" "}
              {(res.timings.normaliseMs / 1000).toFixed(1)}s · conflict{" "}
              {(res.timings.conflictMs / 1000).toFixed(1)}s · total{" "}
              {(res.timings.totalMs / 1000).toFixed(1)}s
            </p>
            <ul className="mt-4 space-y-3">
              {res.sources.map((s) => {
                const n = norm(s.skill);
                return (
                  <li key={s.skill} className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <code className="text-sm font-medium">{s.skill}</code>
                      {n?.status === "ok" ? (
                        <span className={`text-xs font-medium ${DIR[n.value.direction]}`}>
                          {n.value.direction} · conviction {n.value.conviction} · {n.value.timeframe}
                        </span>
                      ) : (
                        <span className="text-xs text-amber-700 dark:text-amber-400">unavailable</span>
                      )}
                    </div>

                    <ul className="mt-2 space-y-0.5">
                      {s.calls.map((c, i) => (
                        <li key={i} className="flex flex-wrap items-center gap-2 text-[11px] text-neutral-500">
                          <span className={`inline-block size-1.5 shrink-0 rounded-full ${DOT[c.status] ?? "bg-neutral-400"}`} />
                          <code>{c.tool}/{c.action}</code>
                          <span>{c.latencyMs}ms</span>
                          {c.detail && <span className="truncate">— {c.detail}</span>}
                        </li>
                      ))}
                    </ul>

                    {n?.status === "ok" && (
                      <p className="mt-2 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
                        {n.value.evidence}
                      </p>
                    )}

                    {s.status === "ok" && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-[11px] text-neutral-500">raw output</summary>
                        <pre className="mt-2 max-h-64 overflow-auto rounded bg-neutral-50 p-2 text-[11px] dark:bg-neutral-900">
                          {JSON.stringify(s.raw, null, 2)}
                        </pre>
                      </details>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          <footer className="mt-10 border-t border-neutral-200 pt-4 text-xs text-neutral-500 dark:border-neutral-800">
            Crosscheck reports disagreement between sources. It does not issue a verdict, a direction
            call or a price target, and it is read-only — it cannot place an order.
          </footer>
        </>
      )}
    </main>
  );
}
