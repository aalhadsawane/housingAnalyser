import type { BuyWealthDecomposition } from "./buyPath";
import type { PathDriverSummary } from "./simulate";
import type { RentWealthDecomposition } from "./rentPath";

/**
 * Cross-path statistics used by the charts in PLAN.md section 4: per-month
 * percentile bands for the fan chart, and the headline decision summary
 * (P(buy wins), median advantage, tail risk, breakeven timing) for the
 * sticky summary bar and the auto-generated insight text.
 */

export function percentileOfSorted(sortedAscending: Float64Array | number[], p: number): number {
  const n = sortedAscending.length;
  if (n === 0) return NaN;
  if (n === 1) return sortedAscending[0]!;
  const idx = p * (n - 1);
  const lo = Math.floor(idx);
  const hi = Math.min(lo + 1, n - 1);
  const frac = idx - lo;
  return sortedAscending[lo]! + frac * (sortedAscending[hi]! - sortedAscending[lo]!);
}

export interface FanBand {
  month: number;
  p5: number;
  p10: number;
  p25: number;
  median: number;
  p75: number;
  p90: number;
  p95: number;
}

/** Per-month percentile bands across all paths — O(months * paths * log(paths)) via a per-month sort. */
export function computeFanBands(paths: Float64Array[]): FanBand[] {
  const months = paths[0]?.length ?? 0;
  const bands: FanBand[] = new Array(months);
  const scratch = new Float64Array(paths.length);
  for (let t = 0; t < months; t++) {
    for (let p = 0; p < paths.length; p++) scratch[p] = paths[p]![t]!;
    const sorted = Array.from(scratch).sort((a, b) => a - b);
    bands[t] = {
      month: t,
      p5: percentileOfSorted(sorted, 0.05),
      p10: percentileOfSorted(sorted, 0.1),
      p25: percentileOfSorted(sorted, 0.25),
      median: percentileOfSorted(sorted, 0.5),
      p75: percentileOfSorted(sorted, 0.75),
      p90: percentileOfSorted(sorted, 0.9),
      p95: percentileOfSorted(sorted, 0.95),
    };
  }
  return bands;
}

export interface DecisionSummary {
  probBuyWins: number;
  medianDelta: number; // median(buy_final - rent_final)
  meanDelta: number;
  cvar5Buy: number; // mean of the worst 5% of buy's own final-net-worth outcomes
  cvar5Rent: number;
  breakevenMonthMedian: number | null; // median month (across paths that DO cross) that buy first overtakes rent
  breakevenMonthP25: number | null;
  breakevenMonthP75: number | null;
  breakevenNeverShare: number; // fraction of paths where buy never overtakes rent within the horizon
}

function cvarLowTail(sortedAscending: number[], tailFraction = 0.05): number {
  const n = sortedAscending.length;
  const count = Math.max(1, Math.round(n * tailFraction));
  let sum = 0;
  for (let i = 0; i < count; i++) sum += sortedAscending[i]!;
  return sum / count;
}

/** Per-path first month buy's net worth reaches or exceeds rent's — `null` for a path where that never happens within the horizon. Exposed on its own (not just baked into computeDecisionSummary) so the breakeven-distribution histogram can show the full shape, not just its median/IQR. */
export function computeBreakevenMonths(buy: Float64Array[], rent: Float64Array[]): (number | null)[] {
  const n = buy.length;
  const months = buy[0]?.length ?? 0;
  const result: (number | null)[] = new Array(n);
  for (let p = 0; p < n; p++) {
    const buyPath = buy[p]!;
    const rentPath = rent[p]!;
    let crossedAt: number | null = null;
    for (let t = 0; t < months; t++) {
      if (buyPath[t]! >= rentPath[t]!) {
        crossedAt = t;
        break;
      }
    }
    result[p] = crossedAt;
  }
  return result;
}

export function computeDecisionSummary(buy: Float64Array[], rent: Float64Array[]): DecisionSummary {
  const n = buy.length;
  const months = buy[0]?.length ?? 0;

  const buyFinals: number[] = new Array(n);
  const rentFinals: number[] = new Array(n);
  const deltas: number[] = new Array(n);

  for (let p = 0; p < n; p++) {
    const buyFinal = buy[p]![months - 1]!;
    const rentFinal = rent[p]![months - 1]!;
    buyFinals[p] = buyFinal;
    rentFinals[p] = rentFinal;
    deltas[p] = buyFinal - rentFinal;
  }

  const breakevenMonths = computeBreakevenMonths(buy, rent);
  const crossedMonths = breakevenMonths.filter((m): m is number => m !== null);
  const neverCrosses = n - crossedMonths.length;

  const sortedDeltas = [...deltas].sort((a, b) => a - b);
  const sortedBuyFinals = [...buyFinals].sort((a, b) => a - b);
  const sortedRentFinals = [...rentFinals].sort((a, b) => a - b);
  const sortedBreakevens = [...crossedMonths].sort((a, b) => a - b);

  const winCount = deltas.filter((d) => d > 0).length;

  return {
    probBuyWins: winCount / n,
    medianDelta: percentileOfSorted(sortedDeltas, 0.5),
    meanDelta: deltas.reduce((a, b) => a + b, 0) / n,
    cvar5Buy: cvarLowTail(sortedBuyFinals),
    cvar5Rent: cvarLowTail(sortedRentFinals),
    breakevenMonthMedian: sortedBreakevens.length > 0 ? percentileOfSorted(sortedBreakevens, 0.5) : null,
    breakevenMonthP25: sortedBreakevens.length > 0 ? percentileOfSorted(sortedBreakevens, 0.25) : null,
    breakevenMonthP75: sortedBreakevens.length > 0 ? percentileOfSorted(sortedBreakevens, 0.75) : null,
    breakevenNeverShare: neverCrosses / n,
  };
}

/** P(buy net worth >= rent net worth) at every month — the "probability buying wins, by horizon" chart. Free: reuses the same matrices the fan chart does. */
export function computeWinProbabilityByMonth(buy: Float64Array[], rent: Float64Array[]): Float64Array {
  const n = buy.length;
  const months = buy[0]?.length ?? 0;
  const prob = new Float64Array(months);
  for (let t = 0; t < months; t++) {
    let wins = 0;
    for (let p = 0; p < n; p++) {
      if (buy[p]![t]! >= rent[p]![t]!) wins += 1;
    }
    prob[t] = wins / n;
  }
  return prob;
}

export interface HistogramBin {
  binStart: number;
  binEnd: number;
  count: number;
}

export interface DeltaHistogramAtMonth {
  month: number;
  bins: HistogramBin[];
  p10: number;
  median: number;
  p90: number;
  probBuyWins: number;
}

/** Histogram of (buy - rent) net worth at one specific month — the "distribution of the wealth difference" small-multiple chart. */
export function computeDeltaHistogramAtMonth(
  buy: Float64Array[],
  rent: Float64Array[],
  month: number,
  numBins = 24,
): DeltaHistogramAtMonth {
  const n = buy.length;
  const deltas = new Array<number>(n);
  for (let p = 0; p < n; p++) deltas[p] = buy[p]![month]! - rent[p]![month]!;
  const sorted = [...deltas].sort((a, b) => a - b);

  const lo = sorted[0]!;
  const hi = sorted[sorted.length - 1]!;
  const span = hi - lo || 1;
  const binWidth = span / numBins;
  const bins: HistogramBin[] = Array.from({ length: numBins }, (_, i) => ({
    binStart: lo + i * binWidth,
    binEnd: lo + (i + 1) * binWidth,
    count: 0,
  }));
  for (const d of deltas) {
    const idx = Math.min(numBins - 1, Math.max(0, Math.floor((d - lo) / binWidth)));
    bins[idx]!.count += 1;
  }

  return {
    month,
    bins,
    p10: percentileOfSorted(sorted, 0.1),
    median: percentileOfSorted(sorted, 0.5),
    p90: percentileOfSorted(sorted, 0.9),
    probBuyWins: deltas.filter((d) => d > 0).length / n,
  };
}

/** Spearman rank correlation, for the tornado/sensitivity chart (PLAN.md section 4, chart 5). */
export function spearmanCorrelation(x: number[], y: number[]): number {
  const rank = (values: number[]): number[] => {
    const idx = values.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
    const ranks = new Array(values.length);
    let i = 0;
    while (i < idx.length) {
      let j = i;
      while (j + 1 < idx.length && idx[j + 1]![0] === idx[i]![0]) j++;
      const avgRank = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) ranks[idx[k]![1]] = avgRank;
      i = j + 1;
    }
    return ranks;
  };
  const rx = rank(x);
  const ry = rank(y);
  const n = x.length;
  const meanRx = rx.reduce((a: number, b: number) => a + b, 0) / n;
  const meanRy = ry.reduce((a: number, b: number) => a + b, 0) / n;
  let cov = 0,
    varX = 0,
    varY = 0;
  for (let i = 0; i < n; i++) {
    cov += (rx[i]! - meanRx) * (ry[i]! - meanRy);
    varX += (rx[i]! - meanRx) ** 2;
    varY += (ry[i]! - meanRy) ** 2;
  }
  return cov / Math.sqrt(varX * varY);
}

// ---------------------------------------------------------------------------
// "Where does the wealth come from?" — average wealth decomposition
// ---------------------------------------------------------------------------

export interface AveragedBuyDecomposition extends BuyWealthDecomposition {}
export interface AveragedRentDecomposition extends RentWealthDecomposition {}

export interface AdvantageDecomposition {
  buy: AveragedBuyDecomposition;
  rent: AveragedRentDecomposition;
  buyFinalNetWorth: number; // sum of buy's components (net of exit costs) — should match mean(buyNetWorth final month)
  rentFinalNetWorth: number;
}

function averageBuyDecomposition(items: BuyWealthDecomposition[]): AveragedBuyDecomposition {
  const n = items.length || 1;
  const sum = (f: (d: BuyWealthDecomposition) => number) => items.reduce((a, d) => a + f(d), 0) / n;
  return {
    downPayment: sum((d) => d.downPayment),
    propertyAppreciationGain: sum((d) => d.propertyAppreciationGain),
    principalRepaid: sum((d) => d.principalRepaid),
    initialSidePortfolio: sum((d) => d.initialSidePortfolio),
    taxSavingsContributed: sum((d) => d.taxSavingsContributed),
    investmentGrowth: sum((d) => d.investmentGrowth),
    exitCosts: sum((d) => d.exitCosts),
  };
}

function averageRentDecomposition(items: RentWealthDecomposition[]): AveragedRentDecomposition {
  const n = items.length || 1;
  const sum = (f: (d: RentWealthDecomposition) => number) => items.reduce((a, d) => a + f(d), 0) / n;
  return {
    initialSidePortfolio: sum((d) => d.initialSidePortfolio),
    differentialContributed: sum((d) => d.differentialContributed),
    hraTaxSavingsContributed: sum((d) => d.hraTaxSavingsContributed),
    depositCashFlowContributed: sum((d) => d.depositCashFlowContributed),
    investmentGrowth: sum((d) => d.investmentGrowth),
    finalDepositHeld: sum((d) => d.finalDepositHeld),
  };
}

/**
 * Averages each path's exact wealth decomposition into one representative
 * decomposition per branch. This is statistically exact, not an
 * approximation: since every component is additive (each path's components
 * sum exactly to that path's final net worth — see buyPath.ts/rentPath.ts),
 * the average of the components also sums to the average final net worth,
 * by linearity of expectation.
 */
export function computeAdvantageDecomposition(
  buyDecompositions: BuyWealthDecomposition[],
  rentDecompositions: RentWealthDecomposition[],
): AdvantageDecomposition {
  const buy = averageBuyDecomposition(buyDecompositions);
  const rent = averageRentDecomposition(rentDecompositions);

  const buyFinalNetWorth =
    buy.downPayment +
    buy.propertyAppreciationGain +
    buy.principalRepaid +
    buy.initialSidePortfolio +
    buy.taxSavingsContributed +
    buy.investmentGrowth -
    buy.exitCosts;

  const rentFinalNetWorth =
    rent.initialSidePortfolio +
    rent.differentialContributed +
    rent.hraTaxSavingsContributed +
    rent.depositCashFlowContributed +
    rent.investmentGrowth +
    rent.finalDepositHeld;

  return { buy, rent, buyFinalNetWorth, rentFinalNetWorth };
}

// ---------------------------------------------------------------------------
// "What drives the decision?" — sensitivity tornado from the existing paths
// ---------------------------------------------------------------------------

export interface TornadoEntry {
  driver: keyof PathDriverSummary;
  label: string;
  correlation: number; // Spearman rank correlation with (buy_final - rent_final); positive = higher driver value favors buying
}

const DRIVER_LABELS: Record<keyof PathDriverSummary, string> = {
  appreciationRealized: "Property appreciation",
  equityReturnRealized: "Equity returns",
  debtReturnRealized: "Debt returns",
  inflationRealized: "Inflation",
  rentGrowthRealized: "Rent growth",
  repoRateRealized: "Loan interest rate",
  incomeGrowthRealized: "Income growth",
};

/**
 * Ranks each macro driver by how strongly its realized level (across paths)
 * correlates with the buy-vs-rent outcome — computed entirely from the
 * Monte Carlo run that already happened, no extra simulation runs needed.
 * Sorted by |correlation| descending so the most decision-relevant driver
 * is first, exactly what a tornado chart wants.
 */
export function computeSensitivityTornado(
  driverSummaries: PathDriverSummary[],
  buy: Float64Array[],
  rent: Float64Array[],
): TornadoEntry[] {
  const months = buy[0]?.length ?? 0;
  const deltas = driverSummaries.map((_, p) => buy[p]![months - 1]! - rent[p]![months - 1]!);

  const drivers = Object.keys(DRIVER_LABELS) as (keyof PathDriverSummary)[];
  const entries: TornadoEntry[] = drivers.map((driver) => {
    const values = driverSummaries.map((d) => d[driver]);
    return { driver, label: DRIVER_LABELS[driver], correlation: spearmanCorrelation(values, deltas) };
  });

  return entries.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
}
