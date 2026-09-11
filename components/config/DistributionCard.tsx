"use client";

import { useMemo, useState } from "react";
import {
  DISTRIBUTION_FAMILIES,
  DISTRIBUTION_REGISTRY,
  fitFromPercentiles,
  summarize,
  type DistributionFamily,
} from "@/lib/engine/distributions";
import { buildDistribution } from "@/lib/engine/factory";
import type { DistributionSpec } from "@/lib/engine/schema";
import { PdfSparkline } from "./PdfSparkline";

export interface DistributionCardProps {
  label: string;
  spec: DistributionSpec;
  onChange: (spec: DistributionSpec) => void;
  /** Overrides the distribution's own built-in rationale() text, e.g. to add scenario-specific context. */
  rationaleOverride?: string;
  unit?: string; // e.g. "%/yr", "₹", "months"
  compact?: boolean; // tighter layout for nested cards (a process's shock / jumpSize)
  formatValue?: (x: number) => string;
}

/** Heuristic slider range for a raw numeric param — deliberately generic (keyed off the value's own magnitude and a few common naming conventions) rather than hardcoded per real-world factor, so this one card works for every one of the 60+ stochastic slots in the schema without per-field configuration. */
export function suggestedRange(key: string, value: number): { min: number; max: number; step: number } {
  if (/Pct$|Fraction$|^weightA$|^lambda$/i.test(key) && value >= 0 && value <= 1) {
    return { min: 0, max: 1, step: 0.001 };
  }
  if (/^df$/i.test(key)) return { min: 1, max: 60, step: 1 };
  const magnitude = Math.max(Math.abs(value), 0.01);
  const spread = magnitude * 1.5 + 0.01;
  return { min: value - spread, max: value + spread, step: spread / 200 };
}

const defaultFormat = (x: number) => (Math.abs(x) >= 1000 ? x.toLocaleString("en-IN", { maximumFractionDigits: 0 }) : x.toFixed(4));

export function DistributionCard({
  label,
  spec,
  onChange,
  rationaleOverride,
  unit,
  compact,
  formatValue = defaultFormat,
}: DistributionCardProps) {
  const [entryMode, setEntryMode] = useState<"params" | "percentiles">("params");

  const distribution = useMemo(() => {
    try {
      return buildDistribution(spec);
    } catch {
      return null;
    }
  }, [spec]);

  const familyMeta = DISTRIBUTION_REGISTRY[spec.family];
  const summary = distribution ? summarize(distribution) : null;

  function handleFamilyChange(nextFamily: DistributionFamily) {
    if (nextFamily === spec.family) return;
    if (nextFamily === "mixture") {
      onChange({ family: "mixture", params: { weightA: 0.8 }, components: [spec, { ...spec }] });
      return;
    }
    // Carry the current distribution's location/spread over into the new
    // family via a percentile round-trip, so switching families doesn't
    // reset the card to an unrelated default.
    if (distribution) {
      try {
        const p10 = distribution.quantile(0.1);
        const p50 = distribution.quantile(0.5);
        const p90 = distribution.quantile(0.9);
        const fitted = fitFromPercentiles(nextFamily, p10, p50, p90);
        onChange({ family: nextFamily, params: fitted.params() });
        return;
      } catch {
        // fall through to plain registry default below
      }
    }
    onChange({ family: nextFamily, params: DISTRIBUTION_REGISTRY[nextFamily].create({}).params() });
  }

  function handleParamChange(key: string, value: number) {
    onChange({ ...spec, params: { ...spec.params, [key]: value } });
  }

  function handlePercentileChange(p10: number, p50: number, p90: number) {
    try {
      const fitted = fitFromPercentiles(spec.family, p10, p50, p90);
      onChange({ ...spec, params: fitted.params() });
    } catch {
      // invalid intermediate state (e.g. p10 > p90 while typing) — ignore until it's valid again
    }
  }

  const rationale = rationaleOverride ?? distribution?.rationale() ?? "";

  return (
    <div
      className={`rounded-lg border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/[0.03] ${compact ? "p-2.5" : "p-3.5"}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`font-medium ${compact ? "text-xs" : "text-sm"}`}>{label}</span>
        <select
          value={spec.family}
          onChange={(e) => handleFamilyChange(e.target.value as DistributionFamily)}
          className="rounded border border-black/15 dark:border-white/15 bg-transparent px-1.5 py-0.5 text-xs font-medium text-[#6d67e4]"
        >
          {DISTRIBUTION_FAMILIES.map((f) => (
            <option key={f} value={f}>
              {DISTRIBUTION_REGISTRY[f].label}
            </option>
          ))}
        </select>
      </div>

      {rationale && <p className="mt-1 text-[11px] leading-snug text-neutral-500 dark:text-neutral-400">{rationale}</p>}

      {spec.family === "mixture" && spec.components ? (
        <MixtureEditor spec={spec} onChange={onChange} unit={unit} formatValue={formatValue} />
      ) : spec.family === "empirical" ? (
        <EmpiricalEditor spec={spec} onChange={onChange} />
      ) : (
        <>
          {distribution && <PdfSparkline distribution={distribution} />}

          <div className="mt-1 flex gap-1 text-[10px]">
            <button
              onClick={() => setEntryMode("params")}
              className={`rounded px-1.5 py-0.5 ${entryMode === "params" ? "bg-[#6d67e4] text-white" : "text-neutral-500"}`}
            >
              By parameters
            </button>
            <button
              onClick={() => setEntryMode("percentiles")}
              className={`rounded px-1.5 py-0.5 ${entryMode === "percentiles" ? "bg-[#6d67e4] text-white" : "text-neutral-500"}`}
            >
              By percentiles
            </button>
          </div>

          {entryMode === "params" ? (
            <div className="mt-1.5 grid gap-1.5">
              {familyMeta.label !== "Fixed"
                ? Object.entries(spec.params).map(([key, value]) => {
                    const range = suggestedRange(key, value);
                    return (
                      <ParamSlider
                        key={key}
                        label={key}
                        value={value}
                        {...range}
                        onChange={(v) => handleParamChange(key, v)}
                      />
                    );
                  })
                : (
                    <ParamSlider
                      label="value"
                      value={spec.params.value ?? 0}
                      {...suggestedRange("value", spec.params.value ?? 0)}
                      onChange={(v) => handleParamChange("value", v)}
                    />
                  )}
            </div>
          ) : (
            summary && (
              <PercentileEditor
                p10={summary.p10}
                p50={summary.median}
                p90={summary.p90}
                onChange={handlePercentileChange}
              />
            )
          )}
        </>
      )}

      {summary && (
        <div className="mt-2 grid grid-cols-4 gap-x-2 gap-y-0.5 text-[10px] text-neutral-500 dark:text-neutral-400">
          <span>
            mean <b className="text-neutral-800 dark:text-neutral-200">{formatValue(summary.mean)}</b>
          </span>
          <span>
            median <b className="text-neutral-800 dark:text-neutral-200">{formatValue(summary.median)}</b>
          </span>
          <span>
            P5 <b className="text-neutral-800 dark:text-neutral-200">{formatValue(summary.p5)}</b>
          </span>
          <span>
            P95 <b className="text-neutral-800 dark:text-neutral-200">{formatValue(summary.p95)}</b>
          </span>
        </div>
      )}
      {unit && <div className="mt-0.5 text-[10px] text-neutral-400">units: {unit}</div>}
    </div>
  );
}

export function ParamSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="grid grid-cols-[1fr_auto] items-center gap-x-2 gap-y-0.5 text-[11px]">
      <span className="text-neutral-500 dark:text-neutral-400">{label}</span>
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-20 rounded border border-black/10 dark:border-white/10 bg-transparent px-1 py-0.5 text-right text-[11px]"
      />
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Number(e.target.value))}
        className="col-span-2 h-1 accent-[#6d67e4]"
      />
    </label>
  );
}

function PercentileEditor({
  p10,
  p50,
  p90,
  onChange,
}: {
  p10: number;
  p50: number;
  p90: number;
  onChange: (p10: number, p50: number, p90: number) => void;
}) {
  const [local, setLocal] = useState({ p10, p50, p90 });
  return (
    <div className="mt-1.5 grid grid-cols-3 gap-1.5 text-[11px]">
      {(["p10", "p50", "p90"] as const).map((k) => (
        <label key={k} className="flex flex-col gap-0.5">
          <span className="text-neutral-500 dark:text-neutral-400">{k.toUpperCase()}</span>
          <input
            type="number"
            value={local[k]}
            onChange={(e) => {
              const next = { ...local, [k]: Number(e.target.value) };
              setLocal(next);
              onChange(next.p10, next.p50, next.p90);
            }}
            className="rounded border border-black/10 dark:border-white/10 bg-transparent px-1 py-0.5 text-[11px]"
          />
        </label>
      ))}
    </div>
  );
}

function MixtureEditor({
  spec,
  onChange,
  unit,
  formatValue,
}: {
  spec: DistributionSpec;
  onChange: (s: DistributionSpec) => void;
  unit?: string;
  formatValue: (x: number) => string;
}) {
  const [a, b] = spec.components!;
  const weightA = spec.params.weightA ?? 0.5;
  return (
    <div className="mt-1.5 grid gap-2">
      <ParamSlider
        label="weight on regime A"
        value={weightA}
        min={0}
        max={1}
        step={0.01}
        onChange={(v) => onChange({ ...spec, params: { ...spec.params, weightA: v } })}
      />
      <div className="grid gap-2 sm:grid-cols-2">
        <DistributionCard
          label="Regime A"
          spec={a}
          onChange={(next) => onChange({ ...spec, components: [next, b] })}
          unit={unit}
          compact
          formatValue={formatValue}
        />
        <DistributionCard
          label="Regime B"
          spec={b}
          onChange={(next) => onChange({ ...spec, components: [a, next] })}
          unit={unit}
          compact
          formatValue={formatValue}
        />
      </div>
    </div>
  );
}

function EmpiricalEditor({ spec, onChange }: { spec: DistributionSpec; onChange: (s: DistributionSpec) => void }) {
  const [text, setText] = useState((spec.data ?? []).join(", "));
  return (
    <div className="mt-1.5">
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const data = e.target.value
            .split(/[,\s]+/)
            .map(Number)
            .filter((n) => Number.isFinite(n));
          if (data.length > 0) onChange({ ...spec, data });
        }}
        placeholder="Paste comma-separated historical values, e.g. 0.06, 0.08, -0.02, 0.11 ..."
        rows={3}
        className="w-full rounded border border-black/10 dark:border-white/10 bg-transparent px-1.5 py-1 text-[11px]"
      />
      <p className="mt-0.5 text-[10px] text-neutral-400">
        {(spec.data ?? []).length} values loaded — resampled directly, no shape assumed.
      </p>
    </div>
  );
}
