import type { ScenarioConfig } from "./schema";
import { computeHraExemptionMonthly, computeIncomeTax } from "./tax/india";

/**
 * The rent branch's month-by-month cash flow and net worth, for ONE
 * resolved (non-random) path. Mirrors buyPath.ts's capital-neutral
 * convention: the renter's side portfolio starts at (W0 - deposit) and,
 * every month, additionally receives the buyer's total cash outflow minus
 * the renter's own total cash outflow — PLAN.md section 2.3's Δ rule — so
 * whichever branch is cheaper that month funds the other side's investing
 * (or, if renting is briefly more expensive, the renter draws the
 * difference down rather than pretending it was free). HRA tax savings are
 * added as their own monthly contribution, mirroring how buyPath.ts adds
 * Section 24(b)/80(C) savings on the other side.
 */

export interface RentPathInputs {
  config: ScenarioConfig;
  months: number;
  /** This month's rent, already reflecting the configured hike process. */
  rentPath: Float64Array;
  /** Renter's side-portfolio annual return in each month. */
  investmentReturnAnnualPath: Float64Array;
  /** The buy branch's total monthly cash outflow (from computeBuyPath), used to compute the invested differential. */
  buyerCashOutflowPath: Float64Array;
}

export interface RentPathMonth {
  month: number;
  rent: number;
  movingCost: number;
  totalCashOutflow: number;
  differentialInvested: number; // this month's Δ contribution (can be negative)
  hraTaxSavingsThisMonth: number;
  depositHeld: number;
  sidePortfolio: number;
  netWorth: number;
}

export interface RentPathResult {
  months: RentPathMonth[];
  initialSidePortfolio: number;
}

export function computeRentPath(inputs: RentPathInputs): RentPathResult {
  const { config, months } = inputs;
  const { rent, investment, tax, meta } = config;

  const initialDeposit = rent.depositMonths * (inputs.rentPath[0] ?? 0);
  const initialSidePortfolio = meta.liquidCapital - initialDeposit;

  const basicPlusDaMonthly = (tax.annualGrossIncome * tax.basicSalaryPct) / 12;
  const moveEveryMonths = Math.max(1, Math.round(rent.moveEveryYears * 12));
  // Expected-value forfeiture haircut applied at each move-out, rather than a
  // per-path Bernoulli draw — the Monte Carlo driver samples an actual
  // forfeiture event per path; this deterministic path uses its expectation.
  const expectedForfeitureFraction = rent.depositForfeitureProbability * rent.depositForfeitureSeverityPct;

  let sidePortfolio = Math.max(0, initialSidePortfolio);
  let depositHeld = initialDeposit;
  const results: RentPathMonth[] = [];

  for (let t = 0; t < months; t++) {
    const currentRent = inputs.rentPath[t] ?? 0;
    const isMoveMonth = t > 0 && t % moveEveryMonths === 0;

    let movingCost = 0;
    if (isMoveMonth) {
      movingCost = rent.movingCostMonthsRent * currentRent;
      const refund = depositHeld * (1 - expectedForfeitureFraction);
      const newDeposit = rent.depositMonths * currentRent;
      sidePortfolio += refund - newDeposit; // net cash effect of moving out and re-depositing
      depositHeld = newDeposit;
    }

    const rentersInsurance = rent.rentersInsuranceAnnual / 12;
    const totalCashOutflow = currentRent + rentersInsurance + movingCost;

    const differential = (inputs.buyerCashOutflowPath[t] ?? 0) - totalCashOutflow;

    const hraExemptionMonthly = computeHraExemptionMonthly({
      regime: tax.regime,
      basicPlusDaMonthly,
      hraReceivedMonthly: tax.hraReceivedMonthly,
      rentPaidMonthly: currentRent,
      isMetro: tax.isMetroForHRA,
    });
    const taxWithoutHra = computeIncomeTax({ regime: tax.regime, grossIncome: tax.annualGrossIncome }) / 12;
    const taxWithHra =
      computeIncomeTax({
        regime: tax.regime,
        grossIncome: tax.annualGrossIncome,
        oldRegimeItemizedDeductions: hraExemptionMonthly * 12,
      }) / 12;
    const hraTaxSavingsThisMonth = Math.max(0, taxWithoutHra - taxWithHra);

    const monthlyReturn = (inputs.investmentReturnAnnualPath[t] ?? 0) / 12;
    sidePortfolio = sidePortfolio * (1 + monthlyReturn) + differential + hraTaxSavingsThisMonth;

    const netWorth = sidePortfolio + depositHeld;

    results.push({
      month: t,
      rent: currentRent,
      movingCost,
      totalCashOutflow,
      differentialInvested: differential,
      hraTaxSavingsThisMonth,
      depositHeld,
      sidePortfolio,
      netWorth,
    });
  }

  return { months: results, initialSidePortfolio };
}

/** Convenience: derive a rent level path from either an explicit base rent or a gross-yield-of-purchase-price assumption, before hikes are applied by the caller's rent-growth process. */
export function resolveBaseRentMonthly(config: ScenarioConfig): number {
  if (config.rent.baseRentMode === "explicit") return config.rent.baseRentMonthly;
  return (config.rent.grossRentalYieldPct * config.property.purchasePrice) / 12;
}
