import type { RngStrategy } from "../rng";

/**
 * The Strategy interface every distribution family implements.
 *
 * This is the single contract the rest of the app depends on: the
 * simulation loop, the UI's DistributionCard, and the percentile-fitting
 * code all talk to `DistributionStrategy` and never to a concrete class.
 * Adding a new family later means writing one new class that implements
 * this interface and adding one line to the registry (index.ts) — nothing
 * else in the codebase changes.
 */
export interface DistributionStrategy {
  /** Machine-readable family id, stable across app versions (used in saved/shared configs). */
  readonly family: DistributionFamily;
  /** Human label shown on the distribution card, e.g. "Lognormal". */
  readonly label: string;
  /** Draw one pseudo-random sample using the given RNG. */
  sample(rng: RngStrategy): number;
  /** Probability density (or mixture density) at x. */
  pdf(x: number): number;
  /** Cumulative probability P(X <= x). */
  cdf(x: number): number;
  /** Inverse CDF: x such that P(X <= x) = p, for p in (0, 1). */
  quantile(p: number): number;
  mean(): number;
  stdev(): number;
  /** The distribution's own parameters, in the shape the registry's `create` expects — used for serialisation. */
  params(): Record<string, number>;
  /** One-line, non-technical rationale shown under the family dropdown on the card. */
  rationale(): string;
}

export const DISTRIBUTION_FAMILIES = [
  "fixed",
  "normal",
  "lognormal",
  "studentT",
  "triangular",
  "pert",
  "uniform",
  "beta",
  "gamma",
  "empirical",
  "mixture",
] as const;

export type DistributionFamily = (typeof DISTRIBUTION_FAMILIES)[number];

/** Convenience readout bundle for the UI card (percentiles + moments in one call). */
export interface DistributionSummary {
  mean: number;
  stdev: number;
  median: number;
  p5: number;
  p10: number;
  p90: number;
  p95: number;
}

export function summarize(dist: DistributionStrategy): DistributionSummary {
  return {
    mean: dist.mean(),
    stdev: dist.stdev(),
    median: dist.quantile(0.5),
    p5: dist.quantile(0.05),
    p10: dist.quantile(0.1),
    p90: dist.quantile(0.9),
    p95: dist.quantile(0.95),
  };
}
