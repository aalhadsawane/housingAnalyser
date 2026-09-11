"use client";

import type { DecisionSummary } from "@/lib/engine/stats";

function formatCurrency(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 10_000_000) return `${sign}₹${(abs / 10_000_000).toFixed(2)} Cr`;
  if (abs >= 100_000) return `${sign}₹${(abs / 100_000).toFixed(1)} L`;
  return `${sign}₹${abs.toFixed(0)}`;
}

export function SummaryBar({ summary }: { summary: DecisionSummary | null }) {
  if (!summary) {
    return (
      <div className="sticky top-0 z-10 -mx-4 mb-4 border-b border-black/10 bg-white/80 px-4 py-3 text-[13px] text-neutral-400 backdrop-blur dark:border-white/10 dark:bg-black/50">
        Run a simulation to see the decision summary.
      </div>
    );
  }

  const buyWinPct = (summary.probBuyWins * 100).toFixed(0);
  const breakevenText =
    summary.breakevenMonthMedian === null
      ? "never, within this horizon"
      : `year ${(summary.breakevenMonthMedian / 12).toFixed(1)} (IQR ${
          summary.breakevenMonthP25 !== null ? (summary.breakevenMonthP25 / 12).toFixed(1) : "?"
        }-${summary.breakevenMonthP75 !== null ? (summary.breakevenMonthP75 / 12).toFixed(1) : "?"})`;

  return (
    <div className="sticky top-0 z-10 -mx-4 mb-4 flex flex-wrap items-center gap-x-6 gap-y-1.5 border-b border-black/10 bg-white/80 px-4 py-3 text-[13px] backdrop-blur dark:border-white/10 dark:bg-black/50">
      <span>
        <b className="text-[15px]" style={{ color: summary.probBuyWins >= 0.5 ? "#6d67e4" : "#e48a67" }}>
          {buyWinPct}%
        </b>{" "}
        <span className="text-neutral-500">of paths favor buying</span>
      </span>
      <span>
        <span className="text-neutral-500">median advantage:</span>{" "}
        <b className={summary.medianDelta >= 0 ? "text-[#6d67e4]" : "text-[#e48a67]"}>
          {summary.medianDelta >= 0 ? "buy +" : "rent +"}
          {formatCurrency(Math.abs(summary.medianDelta))}
        </b>
      </span>
      <span>
        <span className="text-neutral-500">breakeven:</span> <b>{breakevenText}</b>
      </span>
      <span className="text-neutral-400">
        worst-5% buy: {formatCurrency(summary.cvar5Buy)} · worst-5% rent: {formatCurrency(summary.cvar5Rent)}
      </span>
    </div>
  );
}
