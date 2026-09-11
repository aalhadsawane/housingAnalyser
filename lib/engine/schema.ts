import { z } from "zod";
import { DISTRIBUTION_FAMILIES } from "./distributions/types";
import { PROCESS_KINDS } from "./processes/types";

/**
 * Single source of truth for every configurable input in this app (design:
 * PLAN.md section 2). Every *stochastic* input is one of two shapes:
 *
 *  - `distributionSpecSchema` — a plain random variable (one draw per path,
 *    or one draw per event, e.g. repair severity, possession delay).
 *  - `processSpecSchema` — a time-varying driver (one value per month along
 *    the path, e.g. appreciation, repo rate, rent growth).
 *
 * Both carry `{ family/kind, params }`-shaped data that round-trips exactly
 * through JSON — this is what makes a scenario URL-shareable and what lets
 * the UI's distribution/process pickers and the simulation engine read the
 * literal same object with no drift between "what the card shows" and
 * "what the engine samples" (PLAN.md section 3.1's transparency rule).
 */

export interface DistributionSpec {
  family: (typeof DISTRIBUTION_FAMILIES)[number];
  params: Record<string, number>;
  /** Present only for family "empirical" with user-supplied history rather than a percentile-derived stand-in. */
  data?: number[];
  /** Present only for family "mixture" — the two components being blended. Recursive, so a mixture's own component can itself be a mixture. */
  components?: [DistributionSpec, DistributionSpec];
}

export const distributionSpecSchema: z.ZodType<DistributionSpec> = z.lazy(() =>
  z.object({
    family: z.enum(DISTRIBUTION_FAMILIES),
    params: z.record(z.string(), z.number()),
    data: z.array(z.number()).optional(),
    components: z.tuple([distributionSpecSchema, distributionSpecSchema]).optional(),
  }),
);

const regimeSpecSchema = z.object({
  name: z.string(),
  returnDistribution: distributionSpecSchema,
});

export const processSpecSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("iid"), shock: distributionSpecSchema }),
  z.object({
    kind: z.literal("ornsteinUhlenbeck"),
    kappa: z.number(),
    theta: z.number(),
    sigma: z.number(),
    shock: distributionSpecSchema,
  }),
  z.object({ kind: z.literal("gbm"), mu: z.number(), sigma: z.number(), shock: distributionSpecSchema }),
  z.object({
    kind: z.literal("mertonJump"),
    mu: z.number(),
    sigma: z.number(),
    lambda: z.number(),
    jumpSize: distributionSpecSchema,
    shock: distributionSpecSchema,
  }),
  z.object({
    kind: z.literal("regimeSwitching"),
    regimes: z.array(regimeSpecSchema).min(1),
    transitionMatrix: z.array(z.array(z.number())),
    initialRegimeWeights: z.array(z.number()).optional(),
  }),
  z.object({
    kind: z.literal("blockBootstrap"),
    historicalReturns: z.array(z.number()).min(1),
    blockLength: z.number().int().min(1),
  }),
]);
export type ProcessSpec = z.infer<typeof processSpecSchema>;
export { DISTRIBUTION_FAMILIES, PROCESS_KINDS };

// ---------------------------------------------------------------------------
// Property acquisition
// ---------------------------------------------------------------------------

const propertySchema = z.object({
  cityPresetId: z.string(),
  purchasePrice: z.number().positive(),
  carpetAreaSqft: z.number().positive(),
  downPaymentFraction: z.number().min(0).max(1),
  stampDutyPct: z.number().min(0),
  registrationPct: z.number().min(0),
  registrationCap: z.number().min(0).optional(),
  brokeragePct: z.number().min(0),
  legalFeesFlat: z.number().min(0),
  gstPctIfUnderConstruction: z.number().min(0),
  parkingCharges: z.number().min(0),
  societyCorpusDeposit: z.number().min(0),
  interiorsCapex: z.number().min(0),
  isUnderConstruction: z.boolean(),
  possessionDelayMonths: distributionSpecSchema, // 0 if not under construction
  landSharePct: z.number().min(0).max(1), // for land-appreciates / structure-depreciates split
  structureDepreciationPctAnnual: z.number().min(0),
});

// ---------------------------------------------------------------------------
// Financing
// ---------------------------------------------------------------------------

const loanSchema = z.object({
  tenureYears: z.number().positive(),
  rateType: z.enum(["fixed", "floating"]),
  fixedRatePct: z.number().min(0),
  floatingRateProcess: processSpecSchema, // repo + spread, e.g. OU
  rateResetPolicy: z.enum(["tenureReset", "emiReset"]),
  processingFeePct: z.number().min(0),
  loanProtectionInsuranceAnnual: z.number().min(0),
  prepaymentPolicy: z.enum(["none", "fixedAnnual", "bonusPct", "surplusThreshold"]),
  prepaymentAnnualAmount: z.number().min(0),
  prepaymentBonusPct: z.number().min(0).max(1),
  prepaymentSurplusThreshold: z.number().min(0),
});

// ---------------------------------------------------------------------------
// Buy-side carrying costs
// ---------------------------------------------------------------------------

const carryingCostsSchema = z.object({
  maintenanceRsPerSqftMonth: z.number().min(0),
  maintenanceEscalationProcess: processSpecSchema, // defaults to CPI-linked
  propertyTaxPctOfValueAnnual: z.number().min(0),
  homeInsuranceAnnual: z.number().min(0),
  routineRepairPctOfValueAnnual: z.number().min(0),
  lumpyRepairArrivalLambdaAnnual: z.number().min(0), // Poisson rate
  lumpyRepairSeverity: distributionSpecSchema, // e.g. Gamma
  sinkingFundPctOfValueAnnual: z.number().min(0),
});

// ---------------------------------------------------------------------------
// Exit / sale
// ---------------------------------------------------------------------------

const exitSchema = z.object({
  saleBrokeragePct: z.number().min(0),
  timeToSellMonths: distributionSpecSchema,
  ltcgRatePctWithoutIndexation: z.number().min(0),
  allowIndexationElection: z.boolean(),
  ltcgRatePctWithIndexation: z.number().min(0),
  markToMarketContinuously: z.boolean(), // if false, exit costs/tax only applied at horizon T
});

// ---------------------------------------------------------------------------
// Rent-side
// ---------------------------------------------------------------------------

const rentSchema = z.object({
  baseRentMode: z.enum(["explicit", "yieldOfPurchasePrice"]),
  baseRentMonthly: z.number().min(0),
  grossRentalYieldPct: z.number().min(0),
  depositMonths: z.number().min(0),
  depositForfeitureProbability: z.number().min(0).max(1),
  depositForfeitureSeverityPct: z.number().min(0).max(1),
  rentHikeProcess: processSpecSchema, // AR(1) around CPI + spread
  moveEveryYears: z.number().positive(),
  movingCostMonthsRent: z.number().min(0),
  rentersInsuranceAnnual: z.number().min(0),
});

// ---------------------------------------------------------------------------
// Investment of the differential
// ---------------------------------------------------------------------------

const investmentSchema = z.object({
  equityReturnProcess: processSpecSchema, // GBM lognormal default
  debtReturnProcess: processSpecSchema, // GBM lognormal default, lower vol
  equityAllocationPct: z.number().min(0).max(1),
  expenseRatioPctAnnual: z.number().min(0),
  investmentDisciplineFactor: z.number().min(0).max(1), // share of theoretical surplus actually invested
  sipStepUpWithIncome: z.boolean(),
});

// ---------------------------------------------------------------------------
// Macro layer
// ---------------------------------------------------------------------------

const macroSchema = z.object({
  inflationProcess: processSpecSchema, // OU normal
  incomeGrowthProcess: processSpecSchema, // AR1 normal + promotion jumps (mertonJump reused)
  appreciationProcess: processSpecSchema, // GBM lognormal default
  /** Correlation between the named shock streams; applied via Cholesky. Keys must be a subset of driver names below. */
  correlationMatrix: z.array(z.array(z.number())),
  correlationDriverOrder: z.array(z.string()),
});

// ---------------------------------------------------------------------------
// Tax
// ---------------------------------------------------------------------------

const taxSchema = z.object({
  regime: z.enum(["old", "new"]),
  annualGrossIncome: z.number().min(0),
  basicSalaryPct: z.number().min(0).max(1),
  hraReceivedMonthly: z.number().min(0),
  isMetroForHRA: z.boolean(),
  existingSection80cUsage: z.number().min(0), // headroom already consumed by EPF/ELSS etc.
  equityLtcgExemptionAnnual: z.number().min(0),
  equityLtcgRatePct: z.number().min(0),
  equityStcgRatePct: z.number().min(0),
  debtGainsTaxedAtSlab: z.boolean(),
});

// ---------------------------------------------------------------------------
// Life events (each toggleable; default off except where noted)
// ---------------------------------------------------------------------------

const lifeEventsSchema = z.object({
  relocationShockEnabled: z.boolean(),
  relocationLambdaAnnual: z.number().min(0),
  jobLossShockEnabled: z.boolean(),
  jobLossLambdaAnnual: z.number().min(0),
  jobLossDurationMonths: distributionSpecSchema,
  imputedOwnershipUtilityMonthly: z.number(), // default 0, explicit rather than smuggled in
});

// ---------------------------------------------------------------------------
// Top-level scenario config
// ---------------------------------------------------------------------------

export const scenarioConfigSchema = z.object({
  meta: z.object({
    name: z.string(),
    seed: z.number().int(),
    horizonYears: z.number().positive(),
    numPaths: z.number().int().positive(),
    liquidCapital: z.number().min(0), // W0
    useAntitheticVariates: z.boolean(),
  }),
  property: propertySchema,
  loan: loanSchema,
  carryingCosts: carryingCostsSchema,
  exit: exitSchema,
  rent: rentSchema,
  investment: investmentSchema,
  macro: macroSchema,
  tax: taxSchema,
  lifeEvents: lifeEventsSchema,
});

export type ScenarioConfig = z.infer<typeof scenarioConfigSchema>;
