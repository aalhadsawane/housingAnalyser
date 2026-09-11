import { describe, expect, it } from "vitest";
import { createRng } from "@/lib/engine/rng";
import { CorrelatedShockEngine, choleskyDecompose, choleskyDecomposeWithJitter } from "@/lib/engine/correlate";

function matMulTranspose(L: number[][]): number[][] {
  const n = L.length;
  const out = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let sum = 0;
      for (let k = 0; k < n; k++) sum += L[i]![k]! * L[j]![k]!;
      out[i]![j] = sum;
    }
  }
  return out;
}

describe("choleskyDecompose", () => {
  it("L L^T reconstructs the original correlation matrix", () => {
    const matrix = [
      [1, 0.3, -0.2],
      [0.3, 1, 0.1],
      [-0.2, 0.1, 1],
    ];
    const L = choleskyDecompose(matrix);
    const reconstructed = matMulTranspose(L);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        expect(reconstructed[i]![j]!).toBeCloseTo(matrix[i]![j]!, 8);
      }
    }
  });

  it("the identity matrix decomposes to the identity", () => {
    const L = choleskyDecompose([
      [1, 0],
      [0, 1],
    ]);
    expect(L).toEqual([
      [1, 0],
      [0, 1],
    ]);
  });

  it("throws on a non-positive-definite matrix", () => {
    // Internally contradictory: x and y are perfectly correlated (corr=1),
    // which forces corr(x,z) == corr(y,z) — but this matrix claims
    // corr(x,z)=0.5 and corr(y,z)=-0.5. Determinant is negative (-1), so it
    // is not a valid (positive semi-definite) correlation matrix.
    expect(() =>
      choleskyDecompose([
        [1, 1, 0.5],
        [1, 1, -0.5],
        [0.5, -0.5, 1],
      ]),
    ).toThrow();
  });
});

describe("choleskyDecomposeWithJitter", () => {
  // corr(x,y)=0.8, corr(y,z)=0.8 mathematically forces corr(x,z) >= 2*0.8^2-1 = 0.28;
  // 0.27 is just outside that feasible region, so this is barely non-PD
  // (determinant ~= -0.0073) — a realistic case for a hand-edited
  // correlation matrix that's slightly inconsistent, not the wildly
  // contradictory matrix above.
  const barelyInvalid = [
    [1, 0.8, 0.27],
    [0.8, 1, 0.8],
    [0.27, 0.8, 1],
  ];

  it("plain Cholesky rejects it", () => {
    expect(() => choleskyDecompose(barelyInvalid)).toThrow();
  });

  it("jitter fixes it", () => {
    expect(() => choleskyDecomposeWithJitter(barelyInvalid)).not.toThrow();
  });
});

describe("CorrelatedShockEngine", () => {
  it("recovers the target correlation empirically over many draws", () => {
    const driverOrder = ["a", "b", "c"];
    const targetCorrelation = [
      [1, 0.6, -0.3],
      [0.6, 1, 0],
      [-0.3, 0, 1],
    ];
    const engine = new CorrelatedShockEngine(driverOrder, targetCorrelation);
    const rng = createRng(123);

    const n = 100_000;
    const a: number[] = [];
    const b: number[] = [];
    const c: number[] = [];
    for (let i = 0; i < n; i++) {
      const shocks = engine.drawStandardNormals(rng);
      a.push(shocks.get("a")!);
      b.push(shocks.get("b")!);
      c.push(shocks.get("c")!);
    }

    const corr = (x: number[], y: number[]) => {
      const mx = x.reduce((s, v) => s + v, 0) / x.length;
      const my = y.reduce((s, v) => s + v, 0) / y.length;
      let cov = 0,
        vx = 0,
        vy = 0;
      for (let i = 0; i < x.length; i++) {
        cov += (x[i]! - mx) * (y[i]! - my);
        vx += (x[i]! - mx) ** 2;
        vy += (y[i]! - my) ** 2;
      }
      return cov / Math.sqrt(vx * vy);
    };

    expect(corr(a, b)).toBeCloseTo(0.6, 1);
    expect(corr(a, c)).toBeCloseTo(-0.3, 1);
    expect(corr(b, c)).toBeCloseTo(0, 1);
  });

  it("each individual driver's marginal is still standard normal (mean 0, sd 1)", () => {
    const engine = new CorrelatedShockEngine(
      ["x", "y"],
      [
        [1, 0.4],
        [0.4, 1],
      ],
    );
    const rng = createRng(7);
    const xs: number[] = [];
    for (let i = 0; i < 50_000; i++) xs.push(engine.drawStandardNormals(rng).get("x")!);
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const variance = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length;
    expect(mean).toBeCloseTo(0, 1);
    expect(variance).toBeCloseTo(1, 1);
  });

  it("an identity correlation matrix produces independent draws", () => {
    const engine = new CorrelatedShockEngine(
      ["x", "y"],
      [
        [1, 0],
        [0, 1],
      ],
    );
    const rng = createRng(3);
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i < 50_000; i++) {
      const shocks = engine.drawStandardNormals(rng);
      xs.push(shocks.get("x")!);
      ys.push(shocks.get("y")!);
    }
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
    const my = ys.reduce((a, b) => a + b, 0) / ys.length;
    let cov = 0;
    for (let i = 0; i < xs.length; i++) cov += (xs[i]! - mx) * (ys[i]! - my);
    cov /= xs.length;
    expect(cov).toBeCloseTo(0, 1);
  });
});
