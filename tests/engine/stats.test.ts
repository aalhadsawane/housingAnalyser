import { describe, expect, it } from "vitest";
import { computeDecisionSummary, computeFanBands, percentileOfSorted, spearmanCorrelation } from "@/lib/engine/stats";

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
