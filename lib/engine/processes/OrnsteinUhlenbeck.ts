import type { RngStrategy } from "../rng";
import type { DistributionStrategy } from "../distributions/types";
import type { ProcessStrategy } from "./types";

/**
 * Ornstein-Uhlenbeck / Vasicek mean-reverting process:
 *   dX = kappa * (theta - X) * dt + sigma * dW
 * Default for the repo/floating-loan rate and for CPI inflation — the
 * canonical short-rate/mean-reverting model, with Normal innovations by
 * construction (swap the `shock` distribution for Student-t to fatten tails).
 */
export class OrnsteinUhlenbeckProcess implements ProcessStrategy {
  readonly kind = "ornsteinUhlenbeck" as const;
  readonly label = "Ornstein-Uhlenbeck (mean-reverting)";

  constructor(
    private readonly kappa: number, // speed of mean reversion
    private readonly theta: number, // long-run level
    private readonly sigma: number, // volatility of innovations
    private readonly shock: DistributionStrategy, // standardized (mean 0, unit-scale) innovation distribution
  ) {}

  step(level: number, dt: number, rng: RngStrategy): number {
    return this.stepWithShock(level, dt, this.shock.sample(rng));
  }

  /**
   * Advance one step using an externally supplied standardized shock value
   * instead of drawing one internally — the hook the Monte Carlo driver
   * uses to inject a Gaussian-copula-correlated shock (see correlate.ts)
   * while still applying this process's own kappa/theta/sigma dynamics.
   */
  stepWithShock(level: number, dt: number, standardizedShock: number, _rng?: RngStrategy): number {
    const drift = this.kappa * (this.theta - level) * dt;
    const diffusion = this.sigma * Math.sqrt(dt) * standardizedShock;
    return level + drift + diffusion;
  }
  simulatePath(initialLevel: number, steps: number, dt: number, rng: RngStrategy): Float64Array {
    const path = new Float64Array(steps);
    let level = initialLevel;
    for (let i = 0; i < steps; i++) {
      level = this.step(level, dt, rng);
      path[i] = level;
    }
    return path;
  }
  params(): Record<string, unknown> {
    return { kappa: this.kappa, theta: this.theta, sigma: this.sigma, shock: this.shock.family };
  }
  rationale(): string {
    return "The canonical mean-reverting short-rate model (Vasicek) — pulls the level back toward theta at speed kappa, with Normal innovations by default.";
  }
}
