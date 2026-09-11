import type { RngStrategy } from "../rng";
import type { DistributionStrategy } from "../distributions/types";
import type { ProcessStrategy } from "./types";

/**
 * Geometric Brownian Motion:
 *   dS = mu * S * dt + sigma * S * dW
 *   S_{t+dt} = S_t * exp( (mu - 0.5*sigma^2) * dt + sigma * sqrt(dt) * Z )
 * Default process for property appreciation and equity/mutual-fund returns —
 * guarantees a strictly positive level path. `shock` defaults to a standard
 * Normal (log-returns Normal = level Lognormal, the textbook default);
 * swapping in a Student-t shock fattens the return tails while keeping the
 * same drift/vol reading.
 */
export class GBMProcess implements ProcessStrategy {
  readonly kind = "gbm" as const;
  readonly label = "Geometric Brownian Motion";

  constructor(
    private readonly mu: number, // annualized (or per-natural-unit) drift
    private readonly sigma: number, // annualized (or per-natural-unit) volatility
    private readonly shock: DistributionStrategy, // standardized (mean 0, unit-scale) innovation distribution
  ) {}

  step(level: number, dt: number, rng: RngStrategy): number {
    const logReturn = (this.mu - 0.5 * this.sigma * this.sigma) * dt + this.sigma * Math.sqrt(dt) * this.shock.sample(rng);
    return level * Math.exp(logReturn);
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
    return { mu: this.mu, sigma: this.sigma, shock: this.shock.family };
  }
  rationale(): string {
    return "The textbook model for asset prices: log-returns are the chosen shock distribution (Normal by default), so the level itself stays strictly positive and is lognormally distributed at any horizon.";
  }
}
