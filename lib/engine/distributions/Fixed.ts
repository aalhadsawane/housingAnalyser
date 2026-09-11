import type { RngStrategy } from "../rng";
import type { DistributionStrategy } from "./types";

/** Degenerate distribution: always returns the same value. Default for legislated constants (tax slabs, caps). */
export class FixedDistribution implements DistributionStrategy {
  readonly family = "fixed" as const;
  readonly label = "Fixed";
  constructor(private readonly value: number) {}

  sample(_rng: RngStrategy): number {
    return this.value;
  }
  pdf(x: number): number {
    return x === this.value ? Infinity : 0;
  }
  cdf(x: number): number {
    return x < this.value ? 0 : 1;
  }
  quantile(_p: number): number {
    return this.value;
  }
  mean(): number {
    return this.value;
  }
  stdev(): number {
    return 0;
  }
  params(): Record<string, number> {
    return { value: this.value };
  }
  rationale(): string {
    return "A single fixed number — no randomness. The standard default for legislated figures like tax slabs.";
  }
}

export function fitFixedFromPercentiles(p50: number): FixedDistribution {
  return new FixedDistribution(p50);
}
