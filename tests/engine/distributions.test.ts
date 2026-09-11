import { describe, expect, it } from "vitest";
import { createRng } from "@/lib/engine/rng";
import { BetaDistribution } from "@/lib/engine/distributions/Beta";
import { EmpiricalDistribution } from "@/lib/engine/distributions/Empirical";
import { FixedDistribution } from "@/lib/engine/distributions/Fixed";
import { GammaDistribution } from "@/lib/engine/distributions/Gamma";
import { LognormalDistribution, fitLognormalFromPercentiles } from "@/lib/engine/distributions/Lognormal";
import { MixtureDistribution } from "@/lib/engine/distributions/Mixture";
import { NormalDistribution, fitNormalFromPercentiles } from "@/lib/engine/distributions/Normal";
import { PERTDistribution } from "@/lib/engine/distributions/PERT";
import { StudentTDistribution } from "@/lib/engine/distributions/StudentT";
import { TriangularDistribution } from "@/lib/engine/distributions/Triangular";
import { UniformDistribution } from "@/lib/engine/distributions/Uniform";
import type { DistributionStrategy } from "@/lib/engine/distributions/types";

function sampleStats(dist: DistributionStrategy, n = 200_000, seed = 42) {
  const rng = createRng(seed);
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < n; i++) {
    const x = dist.sample(rng);
    sum += x;
    sumSq += x * x;
  }
  const mean = sum / n;
  const variance = sumSq / n - mean * mean;
  return { mean, stdev: Math.sqrt(Math.max(variance, 0)) };
}

describe("PCG32 RNG", () => {
  it("is deterministic for a fixed seed", () => {
    const a = createRng(123);
    const b = createRng(123);
    const seqA = Array.from({ length: 5 }, () => a.nextFloat());
    const seqB = Array.from({ length: 5 }, () => b.nextFloat());
    expect(seqA).toEqual(seqB);
  });
  it("produces floats in [0, 1)", () => {
    const rng = createRng(7);
    for (let i = 0; i < 10_000; i++) {
      const x = rng.nextFloat();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
  it("different seeds diverge", () => {
    const a = createRng(1).nextFloat();
    const b = createRng(2).nextFloat();
    expect(a).not.toBeCloseTo(b, 6);
  });
});

describe("NormalDistribution", () => {
  const dist = new NormalDistribution(5, 2);
  it("sample mean/stdev match parameters", () => {
    const { mean, stdev } = sampleStats(dist);
    expect(mean).toBeCloseTo(5, 1);
    expect(stdev).toBeCloseTo(2, 1);
  });
  it("quantile inverts cdf", () => {
    expect(dist.cdf(dist.quantile(0.3))).toBeCloseTo(0.3, 4);
  });
  it("fitFromPercentiles recovers a known normal", () => {
    const target = new NormalDistribution(10, 3);
    const fitted = fitNormalFromPercentiles(target.quantile(0.1), target.quantile(0.5), target.quantile(0.9));
    expect(fitted.mean()).toBeCloseTo(10, 3);
    expect(fitted.stdev()).toBeCloseTo(3, 3);
  });
});

describe("LognormalDistribution", () => {
  const dist = new LognormalDistribution(0.1, 0.3);
  it("is always positive", () => {
    const rng = createRng(1);
    for (let i = 0; i < 5000; i++) expect(dist.sample(rng)).toBeGreaterThan(0);
  });
  it("sample mean matches closed-form mean", () => {
    const { mean } = sampleStats(dist);
    expect(mean).toBeCloseTo(dist.mean(), 1);
  });
  it("fitFromPercentiles recovers a known lognormal from its own percentiles", () => {
    // Percentiles must be self-consistent with a lognormal shape (i.e. drawn
    // from an actual instance) for an exact three-point recovery — arbitrary
    // p10/p50/p90 are, in general, only approximately lognormal-shaped, and
    // the fitter (median -> mu, P10-P90 spread -> sigma) is not expected to
    // hit a p50 that isn't the log-space midpoint of p10 and p90.
    const target = new LognormalDistribution(0.05, 0.15);
    const fitted = fitLognormalFromPercentiles(target.quantile(0.1), target.quantile(0.5), target.quantile(0.9));
    expect(fitted.quantile(0.1)).toBeCloseTo(target.quantile(0.1), 3);
    expect(fitted.quantile(0.5)).toBeCloseTo(target.quantile(0.5), 3);
    expect(fitted.quantile(0.9)).toBeCloseTo(target.quantile(0.9), 3);
  });
});

describe("UniformDistribution", () => {
  const dist = new UniformDistribution(2, 8);
  it("sample mean matches (a+b)/2", () => {
    const { mean } = sampleStats(dist);
    expect(mean).toBeCloseTo(5, 1);
  });
  it("stays within bounds", () => {
    const rng = createRng(3);
    for (let i = 0; i < 5000; i++) {
      const x = dist.sample(rng);
      expect(x).toBeGreaterThanOrEqual(2);
      expect(x).toBeLessThan(8);
    }
  });
});

describe("TriangularDistribution", () => {
  const dist = new TriangularDistribution(0, 3, 10);
  it("sample mean matches (min+mode+max)/3", () => {
    const { mean } = sampleStats(dist);
    expect(mean).toBeCloseTo((0 + 3 + 10) / 3, 1);
  });
  it("quantile inverts cdf across the mode", () => {
    for (const p of [0.1, 0.29, 0.3, 0.5, 0.9]) {
      expect(dist.cdf(dist.quantile(p))).toBeCloseTo(p, 3);
    }
  });
});

describe("PERTDistribution", () => {
  const dist = new PERTDistribution(0, 3, 10);
  it("sample mean matches (min + 4*mode + max) / 6", () => {
    const { mean } = sampleStats(dist);
    expect(mean).toBeCloseTo((0 + 4 * 3 + 10) / 6, 1);
  });
});

describe("GammaDistribution", () => {
  const dist = new GammaDistribution(3, 2);
  it("sample mean/stdev match shape*scale / sqrt(shape)*scale", () => {
    const { mean, stdev } = sampleStats(dist);
    expect(mean).toBeCloseTo(6, 0);
    expect(stdev).toBeCloseTo(Math.sqrt(3) * 2, 0);
  });
  it("cdf(0)=0 and is monotone", () => {
    expect(dist.cdf(0)).toBe(0);
    expect(dist.cdf(5)).toBeLessThan(dist.cdf(10));
  });
});

describe("BetaDistribution", () => {
  const dist = new BetaDistribution(2, 5, 0, 1);
  it("sample mean matches alpha/(alpha+beta)", () => {
    const { mean } = sampleStats(dist);
    expect(mean).toBeCloseTo(2 / 7, 1);
  });
  it("stays within [0,1]", () => {
    const rng = createRng(9);
    for (let i = 0; i < 5000; i++) {
      const x = dist.sample(rng);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(1);
    }
  });
});

describe("StudentTDistribution", () => {
  const dist = new StudentTDistribution(10, 0, 1);
  it("sample mean ~ 0 for df > 1", () => {
    const { mean } = sampleStats(dist);
    expect(mean).toBeCloseTo(0, 0);
  });
  it("has fatter tails than Normal at the same sd (df=5)", () => {
    const t5 = new StudentTDistribution(5, 0, 1);
    const norm = new NormalDistribution(0, 1);
    expect(1 - t5.cdf(3)).toBeGreaterThan(1 - norm.cdf(3));
  });
});

describe("FixedDistribution", () => {
  it("always returns the same value", () => {
    const dist = new FixedDistribution(42);
    const rng = createRng(1);
    expect(dist.sample(rng)).toBe(42);
    expect(dist.sample(rng)).toBe(42);
    expect(dist.stdev()).toBe(0);
  });
});

describe("EmpiricalDistribution", () => {
  const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const dist = new EmpiricalDistribution(data);
  it("median matches the data's median", () => {
    expect(dist.quantile(0.5)).toBeCloseTo(5.5, 1);
  });
  it("only samples values present in the data", () => {
    const rng = createRng(1);
    for (let i = 0; i < 100; i++) expect(data).toContain(dist.sample(rng));
  });
});

describe("MixtureDistribution", () => {
  const calm = new NormalDistribution(0.08, 0.1);
  const crisis = new NormalDistribution(-0.3, 0.2);
  const mix = new MixtureDistribution(calm, crisis, 0.8);
  it("mean is the weighted average of component means", () => {
    expect(mix.mean()).toBeCloseTo(0.8 * 0.08 + 0.2 * -0.3, 6);
  });
  it("sample mean matches analytic mean", () => {
    const { mean } = sampleStats(mix);
    expect(mean).toBeCloseTo(mix.mean(), 1);
  });
  it("quantile inverts cdf", () => {
    expect(mix.cdf(mix.quantile(0.4))).toBeCloseTo(0.4, 3);
  });
});
