"use client";

import * as Plot from "@observablehq/plot";
import { useEffect, useRef } from "react";

/**
 * "How often does buying pay off, the longer you stay?" — probably the
 * single most useful chart in the dashboard (client feedback: the old
 * time-series wealth chart made people do statistics in their head; this
 * answers the actual question directly).
 */
export function WinProbabilityChart({ winProbabilityByMonth }: { winProbabilityByMonth: Float64Array }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const data = Array.from(winProbabilityByMonth, (p, i) => ({ year: (i + 1) / 12, prob: p * 100 }));

    const plot = Plot.plot({
      width: containerRef.current.clientWidth || 420,
      height: 260,
      marginLeft: 44,
      marginBottom: 32,
      x: { label: "Years you stay" },
      y: { label: "Chance buying wins", domain: [0, 100], tickFormat: (d) => `${d}%` },
      marks: [
        Plot.areaY(data, { x: "year", y: "prob", fill: "#6d67e4", fillOpacity: 0.12 }),
        Plot.lineY(data, { x: "year", y: "prob", stroke: "#6d67e4", strokeWidth: 2.5 }),
        Plot.ruleY([50], { stroke: "currentColor", strokeOpacity: 0.25, strokeDasharray: "3,3" }),
        Plot.ruleY([0]),
      ],
    });

    containerRef.current.innerHTML = "";
    containerRef.current.appendChild(plot);
    return () => plot.remove();
  }, [winProbabilityByMonth]);

  return (
    <div>
      <h3 className="text-[13px] font-semibold">If I choose to buy and stay N years, how often does it pay off?</h3>
      <div ref={containerRef} className="mt-1" />
    </div>
  );
}
