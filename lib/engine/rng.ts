/**
 * Seedable, reproducible random number generation.
 *
 * The RNG itself is a strategy (`RngStrategy`) so it can be swapped without
 * touching any distribution or process code — every distribution and process
 * strategy consumes only the small interface below, never `Math.random`.
 *
 * Default implementation: PCG32 (O'Neill, 2014) — a small, fast, statistically
 * strong generator that is trivial to seed deterministically, which is what
 * makes every chart in this app reproducible from a single displayed seed.
 */

export interface RngStrategy {
  /** Uniform pseudo-random integer in [0, 2^32). */
  nextUint32(): number;
  /** Uniform pseudo-random double in [0, 1). */
  nextFloat(): number;
  /** Independent copy advanced to a different, deterministic stream (for antithetic pairs, sub-streams per driver, etc.). */
  fork(streamId: number): RngStrategy;
}

const PCG_MULTIPLIER = 6364136223846793005n;
const MASK64 = (1n << 64n) - 1n;
const MASK32 = 0xffffffffn;

/**
 * PCG32 XSH-RR variant. Implemented with BigInt for exact 64-bit arithmetic —
 * correctness over micro-optimisation; at the path counts this app targets
 * (tens of thousands of paths x hundreds of months) this is not the
 * bottleneck.
 */
export class PCG32 implements RngStrategy {
  private state: bigint;
  private readonly inc: bigint;

  constructor(seed: bigint | number, sequence: bigint | number = 0xda3e39cb94b95bdbn) {
    const seedBig = BigInt(seed);
    const seqBig = BigInt(sequence);
    this.inc = ((seqBig << 1n) | 1n) & MASK64;
    this.state = 0n;
    this.stepState();
    this.state = (this.state + seedBig) & MASK64;
    this.stepState();
  }

  private stepState(): void {
    this.state = (this.state * PCG_MULTIPLIER + this.inc) & MASK64;
  }

  nextUint32(): number {
    const oldState = this.state;
    this.stepState();
    const xorshifted = Number(((oldState >> 18n) ^ oldState) >> 27n) & 0xffffffff;
    const rot = Number(oldState >> 59n) & 31;
    const result = (xorshifted >>> rot) | (xorshifted << ((-rot >>> 0) & 31));
    return result >>> 0;
  }

  nextFloat(): number {
    // 53 bits of precision from two 32-bit draws, standard double-generation trick.
    const hi = this.nextUint32();
    const lo = this.nextUint32();
    return ((hi >>> 5) * 67108864 + (lo >>> 6)) / 9007199254740992; // 2^26 * 2^27 / 2^53
  }

  fork(streamId: number): RngStrategy {
    // A different odd `sequence` selects a distinct, deterministic PCG stream —
    // no correlation between the parent stream and the forked one.
    const forkedSeed = (this.state ^ (BigInt(streamId) * 0x9e3779b97f4a7c15n)) & MASK32;
    return new PCG32(forkedSeed, BigInt(streamId) * 2n + 1n);
  }
}

/** Convenience constructor so call sites don't need to know the concrete class. */
export function createRng(seed: number): RngStrategy {
  return new PCG32(seed >>> 0);
}
