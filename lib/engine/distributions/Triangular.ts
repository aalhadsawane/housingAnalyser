import type { RngStrategy } from "../rng";
import type { DistributionStrategy } from "./types";

/** Triangular(min, mode, max). Popular with economists for quick expert-elicited ranges. */
export class TriangularDistribution implements DistributionStrategy {
  readonly family = "triangular" as const;
  readonly label = "Triangular";
  constructor(
    private readonly minV: number,
    private readonly mode: number,
    private readonly maxV: number,
  ) {
    if (!(minV <= mode && mode <= maxV)) {
      throw new Error("Triangular distribution requires min <= mode <= max");
    }
  }

  sample(rng: RngStrategy): number {
    const u = rng.nextFloat();
    const fc = (this.mode - this.minV) / (this.maxV - this.minV);
    if (u < fc) {
      return this.minV + Math.sqrt(u * (this.maxV - this.minV) * (this.mode - this.minV));
    }
    return this.maxV - Math.sqrt((1 - u) * (this.maxV - this.minV) * (this.maxV - this.mode));
  }
  pdf(x: number): number {
    if (x < this.minV || x > this.maxV) return 0;
    if (x < this.mode) {
      return (2 * (x - this.minV)) / ((this.maxV - this.minV) * (this.mode - this.minV));
    }
    if (x > this.mode) {
      return (2 * (this.maxV - x)) / ((this.maxV - this.minV) * (this.maxV - this.mode));
    }
    return 2 / (this.maxV - this.minV);
  }
  cdf(x: number): number {
    if (x <= this.minV) return 0;
    if (x >= this.maxV) return 1;
    if (x <= this.mode) {
      return ((x - this.minV) * (x - this.minV)) / ((this.maxV - this.minV) * (this.mode - this.minV));
    }
    return 1 - ((this.maxV - x) * (this.maxV - x)) / ((this.maxV - this.minV) * (this.maxV - this.mode));
  }
  quantile(p: number): number {
    const fc = (this.mode - this.minV) / (this.maxV - this.minV);
    if (p < fc) {
      return this.minV + Math.sqrt(p * (this.maxV - this.minV) * (this.mode - this.minV));
    }
    return this.maxV - Math.sqrt((1 - p) * (this.maxV - this.minV) * (this.maxV - this.mode));
  }
  mean(): number {
    return (this.minV + this.mode + this.maxV) / 3;
  }
  stdev(): number {
    const { minV: a, mode: c, maxV: b } = this;
    const variance = (a * a + b * b + c * c - a * b - a * c - b * c) / 18;
    return Math.sqrt(Math.max(variance, 0));
  }
  params(): Record<string, number> {
    return { min: this.minV, mode: this.mode, max: this.maxV };
  }
  rationale(): string {
    return "A quick, popular expert-elicitation shape: a most-likely value plus hard bounds, with no data needed to fit it.";
  }
}

export function fitTriangularFromPercentiles(p10: number, p50: number, p90: number): TriangularDistribution {
  // Treat p50 as the mode and back out bounds consistent with a triangular's
  // percentile behaviour on each side; a light expansion factor keeps the
  // stated P10/P90 well inside (not exactly at) the tails, matching how a
  // triangular's bounds are usually elicited as slightly-beyond-P10/P90 extremes.
  const minV = p10 - 0.15 * (p50 - p10);
  const maxV = p90 + 0.15 * (p90 - p50);
  return new TriangularDistribution(minV, p50, maxV);
}
