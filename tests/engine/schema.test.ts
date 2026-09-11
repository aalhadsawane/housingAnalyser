import { describe, expect, it } from "vitest";
import { createRng } from "@/lib/engine/rng";
import { DEFAULT_SCENARIO_CONFIG } from "@/lib/engine/defaults";
import { buildDistribution, buildProcess } from "@/lib/engine/factory";
import { scenarioConfigSchema } from "@/lib/engine/schema";

describe("scenarioConfigSchema + DEFAULT_SCENARIO_CONFIG (Pune preset)", () => {
  it("the shipped default config validates against the schema", () => {
    const parsed = scenarioConfigSchema.parse(DEFAULT_SCENARIO_CONFIG);
    expect(parsed.meta.liquidCapital).toBe(2_100_000);
    expect(parsed.property.purchasePrice).toBe(5_200_000);
  });

  it("total Day-0 outflow (down payment + closing + parking/corpus/interiors) fits inside stated liquid capital", () => {
    // PLAN.md section 2.2: "d·P0 + closing <= W0 (violation is flagged in
    // the UI, not silently allowed)". The shipped default must itself
    // satisfy that rule, including every Day-0 cash outflow, not just down
    // payment + statutory closing costs. It is allowed to be snug — this
    // buyer is meant to be fully leveraging their liquid capital, which is
    // realistic and is exactly what the affordability chart in PLAN.md
    // section 4 is for surfacing.
    const { property, meta } = DEFAULT_SCENARIO_CONFIG;
    const downPayment = property.downPaymentFraction * property.purchasePrice;
    const closing =
      property.stampDutyPct * property.purchasePrice +
      Math.min(property.registrationPct * property.purchasePrice, property.registrationCap ?? Infinity) +
      property.brokeragePct * property.purchasePrice +
      property.legalFeesFlat;
    const dayZeroOutflow =
      downPayment + closing + property.parkingCharges + property.societyCorpusDeposit + property.interiorsCapex;
    expect(dayZeroOutflow).toBeLessThan(meta.liquidCapital);
    expect(dayZeroOutflow).toBeGreaterThan(meta.liquidCapital * 0.85); // snug on purpose, not padded with slack
  });

  it("every process spec in the default config builds a working ProcessStrategy", () => {
    const rng = createRng(1);
    const processes = [
      DEFAULT_SCENARIO_CONFIG.loan.floatingRateProcess,
      DEFAULT_SCENARIO_CONFIG.carryingCosts.maintenanceEscalationProcess,
      DEFAULT_SCENARIO_CONFIG.rent.rentHikeProcess,
      DEFAULT_SCENARIO_CONFIG.investment.equityReturnProcess,
      DEFAULT_SCENARIO_CONFIG.investment.debtReturnProcess,
      DEFAULT_SCENARIO_CONFIG.macro.inflationProcess,
      DEFAULT_SCENARIO_CONFIG.macro.incomeGrowthProcess,
      DEFAULT_SCENARIO_CONFIG.macro.appreciationProcess,
    ];
    for (const spec of processes) {
      const proc = buildProcess(spec);
      const path = proc.simulatePath(1, 24, 1 / 12, rng);
      expect(path.length).toBe(24);
      for (const level of path) expect(Number.isFinite(level)).toBe(true);
    }
  });

  it("every one-off distribution spec in the default config builds a working DistributionStrategy", () => {
    const rng = createRng(2);
    const specs = [
      DEFAULT_SCENARIO_CONFIG.property.possessionDelayMonths,
      DEFAULT_SCENARIO_CONFIG.carryingCosts.lumpyRepairSeverity,
      DEFAULT_SCENARIO_CONFIG.exit.timeToSellMonths,
      DEFAULT_SCENARIO_CONFIG.lifeEvents.jobLossDurationMonths,
    ];
    for (const spec of specs) {
      const dist = buildDistribution(spec);
      for (let i = 0; i < 100; i++) expect(Number.isFinite(dist.sample(rng))).toBe(true);
    }
  });

  it("correlationMatrix is square and matches correlationDriverOrder length", () => {
    const { correlationMatrix, correlationDriverOrder } = DEFAULT_SCENARIO_CONFIG.macro;
    expect(correlationMatrix.length).toBe(correlationDriverOrder.length);
    for (const row of correlationMatrix) expect(row.length).toBe(correlationDriverOrder.length);
  });
});
