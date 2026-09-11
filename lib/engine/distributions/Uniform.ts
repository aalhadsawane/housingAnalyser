import type { RngStrategy } from "../rng";
import type { DistributionStrategy } from "./types";

/** Uniform on [a, b]. Default only for "I truly have no information beyond bounds" inputs. */
export class UniformDistribution implements DistributionStrategy {
  readonly family = "uniform" as const;
  readonly label = "Uniform";
  constructor(
    private readonly a: number,
    private readonly b: number,
  ) {
    if (b < a) throw new Error("Uniform distribution: b must be >= a");
  }

  sample(rng: RngStrategy): number {
    return this.a + (this.b - this.a) * rng.nextFloat();
  }
  pdf(x: number): number {
    return x >= this.a && x <= this.b ? 1 / (this.b - this.a) : 0;
  }
  cdf(x: number): number {
    if (x < this.a) return 0;
    if (x > this.b) return 1;
    return (x - this.a) / (this.b - this.a);
  }
  quantile(p: number): number {
    return this.a + p * (this.b - this.a);
  }
  mean(): number {
    return (this.a + this.b) / 2;
  }
  stdev(): number {
    return (this.b - this.a) / Math.sqrt(12);
  }
  params(): Record<string, number> {
    return { a: this.a, b: this.b };
  }
  rationale(): string {
    return "Every value between the bounds is equally likely — use only when you genuinely have no reason to favour any value over another.";
  }
}

export function fitUniformFromPercentiles(p10: number, p90: number): UniformDistribution {
  // Stretch the P10-P90 span back out to implied bounds under a uniform assumption.
  const span = p90 - p10;
  const a = p10 - 0.125 * span;
  const b = p90 + 0.125 * span;
  return new UniformDistribution(a, b);
}
