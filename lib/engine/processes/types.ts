import type { RngStrategy } from "../rng";

/**
 * The Strategy interface every stochastic process implements. Mirrors
 * DistributionStrategy's role for time-varying inputs: the simulation loop,
 * the UI's process picker, and the path-preview panel all depend on this
 * interface only, never on a concrete process class.
 *
 * Each concrete process *composes* a DistributionStrategy for its shock/
 * innovation term (passed in at construction) rather than hard-coding
 * Normal — swapping "Normal innovations on an OU" for "Student-t
 * innovations on an OU" is therefore a matter of passing a different
 * DistributionStrategy object in, with zero changes to Ornstein-Uhlenbeck's
 * own code.
 */
export interface ProcessStrategy {
  readonly kind: ProcessKind;
  readonly label: string;
  /** Advance one step of size `dt` (in the process's natural time unit — this app uses dt = 1 month throughout) from `level`. */
  step(level: number, dt: number, rng: RngStrategy): number;
  /** Simulate a full path of `steps` steps of size `dt`, starting at `initialLevel`. Convenience wrapper around repeated `step` calls that also resets any internal regime/state tracking. */
  simulatePath(initialLevel: number, steps: number, dt: number, rng: RngStrategy): Float64Array;
  params(): Record<string, unknown>;
  rationale(): string;
}

export const PROCESS_KINDS = [
  "iid",
  "ornsteinUhlenbeck",
  "gbm",
  "mertonJump",
  "regimeSwitching",
  "blockBootstrap",
] as const;

export type ProcessKind = (typeof PROCESS_KINDS)[number];
