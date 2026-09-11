import { describe, expect, it } from "vitest";
import {
  computeEquityGainsTax,
  computeHraExemptionMonthly,
  computeIncomeTax,
  computePropertyLtcgTax,
  computeSection24bDeduction,
  computeSection80cDeduction,
  computeSlabTax,
} from "@/lib/engine/tax/india";
import { NEW_REGIME_SLABS, OLD_REGIME_SLABS } from "@/lib/engine/tax/india.rules";

describe("computeIncomeTax — old regime (hand-worked examples)", () => {
  it("taxable income 15,00,000: slab tax 2,62,500 + 4% cess = 2,73,000", () => {
    // gross 15,50,000 - 50,000 standard deduction = 15,00,000 taxable
    // 0-2.5L: 0; 2.5-5L @5% = 12,500; 5-10L @20% = 1,00,000; 10-15L @30% = 1,50,000 => 2,62,500
    const tax = computeIncomeTax({ regime: "old", grossIncome: 15_50_000 });
    expect(tax).toBeCloseTo(2_73_000, 0);
  });
  it("itemized deductions (24b + 80C) reduce taxable income before slabs apply", () => {
    const withoutDeductions = computeIncomeTax({ regime: "old", grossIncome: 15_50_000 });
    const withDeductions = computeIncomeTax({
      regime: "old",
      grossIncome: 15_50_000,
      oldRegimeItemizedDeductions: 200_000 + 150_000, // full 24(b) + 80C caps
    });
    expect(withDeductions).toBeLessThan(withoutDeductions);
    // Taxable income drops to 15,50,000 - 50,000 - 3,50,000 = 11,50,000:
    // 2.5-5L@5%=12,500; 5-10L@20%=1,00,000; 10-11.5L@30%=45,000 => 1,57,500 * 1.04
    expect(withDeductions).toBeCloseTo(157_500 * 1.04, 0);
  });
});

describe("computeIncomeTax — new regime (FY2025-26 slabs, hand-worked example)", () => {
  it("taxable income 15,00,000: slab tax 1,05,000 + 4% cess = 1,09,200", () => {
    // gross 15,75,000 - 75,000 standard deduction = 15,00,000 taxable
    // 0-4L:0; 4-8L@5%=20,000; 8-12L@10%=40,000; 12-15L(within 12-16L bracket)@15%=45,000 => 1,05,000
    const tax = computeIncomeTax({ regime: "new", grossIncome: 15_75_000 });
    expect(tax).toBeCloseTo(1_09_200, 0);
  });
  it("Section 87A rebate zeroes tax at/under the 12L taxable-income threshold", () => {
    // gross 12,75,000 - 75,000 = 12,00,000 taxable, exactly at the rebate threshold
    expect(computeIncomeTax({ regime: "new", grossIncome: 12_75_000 })).toBe(0);
    // one rupee over the threshold owes tax on the whole slab computation (no marginal relief modelled)
    expect(computeIncomeTax({ regime: "new", grossIncome: 12_75_001 })).toBeGreaterThan(0);
  });
});

describe("computeSlabTax generic bracket engine", () => {
  it("zero income owes zero tax", () => {
    expect(computeSlabTax(0, OLD_REGIME_SLABS)).toBe(0);
    expect(computeSlabTax(0, NEW_REGIME_SLABS)).toBe(0);
  });
});

describe("Section 24(b) and Section 80C", () => {
  it("24(b) caps at 2,00,000 and is old-regime only", () => {
    expect(computeSection24bDeduction("old", 350_000)).toBe(200_000);
    expect(computeSection24bDeduction("old", 120_000)).toBe(120_000);
    expect(computeSection24bDeduction("new", 350_000)).toBe(0);
  });
  it("80C respects headroom already used elsewhere and is old-regime only", () => {
    expect(computeSection80cDeduction("old", 200_000, 100_000)).toBe(50_000); // only 50k headroom left of 1.5L cap
    expect(computeSection80cDeduction("old", 200_000, 0)).toBe(150_000);
    expect(computeSection80cDeduction("new", 200_000, 0)).toBe(0);
  });
});

describe("HRA exemption", () => {
  it("matches the textbook min(received, rent - 10% basic, 50%/40% basic) formula", () => {
    // basic 60,000/mo, HRA received 30,000/mo, rent paid 35,000/mo, metro
    const exemption = computeHraExemptionMonthly({
      regime: "old",
      basicPlusDaMonthly: 60_000,
      hraReceivedMonthly: 30_000,
      rentPaidMonthly: 35_000,
      isMetro: true,
    });
    // received=30,000; rent-10%basic=35,000-6,000=29,000; 50%basic=30,000 -> min=29,000
    expect(exemption).toBeCloseTo(29_000, 0);
  });
  it("is zero under the new regime", () => {
    expect(
      computeHraExemptionMonthly({
        regime: "new",
        basicPlusDaMonthly: 60_000,
        hraReceivedMonthly: 30_000,
        rentPaidMonthly: 35_000,
        isMetro: true,
      }),
    ).toBe(0);
  });
  it("non-metro uses the 40% cap instead of 50%", () => {
    const exemption = computeHraExemptionMonthly({
      regime: "old",
      basicPlusDaMonthly: 60_000,
      hraReceivedMonthly: 40_000,
      rentPaidMonthly: 50_000,
      isMetro: false,
    });
    // received=40,000; rent-10%basic=50,000-6,000=44,000; 40%basic=24,000 -> min=24,000
    expect(exemption).toBeCloseTo(24_000, 0);
  });
});

describe("Property LTCG", () => {
  it("no-indexation path: flat 12.5% on nominal gain", () => {
    const result = computePropertyLtcgTax({
      saleProceeds: 10_000_000,
      acquisitionCostIncludingImprovements: 6_000_000,
      cumulativeInflationMultiplier: 1.5,
      holdingMonths: 120,
      electIndexation: false,
    });
    expect(result.taxableGain).toBeCloseTo(4_000_000, 0);
    expect(result.tax).toBeCloseTo(500_000, 0);
    expect(result.indexationApplied).toBe(false);
  });
  it("when indexation would produce a lower tax, the election picks it", () => {
    const result = computePropertyLtcgTax({
      saleProceeds: 10_000_000,
      acquisitionCostIncludingImprovements: 6_000_000,
      cumulativeInflationMultiplier: 1.5, // indexed cost = 9,000,000 -> gain 1,000,000 @ 20% = 200,000, vs 500,000 flat
      holdingMonths: 120,
      electIndexation: true,
    });
    expect(result.indexationApplied).toBe(true);
    expect(result.tax).toBeCloseTo(200_000, 0);
  });
  it("when indexation would produce a higher tax, it is NOT applied even if elected (transitional rule: lower of the two)", () => {
    // Low realized inflation (2% cumulative) barely shrinks the indexed gain,
    // so the 20% indexed rate loses to the 12.5% flat rate on the larger
    // nominal gain: indexed tax 3,880,000*0.20=776,000 vs flat 4,000,000*0.125=500,000.
    const result = computePropertyLtcgTax({
      saleProceeds: 10_000_000,
      acquisitionCostIncludingImprovements: 6_000_000,
      cumulativeInflationMultiplier: 1.02,
      holdingMonths: 30,
      electIndexation: true,
    });
    expect(result.indexationApplied).toBe(false);
    expect(result.tax).toBeCloseTo(500_000, 0);
  });
});

describe("Equity capital gains", () => {
  it("LTCG uses the annual exemption then 12.5%", () => {
    const result = computeEquityGainsTax({ gain: 300_000, isLongTerm: true, exemptionAlreadyUsedThisYear: 0 });
    expect(result.exemptionUsed).toBeCloseTo(125_000, 0);
    expect(result.tax).toBeCloseTo((300_000 - 125_000) * 0.125, 0);
  });
  it("STCG has no exemption and is taxed at 20%", () => {
    const result = computeEquityGainsTax({ gain: 300_000, isLongTerm: false, exemptionAlreadyUsedThisYear: 0 });
    expect(result.exemptionUsed).toBe(0);
    expect(result.tax).toBeCloseTo(60_000, 0);
  });
  it("exemption already used elsewhere this year reduces remaining headroom", () => {
    const result = computeEquityGainsTax({ gain: 100_000, isLongTerm: true, exemptionAlreadyUsedThisYear: 100_000 });
    expect(result.exemptionUsed).toBeCloseTo(25_000, 0);
    expect(result.tax).toBeCloseTo(75_000 * 0.125, 0);
  });
});
