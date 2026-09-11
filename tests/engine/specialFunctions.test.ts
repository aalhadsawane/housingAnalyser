import { describe, expect, it } from "vitest";
import {
  erf,
  gammaFn,
  incompleteBetaRegularized,
  logGamma,
  lowerIncompleteGammaRegularized,
  normalCdf,
  normalQuantile,
} from "@/lib/engine/distributions/specialFunctions";

describe("erf / normal CDF / normal quantile", () => {
  it("matches known erf values", () => {
    expect(erf(0)).toBeCloseTo(0, 6);
    expect(erf(1)).toBeCloseTo(0.8427007929, 6);
    expect(erf(-1)).toBeCloseTo(-0.8427007929, 6);
  });

  it("standard normal CDF at 0 is 0.5, at 1.96 is ~0.975", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.959964)).toBeCloseTo(0.975, 4);
    expect(normalCdf(-1.959964)).toBeCloseTo(0.025, 4);
  });

  it("normal quantile is the inverse of normal CDF", () => {
    expect(normalQuantile(0.975)).toBeCloseTo(1.959964, 3);
    expect(normalQuantile(0.5)).toBeCloseTo(0, 6);
    for (const p of [0.01, 0.1, 0.25, 0.5, 0.75, 0.9, 0.99]) {
      const x = normalQuantile(p);
      expect(normalCdf(x)).toBeCloseTo(p, 5);
    }
  });
});

describe("gamma function", () => {
  it("matches factorials at integers: Gamma(n) = (n-1)!", () => {
    expect(gammaFn(1)).toBeCloseTo(1, 6);
    expect(gammaFn(2)).toBeCloseTo(1, 6);
    expect(gammaFn(5)).toBeCloseTo(24, 4);
    expect(gammaFn(6)).toBeCloseTo(120, 3);
  });
  it("Gamma(0.5) = sqrt(pi)", () => {
    expect(gammaFn(0.5)).toBeCloseTo(Math.sqrt(Math.PI), 5);
  });
  it("logGamma matches log(gammaFn)", () => {
    expect(logGamma(7)).toBeCloseTo(Math.log(gammaFn(7)), 5);
  });
});

describe("incomplete gamma (regularized)", () => {
  it("P(a, 0) = 0 and P(a, inf) -> 1", () => {
    expect(lowerIncompleteGammaRegularized(2, 0)).toBe(0);
    expect(lowerIncompleteGammaRegularized(2, 50)).toBeCloseTo(1, 6);
  });
  it("P(1, x) = 1 - exp(-x) (exponential CDF special case)", () => {
    for (const x of [0.5, 1, 2, 5]) {
      expect(lowerIncompleteGammaRegularized(1, x)).toBeCloseTo(1 - Math.exp(-x), 6);
    }
  });
});

describe("incomplete beta (regularized)", () => {
  it("I_x(1,1) = x (uniform special case)", () => {
    for (const x of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      expect(incompleteBetaRegularized(x, 1, 1)).toBeCloseTo(x, 6);
    }
  });
  it("is symmetric: I_x(a,b) = 1 - I_{1-x}(b,a)", () => {
    expect(incompleteBetaRegularized(0.3, 2, 5)).toBeCloseTo(1 - incompleteBetaRegularized(0.7, 5, 2), 6);
  });
});
