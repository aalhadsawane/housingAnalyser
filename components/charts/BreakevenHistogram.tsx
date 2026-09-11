"use client";

import * as Plot from "@observablehq/plot";
import { useEffect, useMemo, useRef } from "react";

/**
 * "Break-even year 3.7" was hiding a whole distribution behind one number.
 * This shows the shape: most scenarios might cluster around year 3-4, but
 * some take a decade, and some never get there at all.
 */
export function BreakevenHistogram({ breakevenMonths }: { breakevenMonths: (number | null)[] }) {
  const containerRef = useRef<HTMLDivElement>(null);

  const { years, neverPct } = useMemo(() => {
    const crossed = breakevenMonths.filter((m): m is number => m !== null).map((m) => m / 12);
    const neverCount = breakevenMonths.length - crossed.length;
    return { years: crossed, neverPct: (neverCount / breakevenMonths.length) * 100 };
  }, [breakevenMonths]);

  useEffect(() => {
    if (!containerRef.current) return;
    if (years.length === 0) {
      containerRef.current.innerHTML = "";
      return;
    }

    // Manual binning (rather than Plot's binX transform) keeps this
    // consistent with the other small-multiple histograms and sidesteps
    // a generic-inference quirk in this Plot version's binX typings.
    const numBins = 20;
    const lo = Math.min(...years);
    const hi = Math.max(...years);
    const span = hi - lo || 1;
    const binWidth = span / numBins;
    const bins = Array.from({ length: numBins }, (_, i) => ({
      x0: lo + i * binWidth,
      x1: lo + (i + 1) * binWidth,
      count: 0,
    }));
    for (const y of years) {
      const idx = Math.min(numBins - 1, Math.max(0, Math.floor((y - lo) / binWidth)));
      bins[idx]!.count += 1;
    }

    const marks: Plot.Markish[] = [
      Plot.rectY(bins, { x1: "x0", x2: "x1", y: "count", fill: "#6d67e4", fillOpacity: 0.8 }),
      Plot.ruleY([0]),
    ];

    const plot = Plot.plot({
      width: containerRef.current.clientWidth || 420,
      height: 260,
      marginLeft: 40,
      marginBottom: 32,
      x: { label: "Years until buying catches up to renting" },
      y: { label: "Number of scenarios" },
      marks,
    });

    containerRef.current.innerHTML = "";
    containerRef.current.appendChild(plot);
    return () => plot.remove();
  }, [years]);

  return (
    <div>
      <h3 className="text-[13px] font-semibold">When does buying catch up?</h3>
      <div ref={containerRef} className="mt-1" />
      {neverPct > 0 && (
        <p className="text-[11px] text-neutral-500">
          Not shown: in <b>{neverPct.toFixed(0)}%</b> of scenarios, buying never catches up within the horizon.
        </p>
      )}
    </div>
  );
}
