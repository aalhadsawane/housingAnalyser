import { describe, expect, it } from "vitest";
import { createRng } from "@/lib/engine/rng";
import { NormalDistribution } from "@/lib/engine/distributions/Normal";
import { LognormalDistribution } from "@/lib/engine/distributions/Lognormal";
import { BlockBootstrapProcess } from "@/lib/engine/processes/BlockBootstrap";
import { GBMProcess } from "@/lib/engine/processes/GBM";
import { IIDProcess } from "@/lib/engine/processes/IID";
import { MertonJumpDiffusionProcess } from "@/lib/engine/processes/MertonJumpDiffusion";
import { OrnsteinUhlenbeckProcess } from "@/lib/engine/processes/OrnsteinUhlenbeck";
import { RegimeSwitchingProcess } from "@/lib/engine/processes/RegimeSwitching";
import { samplePoisson } from "@/lib/engine/processes/util";

describe("OrnsteinUhlenbeckProcess", () => {
  it("mean-reverts toward theta over a long path regardless of starting point", () => {
    const shock = new NormalDistribution(0, 1);
    const proc = new OrnsteinUhlenbeckProcess(0.3, 0.06, 0.01, shock);
    const rng = createRng(1);
    const path = proc.simulatePath(0.15, 600, 1 / 12, rng); // start far from theta=0.06
    const tail = Array.from(path.slice(-100));
    const tailMean = tail.reduce((a, b) => a + b, 0) / tail.length;
    expect(tailMean).toBeCloseTo(0.06, 1);
  });

  it("with kappa=0 sigma=0 it stays exactly at the initial level (pure drift-free, shock-free check)", () => {
    const proc = new OrnsteinUhlenbeckProcess(0, 0.06, 0, new NormalDistribution(0, 1));
    const rng = createRng(2);
    const path = proc.simulatePath(0.1, 50, 1 / 12, rng);
    for (const x of path) expect(x).toBeCloseTo(0.1, 10);
  });
});

describe("GBMProcess", () => {
  it("stays strictly positive over long paths", () => {
    const proc = new GBMProcess(0.08, 0.18, new NormalDistribution(0, 1));
    const rng = createRng(3);
    const path = proc.simulatePath(100, 360, 1 / 12, rng);
    for (const x of path) expect(x).toBeGreaterThan(0);
  });

  it("average annualized log-return across many paths matches mu", () => {
    const mu = 0.07;
    const sigma = 0.15;
    let sumLogReturn = 0;
    const nPaths = 2000;
    const years = 10;
    for (let p = 0; p < nPaths; p++) {
      const proc = new GBMProcess(mu, sigma, new NormalDistribution(0, 1));
      const rng = createRng(1000 + p);
      const path = proc.simulatePath(1, years * 12, 1 / 12, rng);
      const finalLevel = path[path.length - 1]!;
      sumLogReturn += Math.log(finalLevel) / years;
    }
    expect(sumLogReturn / nPaths).toBeCloseTo(mu, 1);
  });
});

describe("MertonJumpDiffusionProcess", () => {
  it("with lambda=0 behaves exactly like plain GBM (same seed)", () => {
    const shock = () => new NormalDistribution(0, 1);
    const jumpSize = new LognormalDistribution(-0.1, 0.05);
    const gbm = new GBMProcess(0.08, 0.18, shock());
    const merton = new MertonJumpDiffusionProcess(0.08, 0.18, 0, jumpSize, shock());
    const pathGbm = gbm.simulatePath(100, 100, 1 / 12, createRng(5));
    const pathMerton = merton.simulatePath(100, 100, 1 / 12, createRng(5));
    for (let i = 0; i < pathGbm.length; i++) expect(pathMerton[i]).toBeCloseTo(pathGbm[i]!, 6);
  });

  it("adds strictly more log-return variance than plain GBM (isolating dispersion from the drift jumps also remove)", () => {
    // Comparing *raw level* stdev would conflate two effects: jumps add
    // variance, but median-below-1 jumps also drag the mean level down, and
    // a lognormal's absolute stdev scales with its mean — so a riskier (in
    // relative terms) process can show *smaller* absolute stdev once its
    // center has collapsed. Comparing log-return variance isolates the
    // effect this test actually wants to check.
    const mu = 0.08;
    const sigma = 0.15;
    const nPaths = 800;
    const years = 15;
    const logReturnsGbm: number[] = [];
    const logReturnsJump: number[] = [];
    for (let p = 0; p < nPaths; p++) {
      const jumpSize = new LognormalDistribution(Math.log(0.7), 0.1); // crash-sized jumps, median -30%
      const gbm = new GBMProcess(mu, sigma, new NormalDistribution(0, 1));
      const merton = new MertonJumpDiffusionProcess(mu, sigma, 0.3, jumpSize, new NormalDistribution(0, 1));
      const finalGbm = gbm.simulatePath(1, years * 12, 1 / 12, createRng(2000 + p))[years * 12 - 1]!;
      const finalJump = merton.simulatePath(1, years * 12, 1 / 12, createRng(2000 + p))[years * 12 - 1]!;
      logReturnsGbm.push(Math.log(finalGbm));
      logReturnsJump.push(Math.log(finalJump));
    }
    const variance = (arr: number[]) => {
      const m = arr.reduce((a, b) => a + b, 0) / arr.length;
      return arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length;
    };
    expect(variance(logReturnsJump)).toBeGreaterThan(variance(logReturnsGbm));
  });
});

describe("RegimeSwitchingProcess", () => {
  it("spends roughly the right long-run share of time in each regime given the transition matrix", () => {
    const regimes = [
      { name: "calm", returnDistribution: new NormalDistribution(0.08, 0.01) },
      { name: "crisis", returnDistribution: new NormalDistribution(-0.3, 0.05) },
    ];
    // P(stay calm)=0.95, P(stay crisis)=0.5 -> long-run P(calm) = (1-0.5)/((1-0.95)+(1-0.5)) = 0.5/0.55 ~ 0.909
    const transitionMatrix = [
      [0.95, 0.05],
      [0.5, 0.5],
    ];
    const proc = new RegimeSwitchingProcess(regimes, transitionMatrix, [1, 0]);
    const rng = createRng(11);
    // Use returns near-zero-variance regimes so we can infer regime from the level trajectory sign roughly;
    // instead, directly count regime occupancy via a instrumented run using step() and inspecting returned deltas.
    let calmSteps = 0;
    let level = 1;
    const totalSteps = 20000;
    for (let i = 0; i < totalSteps; i++) {
      const before = level;
      level = proc.step(level, 1 / 12, rng);
      const stepReturn = Math.log(level / before) * 12; // annualized
      if (stepReturn > -0.1) calmSteps += 1; // crude classifier: crisis mean is -0.3, calm is 0.08
    }
    expect(calmSteps / totalSteps).toBeGreaterThan(0.8);
    expect(calmSteps / totalSteps).toBeLessThan(0.97);
  });
});

describe("BlockBootstrapProcess", () => {
  it("only ever compounds returns drawn from the supplied historical series", () => {
    const history = [0.01, -0.02, 0.03, 0.0, -0.01, 0.02];
    const proc = new BlockBootstrapProcess(history, 3);
    const rng = createRng(4);
    const path = proc.simulatePath(100, 24, 1, rng);
    // Reconstruct implied per-step log-returns and check each is one of the historical values.
    let prev = 100;
    for (const level of path) {
      const impliedReturn = Math.log(level / prev);
      const matches = history.some((h) => Math.abs(h - impliedReturn) < 1e-9);
      expect(matches).toBe(true);
      prev = level;
    }
  });
});

describe("IIDProcess", () => {
  it("draws are independent of the previous level", () => {
    const proc = new IIDProcess(new NormalDistribution(5, 1));
    const rng = createRng(6);
    const path = proc.simulatePath(999, 20_000, 1, rng);
    const mean = path.reduce((a, b) => a + b, 0) / path.length;
    // sd=1 over 20,000 draws -> SE ~ 0.007; toBeCloseTo(5, 1) allows 0.05, comfortably wide.
    expect(mean).toBeCloseTo(5, 1);
  });
});

describe("samplePoisson", () => {
  it("sample mean approximates lambda", () => {
    const rng = createRng(8);
    const lambda = 2.5;
    let sum = 0;
    const n = 50_000;
    for (let i = 0; i < n; i++) sum += samplePoisson(lambda, rng);
    expect(sum / n).toBeCloseTo(lambda, 1);
  });
  it("lambda=0 always returns 0", () => {
    const rng = createRng(9);
    for (let i = 0; i < 100; i++) expect(samplePoisson(0, rng)).toBe(0);
  });
});
