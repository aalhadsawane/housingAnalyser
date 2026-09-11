import { simulateAmortizationSchedule } from "./amortization";
import type { ScenarioConfig } from "./schema";
import {
  computeIncomeTax,
  computePropertyLtcgTax,
  computeSection24bDeduction,
  computeSection80cDeduction,
} from "./tax/india";

/**
 * The buy branch's month-by-month cash flow and net worth, for ONE resolved
 * (non-random) path — the caller supplies already-sampled driver paths
 * (property value, loan rate, escalation, repair events); this function
 * contains no randomness of its own; consumed both by the deterministic
 * preview and, later, once per Monte Carlo path, by the simulation driver.
 *
 * Capital-neutral convention (see rentPath.ts for the renter's mirror):
 * whatever of W0 is NOT spent on Day-0 acquisition costs is invested in the
 * buyer's own side portfolio at t=0; from month 1 that portfolio compounds
 * at the buyer's investment return process and additionally receives the
 * rupee value of each month's Section 24(b)/80(C) tax savings, so the tax
 * asymmetry between owning and renting is represented as real invested
 * money on both sides rather than an unmodelled footnote.
 */

export interface BuyPathInputs {
  config: ScenarioConfig;
  months: number;
  /** Property value at the end of each month, months[0..months-1]. Already reflects whatever appreciation process (and land/structure split, if any) the caller chose. */
  propertyValuePath: Float64Array;
  /** Annual loan rate (fraction, e.g. 0.085) applying in each month. */
  loanRateAnnualPath: Float64Array;
  /** Cumulative escalation multiplier (base 1.0 at purchase) applied to maintenance/property-tax/insurance/sinking-fund each month. */
  costEscalationPath: Float64Array;
  /** Cumulative inflation multiplier from purchase to each month — used as the Section-54-style indexation proxy at exit. */
  cumulativeInflationPath: Float64Array;
  /** Buyer's own side-portfolio annual return in each month (already resolved from the investment.debtReturnProcess/equityReturnProcess blend the caller chose). */
  investmentReturnAnnualPath: Float64Array;
  /** Total lumpy-repair cash outflow landing in each month (0 for most months) — already resolved from the Poisson-arrival + severity draw. */
  lumpyRepairCashPath: Float64Array;
  /** Months of interest-only pre-EMI + parallel rent the buyer pays before possession (0 if not under construction). */
  possessionDelayMonths: number;
  /** Rent paid during the possession-delay window (only used if possessionDelayMonths > 0), same series rentPath would otherwise use for those months. */
  preEmiRentPath: Float64Array;
}

export interface BuyPathMonth {
  month: number;
  emi: number;
  maintenance: number;
  propertyTax: number;
  insurance: number;
  repairs: number;
  sinkingFund: number;
  preEmiRent: number;
  totalCashOutflow: number;
  loanBalance: number;
  propertyValue: number;
  homeEquity: number;
  taxSavingsThisMonth: number;
  sidePortfolio: number;
  netWorth: number; // pre-exit-cost mark; see markToMarketContinuously handling below
  netWorthAfterExitCosts: number; // what you'd actually walk away with if you sold this month
}

export interface BuyPathResult {
  months: BuyPathMonth[];
  initialSidePortfolio: number;
  dayZeroOutflow: number;
  affordabilityWarning: boolean; // true if dayZeroOutflow > liquidCapital
}

export function computeBuyPath(inputs: BuyPathInputs): BuyPathResult {
  const { config, months } = inputs;
  const { property, loan, carryingCosts, exit, tax, meta } = config;

  const downPayment = property.downPaymentFraction * property.purchasePrice;
  const registration = Math.min(
    property.registrationPct * property.purchasePrice,
    property.registrationCap ?? Infinity,
  );
  const closingCosts =
    property.stampDutyPct * property.purchasePrice +
    registration +
    property.brokeragePct * property.purchasePrice +
    (property.isUnderConstruction ? property.gstPctIfUnderConstruction * property.purchasePrice : 0) +
    property.legalFeesFlat;
  const dayZeroOutflow =
    downPayment + closingCosts + property.parkingCharges + property.societyCorpusDeposit + property.interiorsCapex;
  const initialSidePortfolio = meta.liquidCapital - dayZeroOutflow;
  const affordabilityWarning = dayZeroOutflow > meta.liquidCapital;

  const loanPrincipal = property.purchasePrice - downPayment;
  const tenureMonths = Math.round(loan.tenureYears * 12);
  const originalAnnualRate = loan.rateType === "fixed" ? loan.fixedRatePct : inputs.loanRateAnnualPath[0] ?? loan.fixedRatePct;

  const amortization = simulateAmortizationSchedule({
    principal: loanPrincipal,
    originalAnnualRatePct: originalAnnualRate,
    tenureMonths,
    ratePathAnnualPct:
      loan.rateType === "fixed" ? new Float64Array(months).fill(loan.fixedRatePct) : inputs.loanRateAnnualPath,
    resetPolicy: loan.rateResetPolicy,
    totalMonths: months,
    prepaymentForMonth:
      loan.prepaymentPolicy === "fixedAnnual"
        ? (m) => (m > 0 && m % 12 === 0 ? loan.prepaymentAnnualAmount : 0)
        : loan.prepaymentPolicy === "bonusPct"
          ? (m) => (m > 0 && m % 12 === 0 ? loan.prepaymentBonusPct * tax.annualGrossIncome : 0)
          : undefined, // "none" and "surplusThreshold" (the latter needs cross-branch info; see PLAN.md/README for that limitation) both mean no prepayment here
  });

  // Section 80C headroom is used up across the year (principal repayment,
  // plus stamp duty + registration in the purchase year); track it annually.
  let section80cUsedThisYear = property.isUnderConstruction ? 0 : tax.existingSection80cUsage; // stamp duty/registration counted below in month 0 of year 1
  let currentYear = 0;

  const results: BuyPathMonth[] = [];
  let sidePortfolio = Math.max(0, initialSidePortfolio);
  let cumulativeInflationAtPurchase = 1; // cumulativeInflationPath is relative to purchase (index 0 = 1.0-ish)

  for (let t = 0; t < months; t++) {
    const yearIndex = Math.floor(t / 12);
    if (yearIndex !== currentYear) {
      currentYear = yearIndex;
      section80cUsedThisYear = tax.existingSection80cUsage;
    }

    const inDelay = t < inputs.possessionDelayMonths;
    const amortMonth = amortization[Math.max(0, t - inputs.possessionDelayMonths)];
    const emi = inDelay ? 0 : amortMonth?.emi ?? 0;
    const preEmiInterest = inDelay ? loanPrincipal * (originalAnnualRate / 12) : 0;
    const preEmiRent = inDelay ? inputs.preEmiRentPath[t] ?? 0 : 0;

    const escalation = inputs.costEscalationPath[t] ?? 1;
    const propertyValue = inputs.propertyValuePath[t] ?? property.purchasePrice;
    const maintenance = carryingCosts.maintenanceRsPerSqftMonth * property.carpetAreaSqft * escalation;
    const propertyTax = (carryingCosts.propertyTaxPctOfValueAnnual / 12) * propertyValue;
    const insurance = (carryingCosts.homeInsuranceAnnual / 12) * escalation;
    const routineRepairs = (carryingCosts.routineRepairPctOfValueAnnual / 12) * propertyValue;
    const lumpyRepairs = inputs.lumpyRepairCashPath[t] ?? 0;
    const repairs = routineRepairs + lumpyRepairs;
    const sinkingFund = (carryingCosts.sinkingFundPctOfValueAnnual / 12) * propertyValue;
    const loanProtectionInsurance = loan.loanProtectionInsuranceAnnual / 12;

    const totalCashOutflow =
      emi + preEmiInterest + preEmiRent + maintenance + propertyTax + insurance + repairs + sinkingFund + loanProtectionInsurance;

    // Tax savings: Section 24(b) on interest paid this month, Section 80C on principal (+ one-time stamp duty/registration in month 0).
    const interestThisMonth = inDelay ? preEmiInterest : amortMonth?.interestPaid ?? 0;
    const principalThisMonth = inDelay ? 0 : Math.max(0, amortMonth?.principalPaid ?? 0);
    const section24bDeduction = computeSection24bDeduction(tax.regime, interestThisMonth * 12) / 12; // cap is annual; approximate monthly share
    let eightyCEligible = principalThisMonth;
    if (t === 0) eightyCEligible += property.stampDutyPct * property.purchasePrice + registration;
    const section80cDeduction = computeSection80cDeduction(tax.regime, eightyCEligible, section80cUsedThisYear);
    section80cUsedThisYear += section80cDeduction;

    const taxWithoutDeductions = computeIncomeTax({ regime: tax.regime, grossIncome: tax.annualGrossIncome }) / 12;
    const taxWithDeductions =
      computeIncomeTax({
        regime: tax.regime,
        grossIncome: tax.annualGrossIncome,
        oldRegimeItemizedDeductions: (section24bDeduction + section80cDeduction) * 12,
      }) / 12;
    const taxSavingsThisMonth = Math.max(0, taxWithoutDeductions - taxWithDeductions);

    const monthlyReturn = (inputs.investmentReturnAnnualPath[t] ?? 0) / 12;
    sidePortfolio = sidePortfolio * (1 + monthlyReturn) + taxSavingsThisMonth;

    const loanBalance = inDelay ? loanPrincipal : amortMonth?.closingBalance ?? 0;
    const homeEquity = propertyValue - loanBalance;
    const netWorth = homeEquity + sidePortfolio;

    cumulativeInflationAtPurchase = inputs.cumulativeInflationPath[t] ?? cumulativeInflationAtPurchase;
    const saleBrokerage = exit.saleBrokeragePct * propertyValue;
    const acquisitionCost = property.purchasePrice + closingCosts; // improvements/interiors omitted from cost basis for simplicity
    const ltcg = computePropertyLtcgTax({
      saleProceeds: propertyValue,
      acquisitionCostIncludingImprovements: acquisitionCost,
      cumulativeInflationMultiplier: cumulativeInflationAtPurchase,
      holdingMonths: t + 1,
      electIndexation: exit.allowIndexationElection,
    });
    const netWorthAfterExitCosts = netWorth - saleBrokerage - ltcg.tax;

    results.push({
      month: t,
      emi,
      maintenance,
      propertyTax,
      insurance,
      repairs,
      sinkingFund,
      preEmiRent,
      totalCashOutflow,
      loanBalance,
      propertyValue,
      homeEquity,
      taxSavingsThisMonth,
      sidePortfolio,
      netWorth: exit.markToMarketContinuously ? netWorthAfterExitCosts : netWorth,
      netWorthAfterExitCosts,
    });
  }

  return { months: results, initialSidePortfolio, dayZeroOutflow, affordabilityWarning };
}
