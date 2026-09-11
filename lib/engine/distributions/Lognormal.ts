import type { RngStrategy } from "../rng";
import { NormalDistribution, fitNormalFromPercentiles } from "./Normal";
import { normalCdf, normalQuantile } from "./specialFunctions";
import type { DistributionStrategy } from "./types";

/**
 * Lognormal. Default for property appreciation and equity/mutual-fund
 * returns — the textbook choice for asset prices and log-returns: it
 * guarantees strictly positive values and reproduces the fat right tail
 * seen in real house-price and equity-return history.
 *
 * Parameterised by (muLog, sigmaLog): the mean and sd of ln(X), i.e. X = exp(N(muLog, sigmaLog)).
 */
export class LognormalDistribution implements DistributionStrategy {
  readonly family = "lognormal" as const;
  readonly label = "Lognormal";
  private readonly logNormal: NormalDistribution;

  constructor(
    private readonly muLog: number,
    private readonly sigmaLog: number,
  ) {
    if (sigmaLog < 0) throw new Error("Lognormal distribution: sigmaLog must be >= 0");
    this.logNormal = new NormalDistribution(muLog, sigmaLog);
  }

  sample(rng: RngStrategy): number {
    return Math.exp(this.logNormal.sample(rng));
  }
  pdf(x: number): number {
    if (x <= 0) return 0;
    const z = (Math.log(x) - this.muLog) / this.sigmaLog;
    return Math.exp(-0.5 * z * z) / (x * this.sigmaLog * Math.sqrt(2 * Math.PI));
  }
  cdf(x: number): number {
    if (x <= 0) return 0;
    return normalCdf(Math.log(x), this.muLog, this.sigmaLog);
  }
  quantile(p: number): number {
    return Math.exp(normalQuantile(p, this.muLog, this.sigmaLog));
  }
  mean(): number {
    return Math.exp(this.muLog + (this.sigmaLog * this.sigmaLog) / 2);
  }
  stdev(): number {
    const s2 = this.sigmaLog * this.sigmaLog;
    return Math.sqrt((Math.exp(s2) - 1) * Math.exp(2 * this.muLog + s2));
  }
  params(): Record<string, number> {
    return { muLog: this.muLog, sigmaLog: this.sigmaLog };
  }
  rationale(): string {
    return "Standard for asset appreciation and log-returns: guarantees positive values and matches the fat right tail typically seen in price history.";
  }
}

export function fitLognormalFromPercentiles(p10: number, p50: number, p90: number): LognormalDistribution {
  if (p10 <= 0 || p50 <= 0 || p90 <= 0) {
    throw new Error("Lognormal percentile fit requires strictly positive p10, p50, p90");
  }
  const fitted = fitNormalFromPercentiles(Math.log(p10), Math.log(p50), Math.log(p90));
  return new LognormalDistribution(fitted.mean(), fitted.stdev());
}
