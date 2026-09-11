import type { RngStrategy } from "./rng";
import { normalQuantile } from "./distributions/specialFunctions";

/**
 * Cholesky decomposition + a correlated-standard-normal generator, used to
 * apply the user-editable correlation matrix (PLAN.md section 2.4) across
 * the macro drivers. Applied as a Gaussian copula: this module only ever
 * produces correlated *standard normal* values; simulate.ts converts each
 * one to a uniform via the normal CDF and then through that specific
 * driver's own chosen shock distribution's quantile function — so a driver
 * configured with Student-t shocks keeps its fat tails, it just becomes
 * correlated with the other driver's shocks in rank-correlation terms.
 */

export function choleskyDecompose(matrix: number[][]): number[][] {
  const n = matrix.length;
  const L: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = matrix[i]![j]!;
      for (let k = 0; k < j; k++) sum -= L[i]![k]! * L[j]![k]!;
      if (i === j) {
        if (sum <= 0) {
          throw new Error(`Matrix is not positive definite at row ${i} (pivot = ${sum})`);
        }
        L[i]![j] = Math.sqrt(sum);
      } else {
        L[i]![j] = sum / L[j]![j]!;
      }
    }
  }
  return L;
}

/**
 * Cholesky-with-jitter: a pragmatic "nearest PSD" fallback for a
 * user-edited correlation matrix that is symmetric and close to, but not
 * exactly, positive semi-definite (common after manual editing or after
 * averaging/rounding calibrated values). Adds a small multiple of the
 * identity and retries rather than failing outright. This is a simpler
 * technique than a full Higham nearest-correlation-matrix projection —
 * adequate for the small (a handful of drivers) matrices this app uses,
 * and documented here as the deliberate simplification it is.
 */
export function choleskyDecomposeWithJitter(matrix: number[][], maxAttempts = 12): number[][] {
  let jitter = 0;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const adjusted =
        jitter === 0 ? matrix : matrix.map((row, i) => row.map((v, j) => (i === j ? v + jitter : v)));
      return choleskyDecompose(adjusted);
    } catch {
      jitter = jitter === 0 ? 1e-10 : jitter * 10;
    }
  }
  throw new Error(
    "Could not Cholesky-decompose the correlation matrix even after jitter retries — check it is symmetric with 1s on the diagonal and entries in [-1, 1].",
  );
}

export class CorrelatedShockEngine {
  private readonly L: number[][];

  constructor(
    private readonly driverOrder: string[],
    correlationMatrix: number[][],
  ) {
    if (correlationMatrix.length !== driverOrder.length) {
      throw new Error("CorrelatedShockEngine: correlationMatrix size must match driverOrder length");
    }
    this.L = choleskyDecomposeWithJitter(correlationMatrix);
  }

  /** Draw one correlated standard-normal value per driver for the current time step. */
  drawStandardNormals(rng: RngStrategy): Map<string, number> {
    const n = this.driverOrder.length;
    const z = new Array<number>(n);
    for (let i = 0; i < n; i++) z[i] = normalQuantile(rng.nextFloat());

    const result = new Map<string, number>();
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let k = 0; k <= i; k++) sum += this.L[i]![k]! * z[k]!;
      result.set(this.driverOrder[i]!, sum);
    }
    return result;
  }
}
