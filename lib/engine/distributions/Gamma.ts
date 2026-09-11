import type { RngStrategy } from "../rng";
import { NormalDistribution } from "./Normal";
import { bisectQuantile, gammaFn, logGamma, lowerIncompleteGammaRegularized } from "./specialFunctions";
import type { DistributionStrategy } from "./types";

/**
 * Gamma(shape, scale). Default pairing (with Poisson arrivals) for insurable
 * loss severity — e.g. lumpy repair costs — the standard actuarial shape:
 * positive, right-skewed, with a heavier tail than lognormal for moderate shape.
 */
export class GammaDistribution implements DistributionStrategy {
  readonly family = "gamma" as const;
  readonly label = "Gamma";
  constructor(
    private readonly shape: number,
    private readonly scale: number,
  ) {
    if (shape <= 0 || scale <= 0) throw new Error("Gamma distribution: shape and scale must be > 0");
  }

  sample(rng: RngStrategy): number {
    // Marsaglia & Tsang (2000) method, valid directly for shape >= 1; for
    // shape < 1 boost by one and correct with a uniform power transform.
    if (this.shape < 1) {
      const boosted = new GammaDistribution(this.shape + 1, this.scale).sample(rng);
      const u = rng.nextFloat();
      return boosted * Math.pow(u, 1 / this.shape);
    }
    const d = this.shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);
    const std = new NormalDistribution(0, 1);
    for (let i = 0; i < 1000; i++) {
      let x: number;
      let v: number;
      do {
        x = std.sample(rng);
        v = 1 + c * x;
      } while (v <= 0);
      v = v * v * v;
      const u = rng.nextFloat();
      if (u < 1 - 0.0331 * x * x * x * x) return d * v * this.scale;
      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v * this.scale;
    }
    return d * this.scale; // fallback, astronomically unlikely to be reached
  }
  pdf(x: number): number {
    if (x <= 0) return 0;
    const logPdf =
      (this.shape - 1) * Math.log(x) - x / this.scale - this.shape * Math.log(this.scale) - logGamma(this.shape);
    return Math.exp(logPdf);
  }
  cdf(x: number): number {
    if (x <= 0) return 0;
    return lowerIncompleteGammaRegularized(this.shape, x / this.scale);
  }
  quantile(p: number): number {
    const hi = this.mean() + 20 * this.stdev() + 10;
    return bisectQuantile((x) => this.cdf(x), p, 0, Math.max(hi, 1e-6), 200);
  }
  mean(): number {
    return this.shape * this.scale;
  }
  stdev(): number {
    return Math.sqrt(this.shape) * this.scale;
  }
  params(): Record<string, number> {
    return { shape: this.shape, scale: this.scale };
  }
  rationale(): string {
    return "The standard actuarial shape for positive, right-skewed costs — typically paired with Poisson-distributed arrival counts for lumpy expenses.";
  }
}

export { gammaFn };

export function fitGammaFromPercentiles(p10: number, p50: number, p90: number): GammaDistribution {
  // Match mean (via p50 as an approx central tendency) and P10-P90 spread by
  // bisecting on shape (spread/mean ratio shrinks as shape grows), then
  // deriving scale from the target mean.
  const targetMean = p50;
  let lo = 0.05;
  let hi = 500;
  const evalRelSpread = (shape: number): number => {
    const scale = targetMean / shape;
    const dist = new GammaDistribution(shape, scale);
    return (dist.quantile(0.9) - dist.quantile(0.1)) / targetMean;
  };
  const targetRelSpread = (p90 - p10) / targetMean;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (evalRelSpread(mid) > targetRelSpread) lo = mid;
    else hi = mid;
  }
  const shape = (lo + hi) / 2;
  const scale = targetMean / shape;
  return new GammaDistribution(Math.max(shape, 1e-3), Math.max(scale, 1e-9));
}
