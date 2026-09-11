import { describe, expect, it } from "vitest";
import { createRng } from "@/lib/engine/rng";
import { LognormalDistribution } from "@/lib/engine/distributions/Lognormal";
import { NormalDistribution } from "@/lib/engine/distributions/Normal";
import { GBMProcess } from "@/lib/engine/processes/GBM";
import { MertonJumpDiffusionProcess } from "@/lib/engine/processes/MertonJumpDiffusion";
import { OrnsteinUhlenbeckProcess } from "@/lib/engine/processes/OrnsteinUhlenbeck";

describe("stepWithShock matches each process's own closed-form step formula", () => {
  it("OrnsteinUhlenbeckProcess", () => {
    const proc = new OrnsteinUhlenbeckProcess(0.3, 0.06, 0.02, new NormalDistribution(0, 1));
    const level = 0.08;
    const dt = 1 / 12;
    const z = 1.234;
    const actual = proc.stepWithShock(level, dt, z);
    const expected = level + 0.3 * (0.06 - level) * dt + 0.02 * Math.sqrt(dt) * z;
    expect(actual).toBeCloseTo(expected, 10);
  });

  it("GBMProcess", () => {
    const proc = new GBMProcess(0.08, 0.18, new NormalDistribution(0, 1));
    const level = 100;
    const dt = 1 / 12;
    const z = -0.5;
    const actual = proc.stepWithShock(level, dt, z);
    const expected = level * Math.exp((0.08 - 0.5 * 0.18 * 0.18) * dt + 0.18 * Math.sqrt(dt) * z);
    expect(actual).toBeCloseTo(expected, 8);
  });

  it("MertonJumpDiffusionProcess with lambda=0 matches the GBM formula exactly (no jumps possible)", () => {
    const jumpSize = new LognormalDistribution(-0.1, 0.05);
    const proc = new MertonJumpDiffusionProcess(0.08, 0.18, 0, jumpSize, new NormalDistribution(0, 1));
    const level = 100;
    const dt = 1 / 12;
    const z = 0.7;
    const rng = createRng(1);
    const actual = proc.stepWithShock(level, dt, z, rng);
    const expected = level * Math.exp((0.08 - 0.5 * 0.18 * 0.18) * dt + 0.18 * Math.sqrt(dt) * z);
    expect(actual).toBeCloseTo(expected, 8);
  });

  it("feeding the same standardized shock twice gives identical results (pure function of level/dt/shock, no hidden state)", () => {
    const proc = new OrnsteinUhlenbeckProcess(0.3, 0.06, 0.02, new NormalDistribution(0, 1));
    const a = proc.stepWithShock(0.08, 1 / 12, 0.5);
    const b = proc.stepWithShock(0.08, 1 / 12, 0.5);
    expect(a).toBe(b);
  });
});
