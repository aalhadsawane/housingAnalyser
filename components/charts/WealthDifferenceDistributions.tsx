"use client";

import * as Plot from "@observablehq/plot";
import { useEffect, useRef } from "react";
import type { DeltaHistogramAtMonth } from "@/lib/engine/stats";

function formatCurrency(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 10_000_000) return `${sign}₹${(abs / 10_000_000).toFixed(1)}Cr`;
  if (abs >= 100_000) return `${sign}₹${(abs / 100_000).toFixed(0)}L`;
  return `${sign}₹${abs.toFixed(0)}`;
}

function SmallHistogram({ histogram, yearLabel }: { histogram: DeltaHistogramAtMonth; yearLabel: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const rows = histogram.bins.map((b) => ({
      x0: b.binStart,
      x1: b.binEnd,
      count: b.count,
      favors: b.binStart + b.binEnd >= 0 ? "buy" : "rent",
    }));

    const plot = Plot.plot({
      width: containerRef.current.clientWidth || 200,
      height: 150,
      marginLeft: 8,
      marginBottom: 26,
      marginTop: 4,
      x: { label: null, tickFormat: formatCurrency, ticks: 3 },
      y: { axis: null },
      marks: [
        Plot.rectY(rows, {
          x1: "x0",
          x2: "x1",
          y: "count",
          fill: (d: (typeof rows)[number]) => (d.favors === "buy" ? "#6d67e4" : "#e48a67"),
          fillOpacity: 0.8,
        }),
        Plot.ruleX([0], { stroke: "currentColor", strokeOpacity: 0.4 }),
        Plot.ruleY([0]),
      ],
    });

    containerRef.current.innerHTML = "";
    containerRef.current.appendChild(plot);
    return () => plot.remove();
  }, [histogram]);

  return (
    <div className="min-w-0">
      <div className="text-center text-[12px] font-medium">{yearLabel}</div>
      <div ref={containerRef} />
      <div className="text-center text-[11px] text-neutral-500">
        buying wins <b style={{ color: "#6d67e4" }}>{Math.round(histogram.probBuyWins * 100)}%</b> of the time
      </div>
    </div>
  );
}

/**
 * Small multiples of the (Buy - Rent) wealth distribution at several
 * horizons — replaces a single overlapping percentile band with something
 * that shows the actual shape and how it widens/shifts over time. Purple
 * bars sit where buying wins that scenario, orange where renting does.
 */
export function WealthDifferenceDistributions({
  histograms,
}: {
  histograms: { yearLabel: string; histogram: DeltaHistogramAtMonth }[];
}) {
  return (
    <div>
      <h3 className="text-[13px] font-semibold">How big is the difference, and who's ahead?</h3>
      <p className="mb-2 text-[11px] text-neutral-500">
        Each bar is a range of outcomes across all simulated scenarios at that point in time. Bars to the right of
        the line favor buying; bars to the left favor renting.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {histograms.map(({ yearLabel, histogram }) => (
          <SmallHistogram key={yearLabel} histogram={histogram} yearLabel={yearLabel} />
        ))}
      </div>
    </div>
  );
}
