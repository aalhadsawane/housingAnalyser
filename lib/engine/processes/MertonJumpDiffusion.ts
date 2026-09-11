import type { RngStrategy } from "../rng";
import type { DistributionStrategy } from "../distributions/types";
import { samplePoisson } from "./util";
import type { ProcessStrategy } from "./types";

/**
 * Merton (1976) jump-diffusion: GBM plus a compound-Poisson jump term.
 *   S_{t+dt} = S_t * exp( (mu - 0.5*sigma^2) * dt + sigma*sqrt(dt)*Z ) * PRODUCT_{i=1..N} J_i
 * where N ~ Poisson(lambda * dt) and each J_i is drawn from `jumpSize`
 * (a distribution over the jump *multiplier*, typically Lognormal centred
 * below 1 for crash risk). Default for property appreciation when the user
 * wants explicit, separately-tunable crash risk rather than relying on
 * GBM's thin tails.
 */
export class MertonJumpDiffusionProcess implements ProcessStrategy {
  readonly kind = "mertonJump" as const;
  readonly label = "Merton jump-diffusion";

  constructor(
    private readonly mu: number,
    private readonly sigma: number,
    private readonly lambda: number, // expected jump arrivals per unit time
    private readonly jumpSize: DistributionStrategy, // distribution over the multiplicative jump size J (e.g. Lognormal with median < 1 for crashes)
    private readonly shock: DistributionStrategy,
  ) {}

  step(level: number, dt: number, rng: RngStrategy): number {
    return this.stepWithShock(level, dt, this.shock.sample(rng), rng);
  }

  /**
   * See OrnsteinUhlenbeckProcess.stepWithShock — the diffusive term takes an
   * externally supplied standardized shock (for correlation with other
   * drivers); the jump term is always drawn independently from `rng`, since
   * rare discrete jump events are not part of this app's Gaussian-copula
   * correlation structure.
   */
  stepWithShock(level: number, dt: number, standardizedShock: number, rng: RngStrategy): number {
    const diffusiveReturn = (this.mu - 0.5 * this.sigma * this.sigma) * dt + this.sigma * Math.sqrt(dt) * standardizedShock;
    let jumpMultiplier = 1;
    const jumpCount = samplePoisson(this.lambda * dt, rng);
    for (let i = 0; i < jumpCount; i++) jumpMultiplier *= this.jumpSize.sample(rng);
    return level * Math.exp(diffusiveReturn) * jumpMultiplier;
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
    return { mu: this.mu, sigma: this.sigma, lambda: this.lambda, jumpSize: this.jumpSize.family };
  }
  rationale(): string {
    return "GBM plus rare, separately-tunable jumps — the standard way to give an asset explicit crash (or spike) risk instead of relying on a diffusion's thin tails.";
  }
}
