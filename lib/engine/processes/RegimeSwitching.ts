import type { RngStrategy } from "../rng";
import type { DistributionStrategy } from "../distributions/types";
import type { ProcessStrategy } from "./types";

export interface Regime {
  name: string;
  /** Return-distribution for this regime's log-return-per-step (e.g. Normal(mu, sigma) for "boom", a wider Normal for "bust"). */
  returnDistribution: DistributionStrategy;
}

/**
 * N-state Markov regime-switching process (applied multiplicatively, like
 * GBM, so the level stays positive). Each regime carries its own return
 * distribution; a row-stochastic transition matrix governs month-to-month
 * regime changes. Offered as the process for "boom / normal / bust"
 * appreciation or return modelling.
 *
 * Regime state is internal and mutable (this month's regime depends on last
 * month's) — call `simulatePath` for a fresh path (it re-samples the
 * starting regime from the transition matrix's stationary-ish behaviour via
 * a uniform pick weighted by `initialRegimeWeights`), or call
 * `resetRegime(rng)` yourself before a manual sequence of `step` calls.
 */
export class RegimeSwitchingProcess implements ProcessStrategy {
  readonly kind = "regimeSwitching" as const;
  readonly label = "Regime-switching";
  private currentRegime = 0;

  constructor(
    private readonly regimes: Regime[],
    /** transitionMatrix[i][j] = P(regime j next month | regime i this month); each row must sum to 1. */
    private readonly transitionMatrix: number[][],
    private readonly initialRegimeWeights: number[] = regimes.map(() => 1 / regimes.length),
  ) {
    if (regimes.length === 0) throw new Error("RegimeSwitchingProcess requires at least one regime");
    if (transitionMatrix.length !== regimes.length) {
      throw new Error("RegimeSwitchingProcess: transition matrix must have one row per regime");
    }
  }

  resetRegime(rng: RngStrategy): void {
    const u = rng.nextFloat();
    let cumulative = 0;
    for (let i = 0; i < this.initialRegimeWeights.length; i++) {
      cumulative += this.initialRegimeWeights[i]!;
      if (u < cumulative) {
        this.currentRegime = i;
        return;
      }
    }
    this.currentRegime = this.initialRegimeWeights.length - 1;
  }

  private transitionRegime(rng: RngStrategy): void {
    const row = this.transitionMatrix[this.currentRegime]!;
    const u = rng.nextFloat();
    let cumulative = 0;
    for (let j = 0; j < row.length; j++) {
      cumulative += row[j]!;
      if (u < cumulative) {
        this.currentRegime = j;
        return;
      }
    }
    this.currentRegime = row.length - 1;
  }

  step(level: number, dt: number, rng: RngStrategy): number {
    const regime = this.regimes[this.currentRegime]!;
    const logReturn = regime.returnDistribution.sample(rng) * dt;
    this.transitionRegime(rng);
    return level * Math.exp(logReturn);
  }
  simulatePath(initialLevel: number, steps: number, dt: number, rng: RngStrategy): Float64Array {
    this.resetRegime(rng);
    const path = new Float64Array(steps);
    let level = initialLevel;
    for (let i = 0; i < steps; i++) {
      level = this.step(level, dt, rng);
      path[i] = level;
    }
    return path;
  }
  params(): Record<string, unknown> {
    return {
      regimes: this.regimes.map((r) => r.name),
      transitionMatrix: this.transitionMatrix,
    };
  }
  rationale(): string {
    return "Models distinct market states (e.g. boom / normal / bust) that persist for a while and switch according to a transition matrix you set — captures clustering that a single smooth process can't.";
  }
}
