import type { RngStrategy } from "../rng";
import { normalCdf, normalQuantile } from "./specialFunctions";
import type { DistributionStrategy } from "./types";

/**
 * Normal (Gaussian). Default for shock terms in mean-reverting processes
 * (OU/Vasicek innovations, rent-growth AR(1) innovations) — the canonical
 * choice for a symmetric, thin-tailed disturbance around a mean-reverting level.
 */
export class NormalDistribution implements DistributionStrategy {
  readonly family = "normal" as const;
  readonly label = "Normal";
  constructor(
    private readonly mu: number,
    private readonly sigma: number,
  ) {
    if (sigma < 0) throw new Error("Normal distribution: sigma must be >= 0");
  }

  sample(rng: RngStrategy): number {
    // Marsaglia polar method: two uniforms -> two independent standard normals.
    // Chosen over a full Ziggurat table for implementation simplicity and
    // exactness; at this workload (millions, not billions, of draws) the
    // ~21% rejection rate is not a meaningful cost.
    let u: number, v: number, s: number;
    do {
      u = rng.nextFloat() * 2 - 1;
      v = rng.nextFloat() * 2 - 1;
      s = u * u + v * v;
    } while (s >= 1 || s === 0);
    const mul = Math.sqrt((-2 * Math.log(s)) / s);
    return this.mu + this.sigma * u * mul;
  }

  pdf(x: number): number {
    const z = (x - this.mu) / this.sigma;
    return Math.exp(-0.5 * z * z) / (this.sigma * Math.sqrt(2 * Math.PI));
  }
  cdf(x: number): number {
    return normalCdf(x, this.mu, this.sigma);
  }
  quantile(p: number): number {
    return normalQuantile(p, this.mu, this.sigma);
  }
  mean(): number {
    return this.mu;
  }
  stdev(): number {
    return this.sigma;
  }
  params(): Record<string, number> {
    return { mu: this.mu, sigma: this.sigma };
  }
  rationale(): string {
    return "The standard default for a symmetric disturbance around a mean — used here for shocks that push a mean-reverting level up or down.";
  }
}

export function fitNormalFromPercentiles(p10: number, p50: number, p90: number): NormalDistribution {
  const z90 = 1.2815515655446004; // standard normal 90th percentile
  const sigma = (p90 - p10) / (2 * z90);
  return new NormalDistribution(p50, Math.max(sigma, 1e-9));
}
