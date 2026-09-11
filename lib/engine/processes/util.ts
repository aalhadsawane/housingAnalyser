import type { RngStrategy } from "../rng";

/** Knuth's algorithm — fine for the small-to-moderate lambda*dt this app uses (rare monthly event counts). */
export function samplePoisson(lambda: number, rng: RngStrategy): number {
  if (lambda <= 0) return 0;
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k += 1;
    p *= rng.nextFloat();
  } while (p > L);
  return k - 1;
}
