import type { RngStrategy } from "../rng";
import { GammaDistribution } from "./Gamma";
import { NormalDistribution } from "./Normal";
import { bisectQuantile, gammaFn, incompleteBetaRegularized } from "./specialFunctions";
import type { DistributionStrategy } from "./types";

/**
 * Location-scale Student-t(df, mu, sigma). Offered as the fat-tailed
 * alternative to Normal/Lognormal shocks — the standard choice when you
 * want to model realistic crash risk (equity or property) without
 * hand-crafting a jump process.
 */
export class StudentTDistribution implements DistributionStrategy {
  readonly family = "studentT" as const;
  readonly label = "Student-t";
  constructor(
    private readonly df: number,
    private readonly mu: number,
    private readonly sigma: number,
  ) {
    if (df <= 0) throw new Error("Student-t distribution: df must be > 0");
    if (sigma <= 0) throw new Error("Student-t distribution: sigma must be > 0");
  }

  sample(rng: RngStrategy): number {
    const z = new NormalDistribution(0, 1).sample(rng);
    const chiSq = 2 * new GammaDistribution(this.df / 2, 1).sample(rng);
    const t = z / Math.sqrt(chiSq / this.df);
    return this.mu + this.sigma * t;
  }
  pdf(x: number): number {
    const t = (x - this.mu) / this.sigma;
    const coef = gammaFn((this.df + 1) / 2) / (Math.sqrt(this.df * Math.PI) * gammaFn(this.df / 2));
    return (coef * Math.pow(1 + (t * t) / this.df, -(this.df + 1) / 2)) / this.sigma;
  }
  cdf(x: number): number {
    const t = (x - this.mu) / this.sigma;
    const xBeta = this.df / (this.df + t * t);
    const ib = incompleteBetaRegularized(xBeta, this.df / 2, 0.5);
    return t >= 0 ? 1 - 0.5 * ib : 0.5 * ib;
  }
  quantile(p: number): number {
    const spread = this.sigma * 50 + Math.abs(this.mu) + 50;
    return bisectQuantile((x) => this.cdf(x), p, this.mu - spread, this.mu + spread, 200);
  }
  mean(): number {
    return this.df > 1 ? this.mu : NaN;
  }
  stdev(): number {
    if (this.df > 2) return this.sigma * Math.sqrt(this.df / (this.df - 2));
    return Infinity;
  }
  params(): Record<string, number> {
    return { df: this.df, mu: this.mu, sigma: this.sigma };
  }
  rationale(): string {
    return "Normal's fat-tailed cousin — the standard way to add realistic crash risk to a return series without a separate jump model. Lower df = fatter tails.";
  }
}

export function fitStudentTFromPercentiles(p10: number, p50: number, p90: number, df = 5): StudentTDistribution {
  // Fix df (a judgement call, not data-estimable from 3 percentiles) and
  // solve sigma from the P10-P90 spread of the standard t(df) quantiles.
  const standard = new StudentTDistribution(df, 0, 1);
  const q10 = standard.quantile(0.1);
  const q90 = standard.quantile(0.9);
  const sigma = (p90 - p10) / (q90 - q10);
  return new StudentTDistribution(df, p50, Math.max(sigma, 1e-9));
}
