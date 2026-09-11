import { describe, expect, it } from "vitest";
import {
  computeAdvantageDecomposition,
  computeBreakevenMonths,
  computeDecisionSummary,
  computeDeltaHistogramAtMonth,
  computeFanBands,
  computeSensitivityTornado,
  computeWinProbabilityByMonth,
  percentileOfSorted,
  spearmanCorrelation,
} from "@/lib/engine/stats";

describe("percentileOfSorted", () => {
  it("matches simple hand-checkable cases", () => {
    const sorted = [1, 2, 3, 4, 5];
    expect(percentileOfSorted(sorted, 0)).toBe(1);
    expect(percentileOfSorted(sorted, 1)).toBe(5);
    expect(percentileOfSorted(sorted, 0.5)).toBe(3);
  });
});

describe("computeFanBands", () => {
  it("median band equals the true per-month median across a known set of paths", () => {
    // 5 paths, values at month 0 are 10,20,30,40,50 -> median 30
    const paths = [
      Float64Array.from([10, 100]),
      Float64Array.from([20, 100]),
      Float64Array.from([30, 100]),
      Float64Array.from([40, 100]),
      Float64Array.from([50, 100]),
    ];
    const bands = computeFanBands(paths);
    expect(bands[0]!.median).toBe(30);
    // linear-interpolation percentile: idx = 0.05*(5-1) = 0.2 -> 10 + 0.2*(20-10) = 12
    expect(bands[0]!.p5).toBeCloseTo(12, 6);
    expect(bands[1]!.median).toBe(100);
  });

  it("band ordering holds: p5 <= p25 <= median <= p75 <= p95", () => {
    const paths = Array.from({ length: 50 }, (_, i) => Float64Array.from([Math.sin(i) * 1000 + i * 10]));
    const bands = computeFanBands(paths);
    const b = bands[0]!;
    expect(b.p5).toBeLessThanOrEqual(b.p25);
    expect(b.p25).toBeLessThanOrEqual(b.median);
    expect(b.median).toBeLessThanOrEqual(b.p75);
    expect(b.p75).toBeLessThanOrEqual(b.p95);
  });
});

describe("computeDecisionSummary", () => {
  it("100% buy-win scenario: probBuyWins=1, no breakeven-never paths if buy always exceeds rent from month 0", () => {
    const buy = Array.from({ length: 10 }, () => Float64Array.from([100, 200, 300]));
    const rent = Array.from({ length: 10 }, () => Float64Array.from([50, 100, 150]));
    const summary = computeDecisionSummary(buy, rent);
    expect(summary.probBuyWins).toBe(1);
    expect(summary.breakevenNeverShare).toBe(0);
    expect(summary.breakevenMonthMedian).toBe(0);
    expect(summary.medianDelta).toBeCloseTo(150, 6);
  });

  it("buy never catches up: breakevenNeverShare=1, probBuyWins=0", () => {
    const buy = Array.from({ length: 10 }, () => Float64Array.from([10, 20, 30]));
    const rent = Array.from({ length: 10 }, () => Float64Array.from([100, 200, 300]));
    const summary = computeDecisionSummary(buy, rent);
    expect(summary.probBuyWins).toBe(0);
    expect(summary.breakevenNeverShare).toBe(1);
    expect(summary.breakevenMonthMedian).toBeNull();
  });

  it("CVaR5 correctly averages only the worst 5% tail, not the whole distribution", () => {
    // 100 buy paths with distinct final values 1..100; worst 5% = 1..5, mean = 3
    const buy = Array.from({ length: 100 }, (_, i) => Float64Array.from([i + 1]));
    const rent = Array.from({ length: 100 }, () => Float64Array.from([0]));
    const summary = computeDecisionSummary(buy, rent);
    expect(summary.cvar5Buy).toBeCloseTo(3, 6);
  });

  it("50/50 split gives probBuyWins around 0.5", () => {
    const n = 200;
    const buy = Array.from({ length: n }, (_, i) => Float64Array.from([i < n / 2 ? 100 : 0]));
    const rent = Array.from({ length: n }, () => Float64Array.from([50]));
    const summary = computeDecisionSummary(buy, rent);
    expect(summary.probBuyWins).toBeCloseTo(0.5, 1);
  });
});

describe("spearmanCorrelation", () => {
  it("is 1 for a perfectly monotonic relationship", () => {
    const x = [1, 2, 3, 4, 5];
    const y = [10, 20, 30, 40, 50];
    expect(spearmanCorrelation(x, y)).toBeCloseTo(1, 6);
  });
  it("is -1 for a perfectly inverse relationship", () => {
    const x = [1, 2, 3, 4, 5];
    const y = [50, 40, 30, 20, 10];
    expect(spearmanCorrelation(x, y)).toBeCloseTo(-1, 6);
  });
  it("is close to 0 for unrelated data", () => {
    const x = [1, 5, 2, 4, 3, 8, 6, 7];
    const y = [4, 2, 8, 1, 7, 3, 5, 6];
    expect(Math.abs(spearmanCorrelation(x, y))).toBeLessThan(0.6);
  });
});

describe("computeBreakevenMonths", () => {
  it("returns the first crossing month per path, null when it never crosses", () => {
    const buy = [Float64Array.from([1, 2, 3, 4]), Float64Array.from([10, 10, 10, 10])];
    const rent = [Float64Array.from([5, 1, 1, 1]), Float64Array.from([20, 20, 20, 20])];
    const result = computeBreakevenMonths(buy, rent);
    expect(result[0]).toBe(1); // buy(2) >= rent(1) first at month 1
    expect(result[1]).toBeNull(); // buy never reaches rent
  });
});

describe("computeWinProbabilityByMonth", () => {
  it("is 1.0 at a month where buy always exceeds rent, 0.0 where it never does", () => {
    const buy = Array.from({ length: 10 }, () => Float64Array.from([100, 5]));
    const rent = Array.from({ length: 10 }, () => Float64Array.from([50, 100]));
    const prob = computeWinProbabilityByMonth(buy, rent);
    expect(prob[0]).toBe(1);
    expect(prob[1]).toBe(0);
  });
  it("matches a hand-countable 50/50 case exactly", () => {
    const buy = [Float64Array.from([10]), Float64Array.from([10]), Float64Array.from([0]), Float64Array.from([0])];
    const rent = [Float64Array.from([5]), Float64Array.from([5]), Float64Array.from([5]), Float64Array.from([5])];
    const prob = computeWinProbabilityByMonth(buy, rent);
    expect(prob[0]).toBe(0.5);
  });
});

describe("computeDeltaHistogramAtMonth", () => {
  it("bins sum to the total path count and p50 matches the true median", () => {
    const n = 200;
    const buy = Array.from({ length: n }, (_, i) => Float64Array.from([i]));
    const rent = Array.from({ length: n }, () => Float64Array.from([0]));
    const hist = computeDeltaHistogramAtMonth(buy, rent, 0, 10);
    const totalCount = hist.bins.reduce((a, b) => a + b.count, 0);
    expect(totalCount).toBe(n);
    expect(hist.median).toBeCloseTo(99.5, 0);
    expect(hist.probBuyWins).toBeCloseTo(199 / 200, 3); // delta=0 for path i=0 doesn't count as a win (d>0 strictly)
  });
});

describe("computeAdvantageDecomposition", () => {
  it("averages each field and the reconstructed totals match the averaged final net worths exactly", () => {
    const buyDecomps = [
      { downPayment: 100, propertyAppreciationGain: 50, principalRepaid: 20, initialSidePortfolio: 10, taxSavingsContributed: 5, investmentGrowth: 3, exitCosts: 8 },
      { downPayment: 100, propertyAppreciationGain: 70, principalRepaid: 20, initialSidePortfolio: 10, taxSavingsContributed: 5, investmentGrowth: 7, exitCosts: 8 },
    ];
    const rentDecomps = [
      { initialSidePortfolio: 90, differentialContributed: 30, hraTaxSavingsContributed: 2, depositCashFlowContributed: 0, investmentGrowth: 10, finalDepositHeld: 5 },
      { initialSidePortfolio: 90, differentialContributed: 40, hraTaxSavingsContributed: 2, depositCashFlowContributed: 0, investmentGrowth: 20, finalDepositHeld: 5 },
    ];
    const result = computeAdvantageDecomposition(buyDecomps, rentDecomps);
    expect(result.buy.propertyAppreciationGain).toBeCloseTo(60, 6); // avg(50,70)
    expect(result.rent.differentialContributed).toBeCloseTo(35, 6); // avg(30,40)

    const expectedBuyTotal =
      result.buy.downPayment +
      result.buy.propertyAppreciationGain +
      result.buy.principalRepaid +
      result.buy.initialSidePortfolio +
      result.buy.taxSavingsContributed +
      result.buy.investmentGrowth -
      result.buy.exitCosts;
    expect(result.buyFinalNetWorth).toBeCloseTo(expectedBuyTotal, 6);
  });
});

describe("computeSensitivityTornado", () => {
  it("ranks a driver that's perfectly rank-correlated with the outcome first, with the correct sign", () => {
    const driverSummaries = Array.from({ length: 50 }, (_, i) => ({
      appreciationRealized: i / 50, // perfectly increasing -> should correlate strongly positive with delta
      equityReturnRealized: Math.random() * 0.01, // near-constant noise -> weak correlation
      debtReturnRealized: 0.05,
      inflationRealized: 0.05,
      rentGrowthRealized: -(i / 50), // perfectly decreasing -> should correlate strongly negative
      repoRateRealized: 0.08,
      incomeGrowthRealized: 0.06,
    }));
    const buy = driverSummaries.map((_, i) => Float64Array.from([i]));
    const rent = driverSummaries.map(() => Float64Array.from([25]));
    const tornado = computeSensitivityTornado(driverSummaries, buy, rent);
    expect(tornado[0]!.driver).toBe("appreciationRealized");
    expect(tornado[0]!.correlation).toBeGreaterThan(0.9);
    const rentGrowthEntry = tornado.find((t) => t.driver === "rentGrowthRealized")!;
    expect(rentGrowthEntry.correlation).toBeLessThan(-0.9);
  });
});
