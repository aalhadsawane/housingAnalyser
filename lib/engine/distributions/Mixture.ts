import type { RngStrategy } from "../rng";
import { bisectQuantile } from "./specialFunctions";
import type { DistributionStrategy } from "./types";

/**
 * Mixture of two component distributions with a mixing weight — e.g.
 * "80% normal-regime appreciation, 20% crisis-regime appreciation".
 * Composes any two DistributionStrategy instances; each component can be
 * any family, including another mixture.
 */
export class MixtureDistribution implements DistributionStrategy {
  readonly family = "mixture" as const;
  readonly label = "Mixture";

  constructor(
    private readonly componentA: DistributionStrategy,
    private readonly componentB: DistributionStrategy,
    private readonly weightA: number,
  ) {
    if (weightA < 0 || weightA > 1) throw new Error("Mixture distribution: weightA must be in [0, 1]");
  }

  sample(rng: RngStrategy): number {
    return rng.nextFloat() < this.weightA ? this.componentA.sample(rng) : this.componentB.sample(rng);
  }
  pdf(x: number): number {
    return this.weightA * this.componentA.pdf(x) + (1 - this.weightA) * this.componentB.pdf(x);
  }
  cdf(x: number): number {
    return this.weightA * this.componentA.cdf(x) + (1 - this.weightA) * this.componentB.cdf(x);
  }
  quantile(p: number): number {
    const lo = Math.min(this.componentA.quantile(0.0001), this.componentB.quantile(0.0001));
    const hi = Math.max(this.componentA.quantile(0.9999), this.componentB.quantile(0.9999));
    return bisectQuantile((x) => this.cdf(x), p, lo, hi, 200);
  }
  mean(): number {
    return this.weightA * this.componentA.mean() + (1 - this.weightA) * this.componentB.mean();
  }
  stdev(): number {
    // Law of total variance: Var = E[Var|component] + Var[E|component].
    const meanA = this.componentA.mean();
    const meanB = this.componentB.mean();
    const overallMean = this.mean();
    const withinVar =
      this.weightA * this.componentA.stdev() ** 2 + (1 - this.weightA) * this.componentB.stdev() ** 2;
    const betweenVar =
      this.weightA * (meanA - overallMean) ** 2 + (1 - this.weightA) * (meanB - overallMean) ** 2;
    return Math.sqrt(withinVar + betweenVar);
  }
  params(): Record<string, number> {
    return { weightA: this.weightA };
  }
  rationale(): string {
    return "Blends two named regimes into one variable — e.g. a calm-market distribution most of the time, a crisis distribution the rest, exactly as often as you say.";
  }
}
