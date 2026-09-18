"use client";

import * as Plot from "@observablehq/plot";
import { useEffect, useRef } from "react";
import type { WinnerMarginPoint } from "@/lib/engine/stats";

function formatCurrency(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 10_000_000) return `₹${(abs / 10_000_000).toFixed(1)}Cr`;
  if (abs >= 100_000) return `₹${(abs / 100_000).toFixed(0)}L`;
  return `₹${abs.toFixed(0)}`;
}

/**
 * Companion to WinProbabilityChart: that chart answers "how often does
 * buying win"; this one answers "when it wins (or loses), by how much" --
 * the two questions are genuinely independent (a coin-flip win rate can
 * still be a landslide in size, in either direction). Two lines, both
 * always non-negative (magnitude, not signed), so "which line is higher"
 * directly means "which side's wins tend to be bigger".
 */
export function WinnerMarginChart({ points }: { points: WinnerMarginPoint[] }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const buyLine = points
      .filter((p) => p.medianMarginWhenBuyWins !== null)
      .map((p) => ({ year: (p.month + 1) / 12, margin: p.medianMarginWhenBuyWins! }));
    const rentLine = points
      .filter((p) => p.medianMarginWhenRentWins !== null)
      .map((p) => ({ year: (p.month + 1) / 12, margin: p.medianMarginWhenRentWins! }));

    const plot = Plot.plot({
      width: containerRef.current.clientWidth || 420,
      height: 260,
      marginLeft: 56,
      marginBottom: 32,
      x: { label: "Years you stay" },
      y: { label: "Typical size of the win", tickFormat: formatCurrency },
      marks: [
        Plot.lineY(buyLine, { x: "year", y: "margin", stroke: "#6d67e4", strokeWidth: 2.5 }),
        Plot.lineY(rentLine, { x: "year", y: "margin", stroke: "#e48a67", strokeWidth: 2.5 }),
        Plot.ruleY([0]),
      ],
    });

    containerRef.current.innerHTML = "";
    containerRef.current.appendChild(plot);
    return () => plot.remove();
  }, [points]);

  return (
    <div>
      <h3 className="text-[13px] font-semibold">Not just who wins — by how much?</h3>
      <p className="mb-1 text-[11px] text-neutral-500">
        <span style={{ color: "#6d67e4" }}>■</span> typical size of buying&apos;s win, in scenarios where buying is
        ahead. <span style={{ color: "#e48a67" }}>■</span> typical size of renting&apos;s win, in scenarios where
        renting is ahead. A close win rate can still hide a landslide here.
      </p>
      <div ref={containerRef} />
    </div>
  );
}
