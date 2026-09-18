import type { DistributionSpec, ProcessSpec, ScenarioConfig } from "./schema";

/**
 * Shipped India default scenarios, one per city preset, encoding the
 * default family-per-factor table from PLAN.md section 3.1: Lognormal
 * shocks (via GBM) for appreciation and equity returns, Normal
 * innovations on an Ornstein-Uhlenbeck process for the repo rate /
 * inflation / rent growth, Lognormal severity with Poisson arrivals for
 * lumpy repairs, and so on.
 *
 * Every number here is a starting point the UI lets you override, and
 * every preset is explicitly tagged with the city, country, and the year
 * its numbers were set (`asOfYear`) — a "typical 2BHK" means something
 * very different in Mumbai than in Pune, and something different again in
 * three years, so a single untagged default would quietly mislead. These
 * are deliberately ballpark/illustrative figures for a mid-market
 * apartment in that city, not a live market feed — re-check them against
 * current listings before relying on them for a real decision, and treat
 * this file as the one place to do that (see PLAN.md section 2.6's
 * "tax is data, not code" principle, applied here to city economics too).
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

export interface CityPresetParams {
  id: string;
  /** Shown in the UI's city picker, e.g. "Mumbai, India". */
  displayName: string;
  asOfYear: number;
  /** One or two sentences on what kind of property/market this represents and any known caveat — shown as a tooltip in the UI. */
  note: string;
  purchasePrice: number;
  carpetAreaSqft: number;
  stampDutyPct: number;
  parkingCharges: number;
  societyCorpusDeposit: number;
  interiorsCapex: number;
  grossRentalYieldPct: number;
  /** Typical security deposit, in months' rent — varies a lot by city custom (Bengaluru famously demands far more than Mumbai/Pune). */
  depositMonths: number;
  appreciationMu: number;
  appreciationSigma: number;
  /** Only Delhi, Mumbai, Kolkata and Chennai count as "metro" for the HRA 50%-vs-40%-of-basic exemption rule. */
  isMetroForHRA: boolean;
  annualGrossIncome: number;
  hraReceivedMonthly: number;
}

function buildCityPreset(p: CityPresetParams): ScenarioConfig {
  return {
    meta: {
      name: `${p.displayName} 2BHK — ${p.asOfYear} baseline`,
      seed: 42,
      horizonYears: 20,
      numPaths: 5000,
      liquidCapital: 2_100_000, // held constant across cities: this is YOUR stated savings, not a city property
      useAntitheticVariates: true,
    },
    property: {
      cityPresetId: p.id,
      purchasePrice: p.purchasePrice,
      carpetAreaSqft: p.carpetAreaSqft,
      downPaymentFraction: 0.2, // RBI's effective floor for loans above ~₹30L (80% max LTV) -- see the "Property & loan" section's help text
      stampDutyPct: p.stampDutyPct,
      registrationPct: 0.01,
      registrationCap: 30_000,
      brokeragePct: 0.01,
      legalFeesFlat: 50_000,
      gstPctIfUnderConstruction: 0.05,
      parkingCharges: p.parkingCharges,
      societyCorpusDeposit: p.societyCorpusDeposit,
      interiorsCapex: p.interiorsCapex,
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
      grossRentalYieldPct: p.grossRentalYieldPct,
      depositMonths: p.depositMonths,
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
      appreciationProcess: gbmSpec(p.appreciationMu, p.appreciationSigma), // Lognormal via GBM (family default)
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
      annualGrossIncome: p.annualGrossIncome,
      basicSalaryPct: 0.5,
      hraReceivedMonthly: p.hraReceivedMonthly,
      isMetroForHRA: p.isMetroForHRA,
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
}

export const CITY_PRESET_PARAMS: Record<string, CityPresetParams> = {
  pune: {
    id: "pune",
    displayName: "Pune, India",
    asOfYear: 2026,
    note:
      "A budget/outskirts 2BHK (e.g. Wagholi, Undri, Hinjawadi periphery) — priced so it's actually reachable on the stated ₹21L savings once down payment, closing costs, parking, corpus and interiors are all counted. A premium-locality 2BHK realistically starts well above ₹1Cr; raise the price slider to see the affordability warning trip.",
    purchasePrice: 5_200_000,
    carpetAreaSqft: 680,
    stampDutyPct: 0.06, // Maharashtra: ~5% stamp duty + 1% local body tax
    parkingCharges: 150_000,
    societyCorpusDeposit: 50_000,
    interiorsCapex: 300_000,
    grossRentalYieldPct: 0.03,
    depositMonths: 3,
    appreciationMu: 0.07,
    appreciationSigma: 0.12,
    isMetroForHRA: false, // Pune is non-metro for the HRA 50%/40% rule
    annualGrossIncome: 2_400_000,
    hraReceivedMonthly: 40_000,
  },
  mumbai: {
    id: "mumbai",
    displayName: "Mumbai, India",
    asOfYear: 2026,
    note:
      "A budget 2BHK in a far Mumbai suburb (e.g. Virar, Boisar, outer Panvel) — Mumbai's entry price is well above every other Indian metro even at the periphery. On the same ₹21L savings this preset is deliberately a stretch: expect the affordability warning to trip at the default 20% down payment, which is itself a realistic finding, not a bug to fix by lowering the price.",
    purchasePrice: 7_500_000,
    carpetAreaSqft: 620,
    stampDutyPct: 0.06, // Maharashtra base 5% + 1% metro cess (MMR)
    parkingCharges: 200_000,
    societyCorpusDeposit: 75_000,
    interiorsCapex: 300_000,
    grossRentalYieldPct: 0.022, // Mumbai's rental yields are famously the lowest of India's metros
    depositMonths: 3,
    appreciationMu: 0.06, // a mature, already-expensive market tends to appreciate more slowly in percentage terms
    appreciationSigma: 0.12,
    isMetroForHRA: true,
    annualGrossIncome: 2_800_000,
    hraReceivedMonthly: 48_000,
  },
  bengaluru: {
    id: "bengaluru",
    displayName: "Bengaluru, India",
    asOfYear: 2026,
    note:
      "A budget 2BHK on the IT-corridor periphery (e.g. Electronic City, Sarjapur, Whitefield outskirts). Bengaluru landlords typically demand a much larger security deposit than Mumbai or Pune (often 6-10 months' rent) — reflected in the deposit default below, which locks up more of your capital on the rent side than in other cities.",
    purchasePrice: 6_500_000,
    carpetAreaSqft: 700,
    stampDutyPct: 0.056, // Karnataka: ~5% + surcharge/cess, approximated
    parkingCharges: 175_000,
    societyCorpusDeposit: 60_000,
    interiorsCapex: 300_000,
    grossRentalYieldPct: 0.032,
    depositMonths: 6, // the regional quirk noted above
    appreciationMu: 0.08, // IT-driven demand has historically pushed Bengaluru's percentage appreciation higher than the other three
    appreciationSigma: 0.13,
    isMetroForHRA: false, // Bengaluru is non-metro for the HRA 50%/40% rule
    annualGrossIncome: 2_600_000,
    hraReceivedMonthly: 44_000,
  },
  delhiNcr: {
    id: "delhiNcr",
    displayName: "Delhi NCR, India",
    asOfYear: 2026,
    note:
      "A budget 2BHK on the NCR periphery (e.g. Greater Noida, outer Ghaziabad, Dwarka Expressway corridor). Stamp duty below uses Delhi's rate for a male buyer (women buyers get a 2-percentage-point concession in Delhi, not yet a toggle in this tool); Gurgaon/Noida fall under Haryana/UP rules that differ slightly.",
    purchasePrice: 7_000_000,
    carpetAreaSqft: 650,
    stampDutyPct: 0.06,
    parkingCharges: 200_000,
    societyCorpusDeposit: 75_000,
    interiorsCapex: 300_000,
    grossRentalYieldPct: 0.028,
    depositMonths: 3,
    appreciationMu: 0.065,
    appreciationSigma: 0.12,
    isMetroForHRA: true,
    annualGrossIncome: 2_800_000,
    hraReceivedMonthly: 48_000,
  },
};

export const CITY_PRESETS: Record<string, ScenarioConfig> = Object.fromEntries(
  Object.entries(CITY_PRESET_PARAMS).map(([id, params]) => [id, buildCityPreset(params)]),
);

export const CITY_PRESET_LIST: { id: string; label: string }[] = Object.values(CITY_PRESET_PARAMS).map((p) => ({
  id: p.id,
  label: p.displayName,
}));

export const CITY_PRESET_PUNE: ScenarioConfig = CITY_PRESETS.pune!;
export const DEFAULT_SCENARIO_CONFIG = CITY_PRESET_PUNE;
