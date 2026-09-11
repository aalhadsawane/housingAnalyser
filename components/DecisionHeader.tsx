"use client";

import type { DecisionSummary } from "@/lib/engine/stats";

function formatCurrency(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 10_000_000) return `${sign}₹${(abs / 10_000_000).toFixed(2)} Cr`;
  if (abs >= 100_000) return `${sign}₹${(abs / 100_000).toFixed(1)} L`;
  return `${sign}₹${abs.toFixed(0)}`;
}

/**
 * The dashboard's plain-language headline — deliberately avoids jargon
 * (no "IQR", "CVaR", "P10-P90") in favor of sentences a non-technical
 * client can read once and understand. Everything technical still lives
 * in the underlying DecisionSummary; this component only chooses words.
 */
export function DecisionHeader({ summary, horizonYears }: { summary: DecisionSummary | null; horizonYears: number }) {
  if (!summary) {
    return (
      <div className="rounded-xl border border-black/10 bg-white/70 px-5 py-4 text-[13px] text-neutral-400 dark:border-white/10 dark:bg-white/[0.03]">
        Configure the scenario on the left, then run the simulation to see the decision.
      </div>
    );
  }

  const winPct = Math.round(summary.probBuyWins * 100);
  const winner = summary.medianDelta >= 0 ? "buying" : "renting";
  const winnerColor = summary.medianDelta >= 0 ? "#6d67e4" : "#e48a67";

  const breakevenSentence =
    summary.breakevenMonthMedian === null
      ? "In a typical scenario, buying never catches up within this horizon."
      : `In a typical scenario, buying catches up to renting by around year ${(summary.breakevenMonthMedian / 12).toFixed(1)}.`;

  const neverPct = Math.round(summary.breakevenNeverShare * 100);

  return (
    <div className="rounded-xl border border-black/10 bg-white/70 px-5 py-4 dark:border-white/10 dark:bg-white/[0.03]">
      <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-neutral-400">The decision</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="text-[26px] font-semibold leading-none" style={{ color: winPct >= 50 ? "#6d67e4" : "#e48a67" }}>
            {winPct}%
          </div>
          <div className="mt-1 text-[12px] text-neutral-500">
            of simulated scenarios end up better off <b>buying</b> after {horizonYears} years
          </div>
        </div>
        <div>
          <div className="text-[26px] font-semibold leading-none" style={{ color: winnerColor }}>
            {formatCurrency(Math.abs(summary.medianDelta))}
          </div>
          <div className="mt-1 text-[12px] text-neutral-500">
            typical difference, in favor of <b>{winner}</b>
          </div>
        </div>
        <div>
          <div className="text-[15px] font-medium leading-tight">{breakevenSentence}</div>
        </div>
        <div>
          <div className="text-[26px] font-semibold leading-none text-neutral-600 dark:text-neutral-300">{neverPct}%</div>
          <div className="mt-1 text-[12px] text-neutral-500">of scenarios, buying never catches up at all</div>
        </div>
      </div>
    </div>
  );
}
