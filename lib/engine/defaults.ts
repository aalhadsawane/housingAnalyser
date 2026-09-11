import type { DistributionSpec, ProcessSpec, ScenarioConfig } from "./schema";

/**
 * The shipped India default scenario (Pune preset), encoding the default
 * family-per-factor table from PLAN.md section 3.1: Lognormal shocks
 * (via GBM) for appreciation and equity returns, Normal innovations on an
 * Ornstein-Uhlenbeck process for the repo rate / inflation / rent growth,
 * Lognormal severity with Poisson arrivals for lumpy repairs, and so on.
 *
 * Every number here is a starting point the UI lets you override — see the
 * `source`/`asOf` convention described in PLAN.md section 2.6 for tax
 * figures in particular; this file is deliberately the *only* place these
 * defaults live, so auditing them means reading one file.
 */

const standardNormalShock: DistributionSpec = { family: "normal", params: { mu: 0, sigma: 1 } };

function normalSpec(mu: number, sigma: number): DistributionSpec {
  return { family: "normal", params: { mu, sigma } };
}

function lognormalSpecFromMedianAndSigmaLog(median: number, sigmaLog: number): DistributionSpec {
  return { family: "lognormal", params: { muLog: Math.log(median), sigmaLog } };
}

function pertSpec(min: number, mode: number, max: number): DistributionSpec {
  return { family: "pert", params: { min, mode, max, lambda: 4 } };
}

function ouSpec(kappa: number, theta: number, sigma: number): ProcessSpec {
  return { kind: "ornsteinUhlenbeck", kappa, theta, sigma, shock: standardNormalShock };
}

function gbmSpec(mu: number, sigma: number): ProcessSpec {
  return { kind: "gbm", mu, sigma, shock: standardNormalShock };
}

/** Steady growth (mu, small noise sigma) plus rare promotion-style step jumps — the default income-growth process. */
function growthWithJumpsSpec(mu: number, sigma: number, jumpLambda: number, jumpMedian: number, jumpSigmaLog: number): ProcessSpec {
  return {
    kind: "mertonJump",
    mu,
    sigma,
    lambda: jumpLambda,
    jumpSize: lognormalSpecFromMedianAndSigmaLog(jumpMedian, jumpSigmaLog),
    shock: standardNormalShock,
  };
}

export const CITY_PRESET_PUNE: ScenarioConfig = {
  meta: {
    name: "Pune 2BHK — default scenario",
    seed: 42,
    horizonYears: 20,
    numPaths: 5000,
    liquidCapital: 2_100_000, // your stated mutual-fund corpus
    useAntitheticVariates: true,
  },
  property: {
    // Priced so down payment + closing + parking/corpus/interiors fits
    // inside the stated ₹21L liquid capital (a ₹1.1Cr "typical Pune 2BHK"
    // headline price does not — it needs ~₹30.5L before even reaching
    // parking/corpus/interiors — which is exactly the affordability
    // violation PLAN.md section 2.2 says the UI must flag, not silently
    // allow. This default represents a realistic budget/outskirts Pune
    // 2BHK reachable on this capital; raising the price in the UI is
    // expected to trip that flag, which is the point.
    cityPresetId: "pune",
    purchasePrice: 5_200_000,
    carpetAreaSqft: 680,
    downPaymentFraction: 0.2,
    stampDutyPct: 0.06,
    registrationPct: 0.01,
    registrationCap: 30_000,
    brokeragePct: 0.01,
    legalFeesFlat: 50_000,
    gstPctIfUnderConstruction: 0.05,
    parkingCharges: 150_000,
    societyCorpusDeposit: 50_000,
    interiorsCapex: 300_000,
    isUnderConstruction: false,
    possessionDelayMonths: lognormalSpecFromMedianAndSigmaLog(6, 0.4), // family default: Lognormal
    landSharePct: 0.4,
    structureDepreciationPctAnnual: 0.01,
  },
  loan: {
    tenureYears: 20,
    rateType: "floating",
    fixedRatePct: 0.085,
    floatingRateProcess: ouSpec(0.3, 0.085, 0.01), // Vasicek OU, Normal innovations (family default)
    rateResetPolicy: "tenureReset", // Indian lender default
    processingFeePct: 0.005,
    loanProtectionInsuranceAnnual: 8_000,
    prepaymentPolicy: "none",
    prepaymentAnnualAmount: 0,
    prepaymentBonusPct: 0,
    prepaymentSurplusThreshold: 0,
  },
  carryingCosts: {
    maintenanceRsPerSqftMonth: 3,
    maintenanceEscalationProcess: ouSpec(0.3, 0.05, 0.01), // CPI-linked by default
    propertyTaxPctOfValueAnnual: 0.003,
    homeInsuranceAnnual: 5_000,
    routineRepairPctOfValueAnnual: 0.005,
    lumpyRepairArrivalLambdaAnnual: 0.3, // Poisson arrival (family default)
    lumpyRepairSeverity: lognormalSpecFromMedianAndSigmaLog(150_000, 0.6), // Lognormal severity (family default)
    sinkingFundPctOfValueAnnual: 0.001,
  },
  exit: {
    saleBrokeragePct: 0.015,
    timeToSellMonths: pertSpec(1, 3, 9),
    ltcgRatePctWithoutIndexation: 0.125,
    allowIndexationElection: false,
    ltcgRatePctWithIndexation: 0.2,
    markToMarketContinuously: true,
  },
  rent: {
    baseRentMode: "yieldOfPurchasePrice",
    baseRentMonthly: 0,
    grossRentalYieldPct: 0.03,
    depositMonths: 3,
    depositForfeitureProbability: 0.1,
    depositForfeitureSeverityPct: 0.2,
    rentHikeProcess: ouSpec(0.5, 0.06, 0.015), // Normal innovations on AR(1)/OU around CPI + spread (family default)
    moveEveryYears: 5,
    movingCostMonthsRent: 1,
    rentersInsuranceAnnual: 2_000,
  },
  investment: {
    equityReturnProcess: gbmSpec(0.11, 0.18), // Lognormal via GBM (family default)
    debtReturnProcess: gbmSpec(0.07, 0.03),
    equityAllocationPct: 0.7,
    expenseRatioPctAnnual: 0.005,
    investmentDisciplineFactor: 0.8,
    sipStepUpWithIncome: true,
  },
  macro: {
    inflationProcess: ouSpec(0.3, 0.05, 0.015), // Normal innovations on OU (family default)
    incomeGrowthProcess: growthWithJumpsSpec(0.06, 0.02, 0.15, 1.15, 0.05), // Normal AR1 + Poisson promotion jumps (family default)
    appreciationProcess: gbmSpec(0.07, 0.12), // Lognormal via GBM (family default)
    correlationDriverOrder: ["appreciation", "equityReturn", "inflation", "rentGrowth", "repoRate", "incomeGrowth"],
    correlationMatrix: [
      [1, 0, 0, 0, 0, 0],
      [0, 1, 0, 0, 0, 0],
      [0, 0, 1, 0, 0, 0],
      [0, 0, 0, 1, 0, 0],
      [0, 0, 0, 0, 1, 0],
      [0, 0, 0, 0, 0, 1],
    ], // identity by default — no assumed correlation until the user (or a calibrated preset) sets one
  },
  tax: {
    regime: "old",
    annualGrossIncome: 2_400_000,
    basicSalaryPct: 0.5,
    hraReceivedMonthly: 40_000,
    isMetroForHRA: false, // Pune is non-metro for the HRA 50%/40% rule
    existingSection80cUsage: 100_000,
    equityLtcgExemptionAnnual: 125_000,
    equityLtcgRatePct: 0.125,
    equityStcgRatePct: 0.2,
    debtGainsTaxedAtSlab: true,
  },
  lifeEvents: {
    relocationShockEnabled: false,
    relocationLambdaAnnual: 0.1,
    jobLossShockEnabled: false,
    jobLossLambdaAnnual: 0.05,
    jobLossDurationMonths: pertSpec(1, 3, 9),
    imputedOwnershipUtilityMonthly: 0,
  },
};

export const DEFAULT_SCENARIO_CONFIG = CITY_PRESET_PUNE;
