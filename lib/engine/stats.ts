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

export function computeDecisionSummary(buy: Float64Array[], rent: Float64Array[]): DecisionSummary {
  const n = buy.length;
  const months = buy[0]?.length ?? 0;

  const buyFinals: number[] = new Array(n);
  const rentFinals: number[] = new Array(n);
  const deltas: number[] = new Array(n);
  const breakevenMonths: number[] = [];
  let neverCrosses = 0;

  for (let p = 0; p < n; p++) {
    const buyPath = buy[p]!;
    const rentPath = rent[p]!;
    const buyFinal = buyPath[months - 1]!;
    const rentFinal = rentPath[months - 1]!;
    buyFinals[p] = buyFinal;
    rentFinals[p] = rentFinal;
    deltas[p] = buyFinal - rentFinal;

    let crossedAt: number | null = null;
    for (let t = 0; t < months; t++) {
      if (buyPath[t]! >= rentPath[t]!) {
        crossedAt = t;
        break;
      }
    }
    if (crossedAt === null) neverCrosses += 1;
    else breakevenMonths.push(crossedAt);
  }

  const sortedDeltas = [...deltas].sort((a, b) => a - b);
  const sortedBuyFinals = [...buyFinals].sort((a, b) => a - b);
  const sortedRentFinals = [...rentFinals].sort((a, b) => a - b);
  const sortedBreakevens = [...breakevenMonths].sort((a, b) => a - b);

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
