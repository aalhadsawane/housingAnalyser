import { describe, expect, it } from "vitest";
import { computeEmi, simulateAmortizationSchedule } from "@/lib/engine/amortization";

describe("computeEmi", () => {
  it("matches the standard closed-form EMI formula (hand-computed example)", () => {
    // Principal 50L, 8.5% annual, 240 months (20y) -> known EMI ~= 43,391 (standard EMI calculator cross-check)
    const emi = computeEmi(5_000_000, 0.085, 240);
    expect(emi).toBeCloseTo(43391, 0);
  });
  it("zero-interest loan is a plain equal split", () => {
    expect(computeEmi(1_200_000, 0, 12)).toBeCloseTo(100_000, 6);
  });
});

describe("simulateAmortizationSchedule — fixed rate, tenureReset", () => {
  const principal = 5_000_000;
  const annualRate = 0.085;
  const tenureMonths = 240;
  const ratePath = new Float64Array(tenureMonths).fill(annualRate);
  const schedule = simulateAmortizationSchedule({
    principal,
    originalAnnualRatePct: annualRate,
    tenureMonths,
    ratePathAnnualPct: ratePath,
    resetPolicy: "tenureReset",
    totalMonths: tenureMonths,
  });

  it("balance reaches (approximately) zero exactly at the nominal tenure", () => {
    expect(schedule[schedule.length - 1]!.closingBalance).toBeCloseTo(0, 0);
  });
  it("EMI is constant throughout (tenureReset policy)", () => {
    const emis = new Set(schedule.map((m) => Math.round(m.emi)));
    expect(emis.size).toBe(1);
  });
  it("total principal paid across the schedule reconstructs the original principal", () => {
    const totalPrincipal = schedule.reduce((a, m) => a + m.principalPaid, 0);
    expect(totalPrincipal).toBeCloseTo(principal, 0);
  });
  it("interest + principal = EMI every month (accounting identity)", () => {
    for (const m of schedule) {
      if (m.emi === 0) continue;
      expect(m.interestPaid + m.principalPaid).toBeCloseTo(m.emi, 6);
    }
  });
});

describe("simulateAmortizationSchedule — floating rate", () => {
  const principal = 5_000_000;
  const originalRate = 0.085;
  const tenureMonths = 240;

  it("tenureReset: a permanent rate rise leaves a positive balance at the original nominal tenure (payoff pushed out)", () => {
    const ratePath = new Float64Array(tenureMonths).fill(0.12); // rate jumps to 12% from month 0
    const schedule = simulateAmortizationSchedule({
      principal,
      originalAnnualRatePct: originalRate,
      tenureMonths,
      ratePathAnnualPct: ratePath,
      resetPolicy: "tenureReset",
      totalMonths: tenureMonths,
    });
    // EMI was sized for 8.5%; at a permanent 12% the loan should NOT be paid off by month 240.
    expect(schedule[schedule.length - 1]!.closingBalance).toBeGreaterThan(0);
  });

  it("emiReset: EMI recalculates so the balance still reaches ~zero at the nominal tenure despite a rate rise", () => {
    const ratePath = new Float64Array(tenureMonths).fill(0.12);
    const schedule = simulateAmortizationSchedule({
      principal,
      originalAnnualRatePct: originalRate,
      tenureMonths,
      ratePathAnnualPct: ratePath,
      resetPolicy: "emiReset",
      totalMonths: tenureMonths,
    });
    expect(schedule[schedule.length - 1]!.closingBalance).toBeCloseTo(0, 0);
    // EMI should have jumped up from the original-rate EMI once the higher rate applies.
    expect(schedule[1]!.emi).toBeGreaterThan(schedule[0]!.emi * 0.99);
    expect(schedule[5]!.emi).toBeGreaterThan(computeEmi(principal, originalRate, tenureMonths));
  });
});

describe("simulateAmortizationSchedule — prepayment", () => {
  it("a lump-sum prepayment reduces the balance faster than the no-prepayment schedule at the same month", () => {
    const principal = 5_000_000;
    const rate = 0.085;
    const tenureMonths = 240;
    const ratePath = new Float64Array(tenureMonths).fill(rate);

    const withoutPrepay = simulateAmortizationSchedule({
      principal,
      originalAnnualRatePct: rate,
      tenureMonths,
      ratePathAnnualPct: ratePath,
      resetPolicy: "tenureReset",
      totalMonths: 60,
    });
    const withPrepay = simulateAmortizationSchedule({
      principal,
      originalAnnualRatePct: rate,
      tenureMonths,
      ratePathAnnualPct: ratePath,
      resetPolicy: "tenureReset",
      totalMonths: 60,
      prepaymentForMonth: (month) => (month === 12 ? 500_000 : 0),
    });
    expect(withPrepay[59]!.closingBalance).toBeLessThan(withoutPrepay[59]!.closingBalance - 400_000);
  });
});
