"use client";

import { PROCESS_KIND_LABELS, PROCESS_KINDS, type ProcessKind } from "@/lib/engine/processes";
import type { DistributionSpec, ProcessSpec } from "@/lib/engine/schema";
import { DistributionCard, ParamSlider, suggestedRange } from "./DistributionCard";
import { PathPreview } from "./PathPreview";

const STANDARD_NORMAL_SHOCK: DistributionSpec = { family: "normal", params: { mu: 0, sigma: 1 } };

export interface ProcessCardProps {
  label: string;
  spec: ProcessSpec;
  onChange: (spec: ProcessSpec) => void;
  unit?: string;
  /** Starting level for the path preview — e.g. purchasePrice for appreciation, 1 for a multiplicative return process, or the process's own theta for a rate-like OU. */
  initialLevel: number;
  monthsPreview?: number;
  formatValue?: (x: number) => string;
}

/** Best-effort carry-over of mu/theta/sigma when switching a driver's process kind, so the card doesn't silently reset to an unrelated default mid-edit. */
function defaultSpecForKind(kind: ProcessKind, from: ProcessSpec): ProcessSpec {
  const mu = "mu" in from ? from.mu : "theta" in from ? from.theta : 0.05;
  const sigma = "sigma" in from ? from.sigma : 0.1;
  switch (kind) {
    case "iid":
      return { kind, shock: STANDARD_NORMAL_SHOCK };
    case "ornsteinUhlenbeck":
      return { kind, kappa: 0.3, theta: mu, sigma, shock: STANDARD_NORMAL_SHOCK };
    case "gbm":
      return { kind, mu, sigma, shock: STANDARD_NORMAL_SHOCK };
    case "mertonJump":
      return {
        kind,
        mu,
        sigma,
        lambda: 0.2,
        jumpSize: { family: "lognormal", params: { muLog: Math.log(0.8), sigmaLog: 0.15 } },
        shock: STANDARD_NORMAL_SHOCK,
      };
    case "regimeSwitching":
      return {
        kind,
        regimes: [
          { name: "calm", returnDistribution: { family: "normal", params: { mu, sigma } } },
          { name: "stressed", returnDistribution: { family: "normal", params: { mu: mu - 0.2, sigma: sigma * 2 } } },
        ],
        transitionMatrix: [
          [0.95, 0.05],
          [0.4, 0.6],
        ],
      };
    case "blockBootstrap":
      return { kind, historicalReturns: [0.02, -0.01, 0.03, 0.01, -0.02, 0.04], blockLength: 6 };
  }
}

export function ProcessCard({ label, spec, onChange, unit, initialLevel, monthsPreview = 60, formatValue }: ProcessCardProps) {
  function handleKindChange(nextKind: ProcessKind) {
    if (nextKind === spec.kind) return;
    onChange(defaultSpecForKind(nextKind, spec));
  }

  return (
    <div className="rounded-lg border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/[0.03] p-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-medium">{label}</span>
        <select
          value={spec.kind}
          onChange={(e) => handleKindChange(e.target.value as ProcessKind)}
          className="min-w-0 max-w-[55%] rounded border border-black/15 dark:border-white/15 bg-transparent px-1.5 py-0.5 text-xs font-medium text-[#6d67e4]"
        >
          {PROCESS_KINDS.map((k) => (
            <option key={k} value={k}>
              {PROCESS_KIND_LABELS[k]}
            </option>
          ))}
        </select>
      </div>

      <PathPreview spec={spec} initialLevel={initialLevel} months={monthsPreview} />

      <div className="mt-2 grid grid-cols-1 gap-2">
        {spec.kind === "iid" && (
          <DistributionCard label="Draw" spec={spec.shock} onChange={(s) => onChange({ ...spec, shock: s })} unit={unit} compact formatValue={formatValue} />
        )}

        {spec.kind === "ornsteinUhlenbeck" && (
          <>
            <ParamSlider
              label="kappa (speed of reversion)"
              value={spec.kappa}
              {...suggestedRange("kappa", spec.kappa)}
              help="How fast this snaps back to its long-run level after a shock. Higher = bounces back within a year or two (stable); lower = a shock can linger for many years."
              onChange={(v) => onChange({ ...spec, kappa: v })}
            />
            <ParamSlider
              label="theta (long-run level)"
              value={spec.theta}
              {...suggestedRange("theta", spec.theta)}
              help="The level this reverts to over time — set this to what you believe the long-run 'normal' value actually is today."
              onChange={(v) => onChange({ ...spec, theta: v })}
            />
            <ParamSlider
              label="sigma (volatility)"
              value={spec.sigma}
              {...suggestedRange("sigma", spec.sigma)}
              help="How much this can wobble month to month. Higher = less predictable, wider range of paths."
              onChange={(v) => onChange({ ...spec, sigma: v })}
            />
            <DistributionCard label="Innovation shape" spec={spec.shock} onChange={(s) => onChange({ ...spec, shock: s })} compact formatValue={formatValue} />
          </>
        )}

        {spec.kind === "gbm" && (
          <>
            <ParamSlider
              label="mu (drift)"
              value={spec.mu}
              {...suggestedRange("mu", spec.mu)}
              help="The average yearly growth rate you expect — this is the single most important number in this card."
              onChange={(v) => onChange({ ...spec, mu: v })}
            />
            <ParamSlider
              label="sigma (volatility)"
              value={spec.sigma}
              {...suggestedRange("sigma", spec.sigma)}
              help="How uncertain that growth rate is, year to year. Higher = wider range of good and bad years."
              onChange={(v) => onChange({ ...spec, sigma: v })}
            />
            <DistributionCard label="Log-return shape" spec={spec.shock} onChange={(s) => onChange({ ...spec, shock: s })} compact formatValue={formatValue} />
          </>
        )}

        {spec.kind === "mertonJump" && (
          <>
            <ParamSlider
              label="mu (drift)"
              value={spec.mu}
              {...suggestedRange("mu", spec.mu)}
              help="The average yearly growth rate in normal (non-jump) times."
              onChange={(v) => onChange({ ...spec, mu: v })}
            />
            <ParamSlider
              label="sigma (volatility)"
              value={spec.sigma}
              {...suggestedRange("sigma", spec.sigma)}
              help="Normal month-to-month wobble, separate from the rare jumps below."
              onChange={(v) => onChange({ ...spec, sigma: v })}
            />
            <ParamSlider
              label="lambda (jumps/year)"
              value={spec.lambda}
              {...suggestedRange("lambda", spec.lambda)}
              help="How often a sudden jump (e.g. a crash) happens, on average. 0.2 means roughly once every 5 years."
              onChange={(v) => onChange({ ...spec, lambda: v })}
            />
            <DistributionCard label="Jump size" spec={spec.jumpSize} onChange={(s) => onChange({ ...spec, jumpSize: s })} compact formatValue={formatValue} />
            <DistributionCard label="Diffusive shape" spec={spec.shock} onChange={(s) => onChange({ ...spec, shock: s })} compact formatValue={formatValue} />
          </>
        )}

        {spec.kind === "regimeSwitching" && (
          <RegimeSwitchingEditor spec={spec} onChange={onChange} formatValue={formatValue} />
        )}

        {spec.kind === "blockBootstrap" && <BlockBootstrapEditor spec={spec} onChange={onChange} />}
      </div>
    </div>
  );
}

function RegimeSwitchingEditor({
  spec,
  onChange,
  formatValue,
}: {
  spec: Extract<ProcessSpec, { kind: "regimeSwitching" }>;
  onChange: (s: ProcessSpec) => void;
  formatValue?: (x: number) => string;
}) {
  return (
    <div className="grid grid-cols-1 gap-2">
      {spec.regimes.map((regime, i) => (
        <DistributionCard
          key={i}
          label={`Regime: ${regime.name}`}
          spec={regime.returnDistribution}
          onChange={(s) => {
            const regimes = spec.regimes.slice();
            regimes[i] = { ...regime, returnDistribution: s };
            onChange({ ...spec, regimes });
          }}
          compact
          formatValue={formatValue}
        />
      ))}
      <div className="text-[10px] text-neutral-500">
        <div className="mb-0.5">Transition matrix (row i → column j monthly probability; each row should sum to 1)</div>
        <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${spec.regimes.length}, minmax(0,1fr))` }}>
          {spec.transitionMatrix.map((row, i) =>
            row.map((v, j) => (
              <input
                key={`${i}-${j}`}
                type="number"
                step={0.01}
                min={0}
                max={1}
                value={v}
                onChange={(e) => {
                  const matrix = spec.transitionMatrix.map((r) => r.slice());
                  matrix[i]![j] = Number(e.target.value);
                  onChange({ ...spec, transitionMatrix: matrix });
                }}
                className="rounded border border-black/10 dark:border-white/10 bg-transparent px-1 py-0.5 text-[10px]"
              />
            )),
          )}
        </div>
      </div>
    </div>
  );
}

function BlockBootstrapEditor({
  spec,
  onChange,
}: {
  spec: Extract<ProcessSpec, { kind: "blockBootstrap" }>;
  onChange: (s: ProcessSpec) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-1.5">
      <textarea
        defaultValue={spec.historicalReturns.join(", ")}
        onChange={(e) => {
          const data = e.target.value
            .split(/[,\s]+/)
            .map(Number)
            .filter((n) => Number.isFinite(n));
          if (data.length > 0) onChange({ ...spec, historicalReturns: data });
        }}
        placeholder="Historical per-month log-returns, comma-separated"
        rows={3}
        className="w-full rounded border border-black/10 dark:border-white/10 bg-transparent px-1.5 py-1 text-[11px]"
      />
      <ParamSlider
        label="block length (months)"
        value={spec.blockLength}
        min={1}
        max={36}
        step={1}
        onChange={(v) => onChange({ ...spec, blockLength: Math.round(v) })}
      />
    </div>
  );
}
