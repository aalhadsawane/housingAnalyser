"use client";

import { useMemo } from "react";
import type { DistributionStrategy } from "@/lib/engine/distributions/types";

/**
 * A small inline SVG plot of a distribution's PDF over its P0.1-P99.9
 * range, with the P5/P50/P95 marked — the "live PDF sparkline" every
 * distribution card shows per PLAN.md section 3.1's transparency rule.
 * Deliberately tiny and dependency-free (no chart library) since it only
 * ever appears at card scale, never as a standalone chart.
 */
export function PdfSparkline({ distribution }: { distribution: DistributionStrategy }) {
  const { points, p5, p50, p95, lo, hi } = useMemo(() => {
    const lo = distribution.quantile(0.001);
    const hi = distribution.quantile(0.999);
    const n = 80;
    const pts: { x: number; y: number }[] = [];
    let maxY = 0;
    for (let i = 0; i <= n; i++) {
      const x = lo + ((hi - lo) * i) / n;
      const y = distribution.pdf(x);
      if (Number.isFinite(y)) maxY = Math.max(maxY, y);
      pts.push({ x, y: Number.isFinite(y) ? y : 0 });
    }
    return {
      points: pts.map((p) => ({ x: p.x, y: maxY > 0 ? p.y / maxY : 0 })),
      p5: distribution.quantile(0.05),
      p50: distribution.quantile(0.5),
      p95: distribution.quantile(0.95),
      lo,
      hi,
    };
  }, [distribution]);

  const width = 240;
  const height = 56;
  const pad = 4;

  const toSvgX = (x: number) => pad + ((x - lo) / (hi - lo || 1)) * (width - 2 * pad);
  const toSvgY = (y: number) => height - pad - y * (height - 2 * pad);

  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${toSvgX(p.x).toFixed(1)} ${toSvgY(p.y).toFixed(1)}`)
    .join(" ");
  const areaD = `${pathD} L ${toSvgX(hi).toFixed(1)} ${height - pad} L ${toSvgX(lo).toFixed(1)} ${height - pad} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      role="img"
      aria-label="Probability density preview"
      style={{ display: "block" }}
    >
      <path d={areaD} fill="var(--sparkline-fill, #6d67e422)" stroke="none" />
      <path d={pathD} fill="none" stroke="var(--sparkline-line, #6d67e4)" strokeWidth={1.5} />
      {[p5, p50, p95].map((x, i) => (
        <line
          key={i}
          x1={toSvgX(x)}
          x2={toSvgX(x)}
          y1={pad}
          y2={height - pad}
          stroke="var(--sparkline-marker, #9aa0ad)"
          strokeWidth={i === 1 ? 1.25 : 1}
          strokeDasharray={i === 1 ? undefined : "2,2"}
        />
      ))}
    </svg>
  );
}
