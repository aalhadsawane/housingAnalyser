import type { RngStrategy } from "../rng";
import { GammaDistribution } from "./Gamma";
import { bisectQuantile, incompleteBetaRegularized, logGamma } from "./specialFunctions";
import type { DistributionStrategy } from "./types";

/** Beta(alpha, beta) scaled to [a, b]. Flexible bounded shape; default for "share of X" style inputs. */
export class BetaDistribution implements DistributionStrategy {
  readonly family = "beta" as const;
  readonly label = "Beta";
  private readonly logB: number; // log Beta(alpha, beta)

  constructor(
    private readonly alpha: number,
    private readonly beta: number,
    private readonly a = 0,
    private readonly b = 1,
  ) {
    if (alpha <= 0 || beta <= 0) throw new Error("Beta distribution: alpha and beta must be > 0");
    if (b <= a) throw new Error("Beta distribution: b must be > a");
    this.logB = logGamma(alpha) + logGamma(beta) - logGamma(alpha + beta);
  }

  sample(rng: RngStrategy): number {
    // Standard construction: X ~ Beta(a,b)  <=>  X = Ga / (Ga + Gb), Ga~Gamma(a,1), Gb~Gamma(b,1).
    const ga = new GammaDistribution(this.alpha, 1).sample(rng);
    const gb = new GammaDistribution(this.beta, 1).sample(rng);
    const u = ga / (ga + gb);
    return this.a + u * (this.b - this.a);
  }
  pdf(x: number): number {
    const u = (x - this.a) / (this.b - this.a);
    if (u < 0 || u > 1) return 0;
    const logPdf = (this.alpha - 1) * Math.log(u) + (this.beta - 1) * Math.log(1 - u) - this.logB;
    return Math.exp(logPdf) / (this.b - this.a);
  }
  cdf(x: number): number {
    const u = (x - this.a) / (this.b - this.a);
    if (u <= 0) return 0;
    if (u >= 1) return 1;
    return incompleteBetaRegularized(u, this.alpha, this.beta);
  }
  quantile(p: number): number {
    const u = bisectQuantile((x) => incompleteBetaRegularized(x, this.alpha, this.beta), p, 0, 1);
    return this.a + u * (this.b - this.a);
  }
  mean(): number {
    return this.a + (this.alpha / (this.alpha + this.beta)) * (this.b - this.a);
  }
  stdev(): number {
    const varU = (this.alpha * this.beta) / ((this.alpha + this.beta) ** 2 * (this.alpha + this.beta + 1));
    return Math.sqrt(varU) * (this.b - this.a);
  }
  params(): Record<string, number> {
    return { alpha: this.alpha, beta: this.beta, a: this.a, b: this.b };
  }
  rationale(): string {
    return "A flexible bounded shape — the standard choice when a quantity is naturally confined to a range (e.g. a fraction or share).";
  }
}

export function fitBetaFromPercentiles(p10: number, p50: number, p90: number, a: number, b: number): BetaDistribution {
  // Solve for (alpha, beta) matching mean~p50 and P10/P90 spread via a small
  // grid + bisection search on alpha with beta derived to keep the mean fixed.
  const targetMeanU = (p50 - a) / (b - a);
  let lo = 0.05;
  let hi = 500;
  const evalSpread = (alpha: number): number => {
    const beta = (alpha * (1 - targetMeanU)) / targetMeanU;
    const dist = new BetaDistribution(alpha, beta, a, b);
    return dist.quantile(0.9) - dist.quantile(0.1);
  };
  const targetSpread = p90 - p10;
  // Spread is monotonically decreasing in alpha (tighter as alpha grows) — bisect.
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (evalSpread(mid) > targetSpread) lo = mid;
    else hi = mid;
  }
  const alpha = (lo + hi) / 2;
  const beta = (alpha * (1 - targetMeanU)) / targetMeanU;
  return new BetaDistribution(Math.max(alpha, 1e-3), Math.max(beta, 1e-3), a, b);
}
