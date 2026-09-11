"use client";

import { useMemo } from "react";
import { buildProcess } from "@/lib/engine/factory";
import { createRng } from "@/lib/engine/rng";
import type { ProcessSpec } from "@/lib/engine/schema";

/**
 * Shows ~20 sample paths for a process before the user commits to running
 * the full Monte Carlo — PLAN.md section 3's "see what you just specified
 * before committing 10,000 of them." Uses its own small fixed-seed RNG so
 * the preview is stable while a slider is being dragged.
 */
export function PathPreview({
  spec,
  initialLevel,
  months = 60,
  pathCount = 20,
}: {
  spec: ProcessSpec;
  initialLevel: number;
  months?: number;
  pathCount?: number;
}) {
  const paths = useMemo(() => {
    try {
      const out: Float64Array[] = [];
      for (let p = 0; p < pathCount; p++) {
        const proc = buildProcess(spec);
        const rng = createRng(1000 + p);
        out.push(proc.simulatePath(initialLevel, months, 1 / 12, rng));
      }
      return out;
    } catch {
      return [];
    }
  }, [spec, initialLevel, months, pathCount]);

  if (paths.length === 0) return null;

  const width = 240;
  const height = 56;
  const pad = 3;
  let min = Infinity;
  let max = -Infinity;
  for (const path of paths) {
    for (const v of path) {
      if (Number.isFinite(v)) {
        min = Math.min(min, v);
        max = Math.max(max, v);
      }
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return null;

  const toX = (i: number) => pad + (i / (months - 1)) * (width - 2 * pad);
  const toY = (v: number) => height - pad - ((v - min) / (max - min)) * (height - 2 * pad);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      role="img"
      aria-label="Sample paths preview"
      style={{ display: "block" }}
    >
      {paths.map((path, pi) => {
        const d = Array.from(path)
          .map((v, i) => `${i === 0 ? "M" : "L"} ${toX(i).toFixed(1)} ${toY(v).toFixed(1)}`)
          .join(" ");
        return <path key={pi} d={d} fill="none" stroke="var(--sparkline-line, #6d67e4)" strokeWidth={0.75} opacity={0.35} />;
      })}
    </svg>
  );
}
