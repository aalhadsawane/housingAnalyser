"use client";

import type { AdvantageDecomposition as AdvantageDecompositionData } from "@/lib/engine/stats";

function formatCurrency(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 10_000_000) return `${sign}₹${(abs / 10_000_000).toFixed(2)} Cr`;
  if (abs >= 100_000) return `${sign}₹${(abs / 100_000).toFixed(1)} L`;
  return `${sign}₹${abs.toFixed(0)}`;
}

interface Segment {
  label: string;
  value: number;
  color: string;
}

/** A single horizontal bar built from signed segments laid end-to-end (positive segments extend right, negative segments cut back left) — a plain-HTML stand-in for a waterfall chart, sized so it reads as an infographic rather than a dense data chart. */
function StackedBar({ segments, scaleMax }: { segments: Segment[]; scaleMax: number }) {
  let cursor = 0;
  const pieces = segments.map((seg) => {
    const widthPct = (Math.abs(seg.value) / scaleMax) * 100;
    const leftPct = ((seg.value >= 0 ? cursor : cursor - Math.abs(seg.value)) / scaleMax) * 100;
    cursor += seg.value;
    return { ...seg, widthPct, leftPct };
  });
  return (
    <div className="relative h-7 w-full overflow-hidden rounded bg-black/5 dark:bg-white/5">
      {pieces.map((p, i) => (
        <div
          key={i}
          title={`${p.label}: ${formatCurrency(p.value)}`}
          className="absolute top-0 h-full"
          style={{ left: `${Math.max(0, p.leftPct)}%`, width: `${p.widthPct}%`, background: p.color }}
        />
      ))}
    </div>
  );
}

function Legend({ segments }: { segments: Segment[] }) {
  return (
    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
      {segments.map((s) => (
        <span key={s.label} className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm" style={{ background: s.color }} />
          {s.label}: <b>{formatCurrency(s.value)}</b>
        </span>
      ))}
    </div>
  );
}

const NEGATIVE_COLOR = "#c0554a";

/**
 * "Where does the wealth come from?" — the dashboard's "why" chart: two
 * bars, each broken into the honest components that add up (exactly, by
 * construction) to that branch's own final wealth. Sharing one scale
 * (scaleMax) makes the two bars' total lengths directly comparable.
 */
export function AdvantageDecomposition({ decomposition }: { decomposition: AdvantageDecompositionData }) {
  const { buy, rent, buyFinalNetWorth, rentFinalNetWorth } = decomposition;

  const buySegments: Segment[] = [
    { label: "Down payment", value: buy.downPayment, color: "#6d67e4" },
    { label: "Home value going up", value: buy.propertyAppreciationGain, color: "#8b7ff0" },
    { label: "Paying off the loan", value: buy.principalRepaid, color: "#a99bf5" },
    { label: "Savings invested at start", value: buy.initialSidePortfolio, color: "#5b53d6" },
    { label: "Tax savings, invested", value: buy.taxSavingsContributed, color: "#4a3fc7" },
    { label: "Growth on savings", value: buy.investmentGrowth, color: "#3a2eb8" },
    { label: "Cost of selling later", value: -buy.exitCosts, color: NEGATIVE_COLOR },
  ];

  const rentSegments: Segment[] = [
    { label: "Savings invested at start", value: rent.initialSidePortfolio, color: "#e48a67" },
    { label: "Money saved vs. buying, invested", value: rent.differentialContributed, color: "#eea57e" },
    { label: "Tax savings (HRA), invested", value: rent.hraTaxSavingsContributed, color: "#d97b52" },
    { label: "Deposit refunds/re-deposits", value: rent.depositCashFlowContributed, color: "#c96b42" },
    { label: "Growth on savings", value: rent.investmentGrowth, color: "#b85a32" },
    { label: "Deposit still held", value: rent.finalDepositHeld, color: "#f0b593" },
  ];

  const scaleMax = Math.max(
    buySegments.reduce((a, s) => a + Math.max(0, s.value), 0),
    rentSegments.reduce((a, s) => a + Math.max(0, s.value), 0),
    1,
  );

  return (
    <div>
      <h3 className="text-[13px] font-semibold">Where does the wealth come from?</h3>
      <p className="mb-3 text-[11px] text-neutral-500">
        Each bar breaks that choice&apos;s <em>average</em> final wealth (across all scenarios) into what actually
        built it. Both bars use the same scale, so their lengths are directly comparable. Averages can differ from
        the &quot;typical scenario&quot; figures above when outcomes are skewed — a few very good or very bad
        scenarios pull the average without moving the typical case much.
      </p>

      <div className="mb-4">
        <div className="mb-1 flex items-baseline justify-between text-[12px]">
          <span className="font-medium" style={{ color: "#6d67e4" }}>
            If you buy
          </span>
          <span className="text-neutral-500">
            final: <b>{formatCurrency(buyFinalNetWorth)}</b>
          </span>
        </div>
        <StackedBar segments={buySegments} scaleMax={scaleMax} />
        <Legend segments={buySegments} />
      </div>

      <div>
        <div className="mb-1 flex items-baseline justify-between text-[12px]">
          <span className="font-medium" style={{ color: "#e48a67" }}>
            If you rent
          </span>
          <span className="text-neutral-500">
            final: <b>{formatCurrency(rentFinalNetWorth)}</b>
          </span>
        </div>
        <StackedBar segments={rentSegments} scaleMax={scaleMax} />
        <Legend segments={rentSegments} />
      </div>
    </div>
  );
}
