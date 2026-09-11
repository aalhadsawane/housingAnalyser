import type { RngStrategy } from "../rng";
import { BetaDistribution } from "./Beta";
import type { DistributionStrategy } from "./types";

/**
 * PERT(min, mode, max) — a Beta distribution reparameterised so the mode is
 * an explicit input, with more probability mass concentrated near the mode
 * than a plain Triangular gives. The standard choice for expert-elicited
 * estimates (project-management origin: "optimistic / most likely /
 * pessimistic"), used here for things like possession-delay bounds and
 * life-event durations.
 */
export class PERTDistribution implements DistributionStrategy {
  readonly family = "pert" as const;
  readonly label = "PERT";
  private readonly beta: BetaDistribution;

  constructor(
    private readonly minV: number,
    private readonly mode: number,
    private readonly maxV: number,
    private readonly lambda = 4,
  ) {
    if (!(minV <= mode && mode <= maxV)) throw new Error("PERT distribution requires min <= mode <= max");
    const range = maxV - minV || 1e-9;
    const alpha = 1 + (lambda * (mode - minV)) / range;
    const beta = 1 + (lambda * (maxV - mode)) / range;
    this.beta = new BetaDistribution(alpha, beta, minV, maxV);
  }

  sample(rng: RngStrategy): number {
    return this.beta.sample(rng);
  }
  pdf(x: number): number {
    return this.beta.pdf(x);
  }
  cdf(x: number): number {
    return this.beta.cdf(x);
  }
  quantile(p: number): number {
    return this.beta.quantile(p);
  }
  mean(): number {
    return (this.minV + this.lambda * this.mode + this.maxV) / (this.lambda + 2);
  }
  stdev(): number {
    return this.beta.stdev();
  }
  params(): Record<string, number> {
    return { min: this.minV, mode: this.mode, max: this.maxV, lambda: this.lambda };
  }
  rationale(): string {
    return "The project-management standard for expert-elicited ranges: like Triangular but weights the most-likely value more heavily.";
  }
}

export function fitPERTFromPercentiles(p10: number, p50: number, p90: number): PERTDistribution {
  const minV = p10 - 0.15 * (p50 - p10);
  const maxV = p90 + 0.15 * (p90 - p50);
  return new PERTDistribution(minV, p50, maxV);
}
