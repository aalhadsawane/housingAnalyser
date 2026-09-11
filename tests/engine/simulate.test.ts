import { describe, expect, it } from "vitest";
import { DEFAULT_SCENARIO_CONFIG } from "@/lib/engine/defaults";
import type { ScenarioConfig } from "@/lib/engine/schema";
import { runSimulation } from "@/lib/engine/simulate";

function smallConfig(overrides: Partial<ScenarioConfig["meta"]> = {}): ScenarioConfig {
  return {
    ...DEFAULT_SCENARIO_CONFIG,
    meta: { ...DEFAULT_SCENARIO_CONFIG.meta, horizonYears: 5, numPaths: 300, ...overrides },
  };
}

describe("runSimulation — shape and finiteness", () => {
  const config = smallConfig();
  const result = runSimulation(config);

  it("produces numPaths x months arrays for both branches", () => {
    expect(result.numPaths).toBe(300);
    expect(result.months).toBe(60);
    expect(result.buyNetWorth.length).toBe(300);
    expect(result.rentNetWorth.length).toBe(300);
    for (const path of result.buyNetWorth) expect(path.length).toBe(60);
    for (const path of result.rentNetWorth) expect(path.length).toBe(60);
  });

  it("every value is finite (no NaN/Infinity leaking from any process or distribution)", () => {
    for (const path of [...result.buyNetWorth, ...result.rentNetWorth]) {
      for (const v of path) expect(Number.isFinite(v)).toBe(true);
    }
  });

  it("produces one decomposition and one driver summary per path, every field finite", () => {
    expect(result.buyDecompositions.length).toBe(300);
    expect(result.rentDecompositions.length).toBe(300);
    expect(result.driverSummaries.length).toBe(300);
    for (const d of result.buyDecompositions) {
      for (const v of Object.values(d)) expect(Number.isFinite(v)).toBe(true);
    }
    for (const d of result.rentDecompositions) {
      for (const v of Object.values(d)) expect(Number.isFinite(v)).toBe(true);
    }
    for (const d of result.driverSummaries) {
      for (const v of Object.values(d)) expect(Number.isFinite(v)).toBe(true);
    }
  });

  it("each path's buy decomposition sums to that path's own final buy net worth (accounting identity holds per-path, not just in aggregate)", () => {
    for (let p = 0; p < result.numPaths; p++) {
      const d = result.buyDecompositions[p]!;
      const reconstructed =
        d.downPayment +
        d.propertyAppreciationGain +
        d.principalRepaid +
        d.initialSidePortfolio +
        d.taxSavingsContributed +
        d.investmentGrowth -
        d.exitCosts;
      expect(reconstructed).toBeCloseTo(result.buyNetWorth[p]![result.months - 1]!, 2);
    }
  });

  it("realized driver summaries are centered near each driver's configured long-run level across many paths", () => {
    const meanOf = (key: keyof (typeof result.driverSummaries)[number]) =>
      result.driverSummaries.reduce((a, d) => a + d[key], 0) / result.driverSummaries.length;
    // Pune default: appreciation mu=0.07, equity mu=0.11, inflation theta=0.05
    expect(meanOf("appreciationRealized")).toBeGreaterThan(0.03);
    expect(meanOf("appreciationRealized")).toBeLessThan(0.11);
    expect(meanOf("equityReturnRealized")).toBeGreaterThan(0.06);
    expect(meanOf("equityReturnRealized")).toBeLessThan(0.16);
  });
});

describe("runSimulation — reproducibility", () => {
  it("the same seed produces bit-identical results across two independent runs", () => {
    const config = smallConfig({ seed: 999 });
    const a = runSimulation(config);
    const b = runSimulation(config);
    for (let p = 0; p < a.numPaths; p++) {
      expect(a.buyNetWorth[p]).toEqual(b.buyNetWorth[p]);
      expect(a.rentNetWorth[p]).toEqual(b.rentNetWorth[p]);
    }
  });

  it("a different seed produces different results", () => {
    const a = runSimulation(smallConfig({ seed: 1 }));
    const b = runSimulation(smallConfig({ seed: 2 }));
    expect(a.buyNetWorth[0]).not.toEqual(b.buyNetWorth[0]);
  });
});

describe("runSimulation — randomness actually flows through the whole pipeline", () => {
  it("terminal net worth has non-trivial spread across paths (not silently collapsed to one deterministic value)", () => {
    const result = runSimulation(smallConfig({ numPaths: 500 }));
    const finalBuy = result.buyNetWorth.map((p) => p[p.length - 1]!);
    const mean = finalBuy.reduce((a, b) => a + b, 0) / finalBuy.length;
    const sd = Math.sqrt(finalBuy.reduce((a, b) => a + (b - mean) ** 2, 0) / finalBuy.length);
    expect(sd).toBeGreaterThan(0);
    expect(sd / Math.abs(mean)).toBeGreaterThan(0.02); // meaningfully dispersed, not just floating-point noise
  });

  it("different paths take different property-appreciation/rate/rent trajectories (spot check via distinct buy cash outflow totals)", () => {
    const result = runSimulation(smallConfig({ numPaths: 20 }));
    const totals = result.buyNetWorth.map((p) => p[p.length - 1]!);
    const uniqueValues = new Set(totals.map((v) => v.toFixed(2)));
    expect(uniqueValues.size).toBeGreaterThan(15); // most paths should be distinguishable
  });
});

describe("runSimulation — progress callback", () => {
  it("fires once per path with a monotonically increasing count", () => {
    const config = smallConfig({ numPaths: 50 });
    const calls: number[] = [];
    runSimulation(config, { onProgress: (done) => calls.push(done) });
    expect(calls).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
  });
});

describe("runSimulation — performance", () => {
  it("completes a production-scale run (5000 paths x 240 months) in well under a minute", () => {
    const config: ScenarioConfig = {
      ...DEFAULT_SCENARIO_CONFIG,
      meta: { ...DEFAULT_SCENARIO_CONFIG.meta, horizonYears: 20, numPaths: 5000 },
    };
    const start = performance.now();
    const result = runSimulation(config);
    const elapsedMs = performance.now() - start;
    expect(result.numPaths).toBe(5000);
    expect(result.months).toBe(240);
    // Generous bound: this is a correctness/regression guard against an
    // accidental O(n^2) or similar, not a tight perf assertion — actual
    // wall-clock will vary by machine.
    expect(elapsedMs).toBeLessThan(60_000);
    console.log(`5000 paths x 240 months: ${elapsedMs.toFixed(0)}ms (${(elapsedMs / 5000).toFixed(2)}ms/path)`);
  }, 90_000);
});
