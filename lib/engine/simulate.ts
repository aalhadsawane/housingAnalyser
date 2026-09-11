import { computeBuyPath } from "./buyPath";
import { CorrelatedShockEngine } from "./correlate";
import { buildDistribution, buildProcess } from "./factory";
import { createRng, type RngStrategy } from "./rng";
import { computeRentPath, resolveBaseRentMonthly } from "./rentPath";
import type { ProcessSpec, ScenarioConfig } from "./schema";

/**
 * The Monte Carlo driver: runs `config.meta.numPaths` independent paths,
 * each one sampling every configured DistributionStrategy/ProcessStrategy
 * exactly once, driving buyPath.ts and rentPath.ts, and collecting
 * NW_buy(t) and NW_rent(t) across all paths for the charts in PLAN.md
 * section 4. This is the one place distributions/processes, correlation,
 * amortization, tax, and the two cash-flow paths all come together.
 */

export interface SimulationResult {
  numPaths: number;
  months: number;
  /** [path][month] net worth, buy branch. */
  buyNetWorth: Float64Array[];
  /** [path][month] net worth, rent branch. */
  rentNetWorth: Float64Array[];
  affordabilityWarningPaths: number; // count of paths where Day-0 outflow exceeded liquid capital
}

export interface SimulationOptions {
  onProgress?: (pathsCompleted: number, totalPaths: number) => void;
}

export function runSimulation(config: ScenarioConfig, options: SimulationOptions = {}): SimulationResult {
  const months = Math.round(config.meta.horizonYears * 12);
  const numPaths = config.meta.numPaths;
  const dt = 1 / 12;
  const masterRng = createRng(config.meta.seed);

  const shockEngine = new CorrelatedShockEngine(config.macro.correlationDriverOrder, config.macro.correlationMatrix);

  const buyNetWorth: Float64Array[] = [];
  const rentNetWorth: Float64Array[] = [];
  let affordabilityWarningPaths = 0;

  for (let p = 0; p < numPaths; p++) {
    const pathRng = masterRng.fork(p);
    const result = runSinglePath(config, months, dt, pathRng, shockEngine);
    buyNetWorth.push(result.buyNetWorth);
    rentNetWorth.push(result.rentNetWorth);
    if (result.affordabilityWarning) affordabilityWarningPaths += 1;
    options.onProgress?.(p + 1, numPaths);
  }

  return { numPaths, months, buyNetWorth, rentNetWorth, affordabilityWarningPaths };
}

/** For an Ornstein-Uhlenbeck spec, its long-run level theta; for any other process kind, `fallback` — used so a mean-reverting rate/growth process starts already at its long-run level instead of an arbitrary 0, which would otherwise bias every path's early months low. */
function ouThetaOrFallback(spec: ProcessSpec, fallback: number): number {
  return spec.kind === "ornsteinUhlenbeck" ? spec.theta : fallback;
}

/**
 * Step a process using a correlated shock when it supports stepWithShock
 * (OrnsteinUhlenbeck/GBM/Merton jump-diffusion), otherwise fall back to its
 * plain, uncorrelated `step` (regime-switching, block bootstrap, IID) — see
 * ProcessStrategy.stepWithShock's doc comment for why some process kinds
 * cannot take an externally supplied shock. The correlated value is used
 * directly as the process's own standardized shock, which is exact when
 * that process's configured shock distribution is Normal(0,1) — this app's
 * default for every correlated driver — and a documented approximation
 * (correlated in rank/Gaussian-copula terms, not exactly in the target
 * marginal) if the user swaps in a different shock family for one of them.
 */
function stepCorrelated(
  proc: ReturnType<typeof buildProcess>,
  level: number,
  dt: number,
  standardizedShock: number,
  rng: RngStrategy,
): number {
  if (proc.stepWithShock) return proc.stepWithShock(level, dt, standardizedShock, rng);
  return proc.step(level, dt, rng);
}

function runSinglePath(
  config: ScenarioConfig,
  months: number,
  dt: number,
  rng: RngStrategy,
  shockEngine: CorrelatedShockEngine,
) {
  // Fresh process instances every path: regime-switching and block-bootstrap
  // processes hold internal mutable state that must not leak between paths.
  const appreciationProc = buildProcess(config.macro.appreciationProcess);
  const inflationProc = buildProcess(config.macro.inflationProcess);
  const repoRateProc = buildProcess(config.loan.floatingRateProcess);
  const rentGrowthProc = buildProcess(config.rent.rentHikeProcess);
  const equityProc = buildProcess(config.investment.equityReturnProcess);
  const debtProc = buildProcess(config.investment.debtReturnProcess);
  const incomeProc = buildProcess(config.macro.incomeGrowthProcess);
  const maintenanceEscProc = buildProcess(config.carryingCosts.maintenanceEscalationProcess);

  const propertyValuePath = new Float64Array(months);
  const loanRateAnnualPath = new Float64Array(months);
  const costEscalationPath = new Float64Array(months);
  const cumulativeInflationPath = new Float64Array(months);
  const equityReturnAnnualPath = new Float64Array(months);
  const debtReturnAnnualPath = new Float64Array(months);
  const rentLevelPath = new Float64Array(months);
  const incomeMultiplierPath = new Float64Array(months);

  let propertyLevel = config.property.purchasePrice;
  // Rate/growth-level processes (OU) start at their own long-run theta
  // rather than 0, so early months aren't artificially biased toward "no
  // inflation, no rent growth" while the process slowly reverts upward.
  let inflationLevel = ouThetaOrFallback(config.macro.inflationProcess, 0.05);
  let repoLevel = ouThetaOrFallback(config.loan.floatingRateProcess, config.loan.fixedRatePct);
  let rentGrowthLevel = ouThetaOrFallback(config.rent.rentHikeProcess, 0.06);
  let cumulativeInflation = 1;
  let cumulativeMaintenanceEscalation = 1;
  let incomeLevel = 1;
  let rentLevel = resolveBaseRentMonthly(config);

  for (let t = 0; t < months; t++) {
    const correlated = shockEngine.drawStandardNormals(rng);
    const zAppreciation = correlated.get("appreciation") ?? 0;
    const zEquity = correlated.get("equityReturn") ?? 0;
    const zInflation = correlated.get("inflation") ?? 0;
    const zRentGrowth = correlated.get("rentGrowth") ?? 0;
    const zRepo = correlated.get("repoRate") ?? 0;
    const zIncome = correlated.get("incomeGrowth") ?? 0;

    propertyLevel = stepCorrelated(appreciationProc, propertyLevel, dt, zAppreciation, rng);
    propertyValuePath[t] = propertyLevel;

    // Equity/debt are modelled as a fresh one-month growth multiplier each
    // step (level always reset to 1), then re-expressed as an "annualized"
    // rate using the same dt=1/12 convention buyPath/rentPath divide back
    // out by /12 — the round trip is exact (dt*12 == 1), it just lets both
    // paths share one "annual rate per month" array shape.
    const equityMultiplier = stepCorrelated(equityProc, 1, dt, zEquity, rng);
    equityReturnAnnualPath[t] = (equityMultiplier - 1) / dt;
    const debtMultiplier = debtProc.step(1, dt, rng);
    debtReturnAnnualPath[t] = (debtMultiplier - 1) / dt;

    inflationLevel = stepCorrelated(inflationProc, inflationLevel, dt, zInflation, rng);
    cumulativeInflation *= 1 + inflationLevel * dt;
    cumulativeInflationPath[t] = cumulativeInflation;

    const maintenanceEscMultiplier = maintenanceEscProc.step(1, dt, rng);
    cumulativeMaintenanceEscalation *= maintenanceEscMultiplier;
    costEscalationPath[t] = cumulativeMaintenanceEscalation;

    repoLevel = stepCorrelated(repoRateProc, repoLevel, dt, zRepo, rng);
    loanRateAnnualPath[t] = Math.max(0.001, repoLevel);

    rentGrowthLevel = stepCorrelated(rentGrowthProc, rentGrowthLevel, dt, zRentGrowth, rng);
    rentLevel *= 1 + rentGrowthLevel * dt;
    rentLevelPath[t] = rentLevel;

    incomeLevel = stepCorrelated(incomeProc, incomeLevel, dt, zIncome, rng);
    incomeMultiplierPath[t] = incomeLevel;
  }

  // One-off (not time-varying) draws: possession delay, per-month lumpy repairs (Poisson arrival + severity).
  const possessionDelayMonths = config.property.isUnderConstruction
    ? Math.round(buildDistribution(config.property.possessionDelayMonths).sample(rng))
    : 0;

  const lumpyRepairCashPath = new Float64Array(months);
  const repairLambdaMonthly = config.carryingCosts.lumpyRepairArrivalLambdaAnnual / 12;
  const repairSeverityDist = buildDistribution(config.carryingCosts.lumpyRepairSeverity);
  for (let t = 0; t < months; t++) {
    if (rng.nextFloat() < repairLambdaMonthly) {
      lumpyRepairCashPath[t] = repairSeverityDist.sample(rng);
    }
  }

  const preEmiRentPath = rentLevelPath; // renter-equivalent rent paid during the under-construction window

  const investmentReturnBlendPath = new Float64Array(months);
  for (let t = 0; t < months; t++) {
    investmentReturnBlendPath[t] =
      config.investment.equityAllocationPct * equityReturnAnnualPath[t]! +
      (1 - config.investment.equityAllocationPct) * debtReturnAnnualPath[t]! -
      config.investment.expenseRatioPctAnnual;
  }

  const buyResult = computeBuyPath({
    config,
    months,
    propertyValuePath,
    loanRateAnnualPath,
    costEscalationPath,
    cumulativeInflationPath,
    investmentReturnAnnualPath: investmentReturnBlendPath,
    lumpyRepairCashPath,
    possessionDelayMonths,
    preEmiRentPath,
  });

  const rentResult = computeRentPath({
    config,
    months,
    rentPath: rentLevelPath,
    investmentReturnAnnualPath: investmentReturnBlendPath,
    buyerCashOutflowPath: Float64Array.from(buyResult.months.map((m) => m.totalCashOutflow)),
  });

  return {
    buyNetWorth: Float64Array.from(buyResult.months.map((m) => m.netWorth)),
    rentNetWorth: Float64Array.from(rentResult.months.map((m) => m.netWorth)),
    affordabilityWarning: buyResult.affordabilityWarning,
  };
}
