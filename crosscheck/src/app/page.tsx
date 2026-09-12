"use client";

import { useState } from "react";

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
  sources: Source[]; normalised: Normalised[] | null; normaliseError: string | null;
};

const DOT: Record<string, string> = {
  ok: "bg-emerald-500", dead: "bg-amber-500", error: "bg-rose-500",
};

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

  const norm = (skill: string) => res?.normalised?.find((n) => n.skill === skill);

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 font-sans">
      <h1 className="text-2xl font-semibold tracking-tight">Crosscheck</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Five independent research Skills on one ticker. Reports where they disagree — never a verdict.
      </p>

      <form onSubmit={run} className="mt-6 flex gap-2">
        <input
          value={ticker}
          onChange={(e) => setTicker(e.target.value)}
          placeholder="BTC"
          aria-label="Ticker"
          className="w-40 rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
        >
          {busy ? "Querying five Skills…" : "Crosscheck"}
        </button>
      </form>

      {err && <p className="mt-4 rounded-md bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950/40">{err}</p>}

      {res && (
        <section className="mt-8">
          <div className="flex flex-wrap items-baseline gap-x-3 text-sm">
            <span className="font-medium">{res.ticker}</span>
            <span className={res.reporting === res.total ? "text-emerald-600" : "text-amber-600"}>
              {res.reporting} of {res.total} sources reporting
            </span>
            <span className="text-neutral-500">
              {res.cached ? "cached" : "live"} · {new Date(res.fetchedAt).toLocaleTimeString()}
            </span>
          </div>

          {res.normaliseError && (
            <p className="mt-2 text-xs text-amber-600">Normalisation: {res.normaliseError}</p>
          )}

          <ul className="mt-5 space-y-3">
            {res.sources.map((s) => {
              const n = norm(s.skill);
              return (
                <li key={s.skill} className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
                  <div className="flex items-center justify-between gap-3">
                    <code className="text-sm font-medium">{s.skill}</code>
                    <span className={`text-xs ${s.status === "ok" ? "text-emerald-600" : "text-amber-600"}`}>
                      {s.status === "ok" ? "reporting" : "unavailable"}
                    </span>
                  </div>

                  {/* The fan-out is shown, not hidden behind a spinner. */}
                  <ul className="mt-2 space-y-0.5">
                    {s.calls.map((c, i) => (
                      <li key={i} className="flex items-center gap-2 text-xs text-neutral-500">
                        <span className={`inline-block size-1.5 rounded-full ${DOT[c.status] ?? "bg-neutral-400"}`} />
                        <code>{c.tool}/{c.action}</code>
                        <span>{c.latencyMs}ms</span>
                        {c.detail && <span className="truncate">— {c.detail}</span>}
                      </li>
                    ))}
                  </ul>

                  {s.status === "unavailable" && (
                    <p className="mt-2 text-xs text-amber-700 dark:text-amber-500">
                      No data: {s.reason}. This gap is named rather than hidden — a missing view changes the conflict picture.
                    </p>
                  )}

                  {n?.status === "ok" && (
                    <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                      <dt className="text-neutral-500">direction</dt>
                      <dd className="font-medium">{n.value.direction} · conviction {n.value.conviction} · {n.value.timeframe}</dd>
                      <dt className="text-neutral-500">evidence</dt>
                      <dd>{n.value.evidence}</dd>
                      {n.value.internal_divergence && (
                        <>
                          <dt className="text-neutral-500">internal divergence</dt>
                          <dd>{n.value.internal_divergence}</dd>
                        </>
                      )}
                    </dl>
                  )}

                  {s.status === "ok" && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-neutral-500">raw output</summary>
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
      )}
    </main>
  );
}
