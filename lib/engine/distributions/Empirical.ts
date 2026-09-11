import type { RngStrategy } from "../rng";
import type { DistributionStrategy } from "./types";

/**
 * Empirical / historical. Resamples directly from a supplied dataset
 * (e.g. 20 years of NHB Residex city index returns) instead of assuming any
 * parametric family — the honest choice when you'd rather let history speak
 * than pick a shape.
 */
export class EmpiricalDistribution implements DistributionStrategy {
  readonly family = "empirical" as const;
  readonly label = "Empirical (historical)";
  private readonly sorted: number[];

  constructor(private readonly data: number[]) {
    if (data.length === 0) throw new Error("Empirical distribution requires at least one data point");
    this.sorted = [...data].sort((x, y) => x - y);
  }

  sample(rng: RngStrategy): number {
    const idx = Math.floor(rng.nextFloat() * this.data.length);
    return this.data[Math.min(idx, this.data.length - 1)]!;
  }
  pdf(x: number): number {
    // Gaussian KDE with Silverman's rule-of-thumb bandwidth — a display aid only.
    const n = this.sorted.length;
    const bw = this.silvermanBandwidth();
    let sum = 0;
    for (const xi of this.sorted) {
      const z = (x - xi) / bw;
      sum += Math.exp(-0.5 * z * z);
    }
    return sum / (n * bw * Math.sqrt(2 * Math.PI));
  }
  cdf(x: number): number {
    // Empirical step function with linear interpolation between order statistics.
    const n = this.sorted.length;
    if (x <= this.sorted[0]!) return 0;
    if (x >= this.sorted[n - 1]!) return 1;
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.sorted[mid]! <= x) lo = mid;
      else hi = mid;
    }
    const frac = (x - this.sorted[lo]!) / (this.sorted[hi]! - this.sorted[lo]! || 1);
    return (lo + frac) / (n - 1);
  }
  quantile(p: number): number {
    const n = this.sorted.length;
    const pos = p * (n - 1);
    const lo = Math.floor(pos);
    const hi = Math.min(lo + 1, n - 1);
    const frac = pos - lo;
    return this.sorted[lo]! + frac * (this.sorted[hi]! - this.sorted[lo]!);
  }
  mean(): number {
    return this.data.reduce((a, b) => a + b, 0) / this.data.length;
  }
  stdev(): number {
    const m = this.mean();
    const variance = this.data.reduce((a, b) => a + (b - m) * (b - m), 0) / this.data.length;
    return Math.sqrt(variance);
  }
  params(): Record<string, number> {
    return { n: this.data.length };
  }
  rationale(): string {
    return "Resamples directly from the supplied historical series — no parametric shape assumed, so it can only ever reproduce patterns already present in the data.";
  }

  private silvermanBandwidth(): number {
    const n = this.sorted.length;
    const sd = this.stdev() || 1;
    return 1.06 * sd * Math.pow(n, -1 / 5);
  }
}

export function fitEmpiricalFromPercentiles(p10: number, p50: number, p90: number): EmpiricalDistribution {
  // No real dataset supplied — approximate one via a small synthetic sample
  // consistent with the stated percentiles, so the family can still be
  // selected from percentile-entry mode. Replaced automatically once the
  // user attaches an actual historical series in the UI.
  return new EmpiricalDistribution([p10, p10, p50, p50, p50, p50, p90, p90]);
}
