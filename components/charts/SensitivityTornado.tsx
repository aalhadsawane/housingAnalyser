"use client";

import * as Plot from "@observablehq/plot";
import { useEffect, useRef } from "react";
import type { TornadoEntry } from "@/lib/engine/stats";

/**
 * "What actually drives this decision?" — ranks each macro assumption by
 * how strongly it's associated with buying vs. renting winning, across the
 * scenarios already simulated. A long bar means the decision is sensitive
 * to that assumption; a short bar means it barely matters here.
 */
export function SensitivityTornado({ entries }: { entries: TornadoEntry[] }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const rows = entries.map((e) => ({ label: e.label, value: e.correlation }));

    const plot = Plot.plot({
      width: containerRef.current.clientWidth || 420,
      height: rows.length * 34 + 20,
      marginLeft: 150,
      marginBottom: 30,
      x: { label: "← favors renting     favors buying →", domain: [-1, 1], tickFormat: () => "" },
      y: { label: null },
      marks: [
        Plot.barX(rows, {
          y: "label",
          x: "value",
          fill: (d: (typeof rows)[number]) => (d.value >= 0 ? "#6d67e4" : "#e48a67"),
          sort: { y: "x", reverse: false },
        }),
        Plot.ruleX([0]),
      ],
    });

    containerRef.current.innerHTML = "";
    containerRef.current.appendChild(plot);
    return () => plot.remove();
  }, [entries]);

  return (
    <div>
      <h3 className="text-[13px] font-semibold">What drives the decision?</h3>
      <p className="mb-1 text-[11px] text-neutral-500">
        Longer bars mean the outcome is more sensitive to that assumption — worth double-checking your guess for it.
      </p>
      <div ref={containerRef} />
    </div>
  );
}
