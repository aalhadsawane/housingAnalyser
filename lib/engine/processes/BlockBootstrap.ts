import type { RngStrategy } from "../rng";
import type { ProcessStrategy } from "./types";

/**
 * Stationary block bootstrap over a supplied historical per-step return
 * series (Politis & Romano, 1994): stitches together contiguous blocks of
 * historical returns, each block starting at a uniformly random point in
 * the series and wrapping around, so within-block autocorrelation and
 * volatility clustering from actual history survive into the simulated
 * path. Applied multiplicatively so the level stays positive.
 */
export class BlockBootstrapProcess implements ProcessStrategy {
  readonly kind = "blockBootstrap" as const;
  readonly label = "Block bootstrap (historical)";
  private blockPosition = 0;
  private blockRemaining = 0;

  constructor(
    private readonly historicalReturns: number[], // per-step log-returns, e.g. monthly
    private readonly blockLength: number,
  ) {
    if (historicalReturns.length === 0) throw new Error("BlockBootstrapProcess requires a non-empty historical series");
    if (blockLength < 1) throw new Error("BlockBootstrapProcess: blockLength must be >= 1");
  }

  private startNewBlock(rng: RngStrategy): void {
    this.blockPosition = Math.floor(rng.nextFloat() * this.historicalReturns.length);
    this.blockRemaining = this.blockLength;
  }

  step(level: number, _dt: number, rng: RngStrategy): number {
    if (this.blockRemaining <= 0) this.startNewBlock(rng);
    const logReturn = this.historicalReturns[this.blockPosition % this.historicalReturns.length]!;
    this.blockPosition += 1;
    this.blockRemaining -= 1;
    return level * Math.exp(logReturn);
  }
  simulatePath(initialLevel: number, steps: number, dt: number, rng: RngStrategy): Float64Array {
    this.blockRemaining = 0;
    const path = new Float64Array(steps);
    let level = initialLevel;
    for (let i = 0; i < steps; i++) {
      level = this.step(level, dt, rng);
      path[i] = level;
    }
    return path;
  }
  params(): Record<string, unknown> {
    return { n: this.historicalReturns.length, blockLength: this.blockLength };
  }
  rationale(): string {
    return "Resamples contiguous chunks of real historical returns instead of assuming a shape — preserves autocorrelation and volatility clustering actually seen in the data.";
  }
}
