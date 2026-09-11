import type { RngStrategy } from "../rng";
import type { DistributionStrategy } from "../distributions/types";
import type { ProcessStrategy } from "./types";

/**
 * Independent draws each step — no memory, no mean reversion. Default for
 * inputs with no meaningful time structure at monthly resolution (e.g. a
 * one-off event size drawn once).
 */
export class IIDProcess implements ProcessStrategy {
  readonly kind = "iid" as const;
  readonly label = "IID draws";
  constructor(private readonly shock: DistributionStrategy) {}

  step(_level: number, _dt: number, rng: RngStrategy): number {
    return this.shock.sample(rng);
  }
  simulatePath(_initialLevel: number, steps: number, dt: number, rng: RngStrategy): Float64Array {
    const path = new Float64Array(steps);
    for (let i = 0; i < steps; i++) path[i] = this.step(0, dt, rng);
    return path;
  }
  params(): Record<string, unknown> {
    return { shock: this.shock.family, ...this.shock.params() };
  }
  rationale(): string {
    return "Every step is an independent draw from the chosen distribution — no memory of the previous value, no trend.";
  }
}
