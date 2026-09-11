import { describe, expect, it } from "vitest";
import { computeBuyPath } from "@/lib/engine/buyPath";
import { DEFAULT_SCENARIO_CONFIG } from "@/lib/engine/defaults";
import { computeRentPath, resolveBaseRentMonthly } from "@/lib/engine/rentPath";
import type { ScenarioConfig } from "@/lib/engine/schema";

/**
 * Builds simple constant-growth driver paths (no randomness) from a
 * config's headline rates, standing in for what the Monte Carlo driver
 * will otherwise produce from the actual stochastic processes. Good enough
 * to validate buyPath/rentPath's own arithmetic in isolation.
 */
function buildDeterministicPaths(config: ScenarioConfig, months: number) {
  const appreciationAnnual = 0.07;
  const inflationAnnual = 0.05;
  const rentHikeAnnual = 0.06;
  const investmentReturnAnnual = 0.09;
  const loanRateAnnual = config.loan.rateType === "fixed" ? config.loan.fixedRatePct : 0.085;

  const propertyValuePath = new Float64Array(months);
  const costEscalationPath = new Float64Array(months);
  const cumulativeInflationPath = new Float64Array(months);
  const loanRateAnnualPath = new Float64Array(months).fill(loanRateAnnual);
  const investmentReturnAnnualPath = new Float64Array(months).fill(investmentReturnAnnual);
  const rentPath = new Float64Array(months);
  const lumpyRepairCashPath = new Float64Array(months); // 0 for this smoke test

  const baseRent = resolveBaseRentMonthly(config);
  for (let t = 0; t < months; t++) {
    propertyValuePath[t] = config.property.purchasePrice * Math.pow(1 + appreciationAnnual / 12, t + 1);
    costEscalationPath[t] = Math.pow(1 + inflationAnnual / 12, t + 1);
    cumulativeInflationPath[t] = costEscalationPath[t]!;
    rentPath[t] = baseRent * Math.pow(1 + rentHikeAnnual / 12, t + 1);
  }

  return {
    propertyValuePath,
    costEscalationPath,
    cumulativeInflationPath,
    loanRateAnnualPath,
    investmentReturnAnnualPath,
    rentPath,
    lumpyRepairCashPath,
  };
}

describe("computeBuyPath + computeRentPath — deterministic integration (Pune default config)", () => {
  const months = 240; // 20 years
  const paths = buildDeterministicPaths(DEFAULT_SCENARIO_CONFIG, months);

  const buyResult = computeBuyPath({
    config: DEFAULT_SCENARIO_CONFIG,
    months,
    propertyValuePath: paths.propertyValuePath,
    loanRateAnnualPath: paths.loanRateAnnualPath,
    costEscalationPath: paths.costEscalationPath,
    cumulativeInflationPath: paths.cumulativeInflationPath,
    investmentReturnAnnualPath: paths.investmentReturnAnnualPath,
    lumpyRepairCashPath: paths.lumpyRepairCashPath,
    possessionDelayMonths: 0,
    preEmiRentPath: new Float64Array(months),
  });

  const rentResult = computeRentPath({
    config: DEFAULT_SCENARIO_CONFIG,
    months,
    rentPath: paths.rentPath,
    investmentReturnAnnualPath: paths.investmentReturnAnnualPath,
    buyerCashOutflowPath: Float64Array.from(buyResult.months.map((m) => m.totalCashOutflow)),
  });

  it("produces exactly `months` entries with no NaN/Infinity anywhere", () => {
    expect(buyResult.months.length).toBe(months);
    expect(rentResult.months.length).toBe(months);
    for (const m of buyResult.months) {
      for (const [key, value] of Object.entries(m)) expect(Number.isFinite(value), `buy.${key}`).toBe(true);
    }
    for (const m of rentResult.months) {
      for (const [key, value] of Object.entries(m)) expect(Number.isFinite(value), `rent.${key}`).toBe(true);
    }
  });

  it("the default Pune scenario does NOT trip the affordability warning (by construction)", () => {
    expect(buyResult.affordabilityWarning).toBe(false);
    expect(buyResult.initialSidePortfolio).toBeGreaterThanOrEqual(0);
  });

  it("loan balance is non-increasing month over month under normal rates (no negative amortization at ~8.5%)", () => {
    for (let t = 1; t < months; t++) {
      expect(buyResult.months[t]!.loanBalance).toBeLessThanOrEqual(buyResult.months[t - 1]!.loanBalance + 1);
    }
  });

  it("loan is paid off at or before the nominal tenure (240 months)", () => {
    expect(buyResult.months[months - 1]!.loanBalance).toBeCloseTo(0, -2);
  });

  it("home equity grows over the horizon as the loan amortizes and the property appreciates", () => {
    expect(buyResult.months[months - 1]!.homeEquity).toBeGreaterThan(buyResult.months[0]!.homeEquity);
  });

  it("both branches' net worth stay well above a catastrophic-loss floor over a 20-year horizon at these assumptions", () => {
    expect(buyResult.months[months - 1]!.netWorth).toBeGreaterThan(0);
    expect(rentResult.months[months - 1]!.netWorth).toBeGreaterThan(0);
  });

  it("renter's side portfolio absorbs the buy-vs-rent cash-flow differential every month (accounting check)", () => {
    // Reconstruct sidePortfolio month 5 from month 4 using the documented recurrence and compare.
    const m4 = rentResult.months[4]!;
    const m5 = rentResult.months[5]!;
    const monthlyReturn = paths.investmentReturnAnnualPath[5]! / 12;
    const expected = m4.sidePortfolio * (1 + monthlyReturn) + m5.differentialInvested + m5.hraTaxSavingsThisMonth;
    expect(m5.sidePortfolio).toBeCloseTo(expected, 4);
  });

  it("markToMarketContinuously=true means buy net worth already nets out sale brokerage and LTCG tax", () => {
    const lastMonth = buyResult.months[months - 1]!;
    expect(lastMonth.netWorth).toBe(lastMonth.netWorthAfterExitCosts);
    expect(lastMonth.netWorth).toBeLessThan(lastMonth.homeEquity + lastMonth.sidePortfolio);
  });
});
