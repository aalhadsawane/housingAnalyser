"use client";

import * as Plot from "@observablehq/plot";
import { useEffect, useMemo, useRef } from "react";
import type { FanBand } from "@/lib/engine/stats";

/**
 * The hero chart (PLAN.md section 4, chart 1): median net-worth-vs-time
 * lines for Buy and Rent, each with a shaded P10-P90 band, the median
 * breakeven month annotated. This is the one chart the whole app exists to
 * produce.
 */
export function NetWorthFanChart({
  buyBands,
  rentBands,
  breakevenMonth,
  currency = "₹",
}: {
  buyBands: FanBand[];
  rentBands: FanBand[];
  breakevenMonth: number | null;
  currency?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  const data = useMemo(() => {
    const rows: { year: number; value: number; band: string; branch: "Buy" | "Rent" }[] = [];
    for (const b of buyBands) {
      const year = (b.month + 1) / 12;
      rows.push(
        { year, value: b.p10, band: "p10", branch: "Buy" },
        { year, value: b.p90, band: "p90", branch: "Buy" },
        { year, value: b.median, band: "median", branch: "Buy" },
      );
    }
    for (const b of rentBands) {
      const year = (b.month + 1) / 12;
      rows.push(
        { year, value: b.p10, band: "p10", branch: "Rent" },
        { year, value: b.p90, band: "p90", branch: "Rent" },
        { year, value: b.median, band: "median", branch: "Rent" },
      );
    }
    return rows;
  }, [buyBands, rentBands]);

  useEffect(() => {
    if (!containerRef.current) return;

    const formatCurrency = (v: number) => {
      const abs = Math.abs(v);
      const sign = v < 0 ? "-" : "";
      if (abs >= 10_000_000) return `${sign}${currency}${(abs / 10_000_000).toFixed(1)}Cr`;
      if (abs >= 100_000) return `${sign}${currency}${(abs / 100_000).toFixed(1)}L`;
      return `${sign}${currency}${abs.toFixed(0)}`;
    };

    const buyColor = "#6d67e4";
    const rentColor = "#e48a67";

    const buyBandData = buyBands.map((b) => ({ year: (b.month + 1) / 12, lo: b.p10, hi: b.p90 }));
    const rentBandData = rentBands.map((b) => ({ year: (b.month + 1) / 12, lo: b.p10, hi: b.p90 }));
    const buyMedian = buyBands.map((b) => ({ year: (b.month + 1) / 12, value: b.median }));
    const rentMedian = rentBands.map((b) => ({ year: (b.month + 1) / 12, value: b.median }));

    const marks: Plot.Markish[] = [
      Plot.areaY(buyBandData, { x: "year", y1: "lo", y2: "hi", fill: buyColor, fillOpacity: 0.14 }),
      Plot.areaY(rentBandData, { x: "year", y1: "lo", y2: "hi", fill: rentColor, fillOpacity: 0.14 }),
      Plot.lineY(buyMedian, { x: "year", y: "value", stroke: buyColor, strokeWidth: 2.25 }),
      Plot.lineY(rentMedian, { x: "year", y: "value", stroke: rentColor, strokeWidth: 2.25 }),
      Plot.ruleY([0], { stroke: "currentColor", strokeOpacity: 0.25 }),
    ];

    if (breakevenMonth !== null) {
      const breakevenYear = (breakevenMonth + 1) / 12;
      marks.push(
        Plot.ruleX([breakevenYear], { stroke: "currentColor", strokeOpacity: 0.35, strokeDasharray: "3,3" }),
        Plot.text([{ year: breakevenYear, label: `median breakeven: year ${breakevenYear.toFixed(1)}` }], {
          x: "year",
          y: () => {
            const allMax = Math.max(...buyMedian.map((d) => d.value), ...rentMedian.map((d) => d.value));
            return allMax;
          },
          text: "label",
          dy: -6,
          fontSize: 11,
          fill: "currentColor",
          fillOpacity: 0.6,
        }),
      );
    }

    const plot = Plot.plot({
      width: containerRef.current.clientWidth || 720,
      height: 360,
      marginLeft: 64,
      marginBottom: 36,
      x: { label: "Years from purchase" },
      y: { label: `Net worth (${currency})`, tickFormat: formatCurrency },
      color: { legend: false },
      marks,
    });

    containerRef.current.innerHTML = "";
    containerRef.current.appendChild(plot);
    return () => plot.remove();
  }, [buyBands, rentBands, breakevenMonth, currency]);

  return (
    <div>
      <div className="mb-2 flex items-center gap-4 text-[12px]">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: "#6d67e4" }} /> Buy (median, P10-P90 band)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: "#e48a67" }} /> Rent + invest (median, P10-P90 band)
        </span>
      </div>
      <div ref={containerRef} />
      <p className="mt-1 text-[11px] text-neutral-400">
        How to read this: solid lines are the median outcome across all simulated paths; shaded bands show the
        10th-90th percentile range. Where the bands overlap heavily, the &quot;winner&quot; isn&apos;t statistically
        meaningful at that point in time.
      </p>
    </div>
  );
}
