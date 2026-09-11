import {
  CESS_PCT,
  EQUITY_LTCG_EXEMPTION_ANNUAL,
  EQUITY_LTCG_RATE_PCT,
  EQUITY_STCG_RATE_PCT,
  HRA_METRO_PCT_OF_BASIC,
  HRA_NON_METRO_PCT_OF_BASIC,
  HRA_RENT_EXCESS_OVER_BASIC_PCT,
  NEW_REGIME_87A_REBATE_THRESHOLD,
  NEW_REGIME_SLABS,
  NEW_REGIME_STANDARD_DEDUCTION,
  OLD_REGIME_SLABS,
  OLD_REGIME_STANDARD_DEDUCTION,
  PROPERTY_LTCG_RATE_PCT_NO_INDEXATION,
  PROPERTY_LTCG_RATE_PCT_WITH_INDEXATION,
  SECTION_24B_SELF_OCCUPIED_CAP,
  SECTION_80C_CAP,
  type TaxBracket,
} from "./india.rules";

export type TaxRegime = "old" | "new";

/** Progressive slab tax on a non-negative taxable income, plus cess. Pure bracket arithmetic — no regime-specific rebate here (see computeIncomeTax for the new-regime Section 87A rebate). */
export function computeSlabTax(taxableIncome: number, brackets: TaxBracket[]): number {
  if (taxableIncome <= 0) return 0;
  let tax = 0;
  let lowerBound = 0;
  for (const bracket of brackets) {
    if (taxableIncome <= lowerBound) break;
    const taxableInThisBracket = Math.min(taxableIncome, bracket.upTo) - lowerBound;
    tax += Math.max(0, taxableInThisBracket) * bracket.ratePct;
    lowerBound = bracket.upTo;
  }
  return tax;
}

export interface IncomeTaxInputs {
  regime: TaxRegime;
  grossIncome: number;
  /** Old regime only: Section 24(b) home-loan interest (already capped) + Section 80C (already capped) + any other itemized deductions the user wants to include. Ignored under the new regime. */
  oldRegimeItemizedDeductions?: number;
}

export function computeIncomeTax(inputs: IncomeTaxInputs): number {
  const { regime, grossIncome } = inputs;
  if (regime === "old") {
    const taxableIncome = Math.max(
      0,
      grossIncome - OLD_REGIME_STANDARD_DEDUCTION - (inputs.oldRegimeItemizedDeductions ?? 0),
    );
    const tax = computeSlabTax(taxableIncome, OLD_REGIME_SLABS);
    return tax * (1 + CESS_PCT);
  }
  const taxableIncome = Math.max(0, grossIncome - NEW_REGIME_STANDARD_DEDUCTION);
  if (taxableIncome <= NEW_REGIME_87A_REBATE_THRESHOLD) return 0; // Section 87A rebate
  const tax = computeSlabTax(taxableIncome, NEW_REGIME_SLABS);
  return tax * (1 + CESS_PCT);
}

/** Section 24(b): self-occupied home-loan interest deduction, old regime only, capped annually. */
export function computeSection24bDeduction(regime: TaxRegime, interestPaidThisYear: number): number {
  if (regime !== "old") return 0;
  return Math.min(Math.max(interestPaidThisYear, 0), SECTION_24B_SELF_OCCUPIED_CAP);
}

/** Section 80C: principal repayment (+ stamp duty/registration in the year of purchase, + anything else competing for the same cap), old regime only, net of headroom already consumed elsewhere (EPF/ELSS/...). */
export function computeSection80cDeduction(
  regime: TaxRegime,
  eligibleAmountThisYear: number,
  existingUsageThisYear: number,
): number {
  if (regime !== "old") return 0;
  const remainingCap = Math.max(0, SECTION_80C_CAP - existingUsageThisYear);
  return Math.min(Math.max(eligibleAmountThisYear, 0), remainingCap);
}

export interface HraExemptionInputs {
  regime: TaxRegime;
  basicPlusDaMonthly: number;
  hraReceivedMonthly: number;
  rentPaidMonthly: number;
  isMetro: boolean;
}

/** HRA exemption (old regime only): min(HRA received, rent - 10% of basic, 50%/40% of basic). Returns the *monthly* exempt amount. */
export function computeHraExemptionMonthly(inputs: HraExemptionInputs): number {
  if (inputs.regime !== "old") return 0;
  const { basicPlusDaMonthly, hraReceivedMonthly, rentPaidMonthly, isMetro } = inputs;
  const rentExcess = Math.max(0, rentPaidMonthly - HRA_RENT_EXCESS_OVER_BASIC_PCT * basicPlusDaMonthly);
  const pctCap = (isMetro ? HRA_METRO_PCT_OF_BASIC : HRA_NON_METRO_PCT_OF_BASIC) * basicPlusDaMonthly;
  return Math.max(0, Math.min(hraReceivedMonthly, rentExcess, pctCap));
}

export interface PropertyLtcgInputs {
  saleProceeds: number;
  acquisitionCostIncludingImprovements: number;
  /** Cumulative inflation multiplier realized between purchase and sale (e.g. 1.8 if prices roughly rose 80% cumulatively), used as a CII-indexation proxy — an explicitly documented approximation, not the official Cost Inflation Index lookup table. */
  cumulativeInflationMultiplier: number;
  holdingMonths: number;
  electIndexation: boolean; // only meaningful for property acquired before 23-Jul-2024; validated by the caller
}

export interface PropertyLtcgResult {
  taxableGain: number;
  tax: number;
  ratePctUsed: number;
  indexationApplied: boolean;
}

/** Property capital gains tax. Assumes long-term holding (this app's horizons are always well past the 24-month threshold) and picks the lower of the two post-2024-budget options when indexation is elected and available. */
export function computePropertyLtcgTax(inputs: PropertyLtcgInputs): PropertyLtcgResult {
  const gainWithoutIndexation = Math.max(0, inputs.saleProceeds - inputs.acquisitionCostIncludingImprovements);
  const taxNoIndexation = gainWithoutIndexation * PROPERTY_LTCG_RATE_PCT_NO_INDEXATION;

  if (!inputs.electIndexation) {
    return {
      taxableGain: gainWithoutIndexation,
      tax: taxNoIndexation,
      ratePctUsed: PROPERTY_LTCG_RATE_PCT_NO_INDEXATION,
      indexationApplied: false,
    };
  }

  const indexedCost = inputs.acquisitionCostIncludingImprovements * inputs.cumulativeInflationMultiplier;
  const gainWithIndexation = Math.max(0, inputs.saleProceeds - indexedCost);
  const taxWithIndexation = gainWithIndexation * PROPERTY_LTCG_RATE_PCT_WITH_INDEXATION;

  // The 2024 budget's transitional rule: take whichever computation gives the lower tax.
  if (taxWithIndexation < taxNoIndexation) {
    return {
      taxableGain: gainWithIndexation,
      tax: taxWithIndexation,
      ratePctUsed: PROPERTY_LTCG_RATE_PCT_WITH_INDEXATION,
      indexationApplied: true,
    };
  }
  return {
    taxableGain: gainWithoutIndexation,
    tax: taxNoIndexation,
    ratePctUsed: PROPERTY_LTCG_RATE_PCT_NO_INDEXATION,
    indexationApplied: false,
  };
}

export interface EquityGainsInputs {
  gain: number;
  isLongTerm: boolean; // holding > 12 months
  /** Exemption already used elsewhere this financial year against the ₹1.25L annual LTCG exemption. */
  exemptionAlreadyUsedThisYear: number;
}

export interface EquityGainsResult {
  tax: number;
  exemptionUsed: number;
}

/** Equity/equity-fund capital gains tax: 12.5% LTCG above the annual exemption, 20% STCG with no exemption. */
export function computeEquityGainsTax(inputs: EquityGainsInputs): EquityGainsResult {
  if (inputs.gain <= 0) return { tax: 0, exemptionUsed: 0 };
  if (!inputs.isLongTerm) {
    return { tax: inputs.gain * EQUITY_STCG_RATE_PCT, exemptionUsed: 0 };
  }
  const remainingExemption = Math.max(0, EQUITY_LTCG_EXEMPTION_ANNUAL - inputs.exemptionAlreadyUsedThisYear);
  const exemptionUsed = Math.min(inputs.gain, remainingExemption);
  const taxableGain = inputs.gain - exemptionUsed;
  return { tax: taxableGain * EQUITY_LTCG_RATE_PCT, exemptionUsed };
}
