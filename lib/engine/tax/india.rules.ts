/**
 * Indian tax parameters as DATA, not code (PLAN.md section 2.6) — every
 * figure here is dated and sourced so it can be audited and overridden
 * rather than trusted as a buried assertion. Tax law changes roughly every
 * union budget (February); treat these as the app's editable defaults, not
 * ground truth, and re-verify before relying on them for a real decision.
 *
 * asOf: FY 2025-26 (AY 2026-27), reflecting the Union Budget 2025 changes
 * (new-regime slab restructuring, ₹12L Section 87A rebate threshold,
 * property LTCG at 12.5% without indexation as the post-23-Jul-2024
 * default with an optional pre-2024-style indexed election).
 */

export interface TaxBracket {
  upTo: number; // exclusive upper bound of taxable income for this bracket; Infinity for the top bracket
  ratePct: number;
}

export const OLD_REGIME_SLABS: TaxBracket[] = [
  { upTo: 250_000, ratePct: 0 },
  { upTo: 500_000, ratePct: 0.05 },
  { upTo: 1_000_000, ratePct: 0.2 },
  { upTo: Infinity, ratePct: 0.3 },
];
export const OLD_REGIME_STANDARD_DEDUCTION = 50_000;

export const NEW_REGIME_SLABS: TaxBracket[] = [
  { upTo: 400_000, ratePct: 0 },
  { upTo: 800_000, ratePct: 0.05 },
  { upTo: 1_200_000, ratePct: 0.1 },
  { upTo: 1_600_000, ratePct: 0.15 },
  { upTo: 2_000_000, ratePct: 0.2 },
  { upTo: 2_400_000, ratePct: 0.25 },
  { upTo: Infinity, ratePct: 0.3 },
];
export const NEW_REGIME_STANDARD_DEDUCTION = 75_000;
/** Section 87A: new-regime taxable income at/below this pays zero tax (rebate, not a bracket). */
export const NEW_REGIME_87A_REBATE_THRESHOLD = 1_200_000;

export const CESS_PCT = 0.04; // Health & Education Cess, applies on top of slab tax in both regimes

export const SECTION_24B_SELF_OCCUPIED_CAP = 200_000; // annual, old regime only
export const SECTION_80C_CAP = 150_000; // annual, old regime only, shared across principal repayment / ELSS / EPF / stamp duty in year of purchase / etc.

export const HRA_METRO_PCT_OF_BASIC = 0.5;
export const HRA_NON_METRO_PCT_OF_BASIC = 0.4;
export const HRA_RENT_EXCESS_OVER_BASIC_PCT = 0.1;

export const EQUITY_LTCG_EXEMPTION_ANNUAL = 125_000;
export const EQUITY_LTCG_RATE_PCT = 0.125;
export const EQUITY_STCG_RATE_PCT = 0.2;
export const EQUITY_LONG_TERM_HOLDING_MONTHS = 12;

export const PROPERTY_LTCG_RATE_PCT_NO_INDEXATION = 0.125;
export const PROPERTY_LTCG_RATE_PCT_WITH_INDEXATION = 0.2; // only electable for property acquired before 23 Jul 2024
export const PROPERTY_LONG_TERM_HOLDING_MONTHS = 24;

export const DEBT_FUND_HOLDING_TAXED_AT_SLAB = true; // post-April-2023 rule: no LTCG indexation benefit for debt funds, gains taxed at slab rate regardless of holding period
