import { BetaDistribution, fitBetaFromPercentiles } from "./Beta";
import { EmpiricalDistribution, fitEmpiricalFromPercentiles } from "./Empirical";
import { FixedDistribution, fitFixedFromPercentiles } from "./Fixed";
import { GammaDistribution, fitGammaFromPercentiles } from "./Gamma";
import { LognormalDistribution, fitLognormalFromPercentiles } from "./Lognormal";
import { MixtureDistribution } from "./Mixture";
import { NormalDistribution, fitNormalFromPercentiles } from "./Normal";
import { PERTDistribution, fitPERTFromPercentiles } from "./PERT";
import { StudentTDistribution, fitStudentTFromPercentiles } from "./StudentT";
import { TriangularDistribution, fitTriangularFromPercentiles } from "./Triangular";
import { UniformDistribution, fitUniformFromPercentiles } from "./Uniform";
import type { DistributionFamily, DistributionStrategy } from "./types";

export * from "./types";
export {
  BetaDistribution,
  EmpiricalDistribution,
  FixedDistribution,
  GammaDistribution,
  LognormalDistribution,
  MixtureDistribution,
  NormalDistribution,
  PERTDistribution,
  StudentTDistribution,
  TriangularDistribution,
  UniformDistribution,
};

/**
 * The registry. This is the one place that knows every concrete
 * distribution class — everywhere else in the app (simulation loop, UI
 * family dropdown, config validation) goes through `createDistribution` /
 * `DISTRIBUTION_REGISTRY` and never imports a concrete class directly.
 * Adding a family means adding one entry here.
 */
export const DISTRIBUTION_REGISTRY: Record<
  DistributionFamily,
  {
    label: string;
    create: (params: Record<string, number>) => DistributionStrategy;
    /** Fit family parameters from three elicited percentiles (P10, P50, P90). Some families need extra context (e.g. Beta/mixture bounds), passed via `extra`. */
    fitFromPercentiles: (p10: number, p50: number, p90: number, extra?: Record<string, number>) => DistributionStrategy;
  }
> = {
  fixed: {
    label: "Fixed",
    create: (p) => new FixedDistribution(p.value ?? 0),
    fitFromPercentiles: (_p10, p50) => fitFixedFromPercentiles(p50),
  },
  normal: {
    label: "Normal",
    create: (p) => new NormalDistribution(p.mu ?? 0, p.sigma ?? 1),
    fitFromPercentiles: (p10, p50, p90) => fitNormalFromPercentiles(p10, p50, p90),
  },
  lognormal: {
    label: "Lognormal",
    create: (p) => new LognormalDistribution(p.muLog ?? 0, p.sigmaLog ?? 1),
    fitFromPercentiles: (p10, p50, p90) => fitLognormalFromPercentiles(p10, p50, p90),
  },
  studentT: {
    label: "Student-t",
    create: (p) => new StudentTDistribution(p.df ?? 5, p.mu ?? 0, p.sigma ?? 1),
    fitFromPercentiles: (p10, p50, p90, extra) => fitStudentTFromPercentiles(p10, p50, p90, extra?.df ?? 5),
  },
  triangular: {
    label: "Triangular",
    create: (p) => new TriangularDistribution(p.min ?? 0, p.mode ?? 0.5, p.max ?? 1),
    fitFromPercentiles: (p10, p50, p90) => fitTriangularFromPercentiles(p10, p50, p90),
  },
  pert: {
    label: "PERT",
    create: (p) => new PERTDistribution(p.min ?? 0, p.mode ?? 0.5, p.max ?? 1, p.lambda ?? 4),
    fitFromPercentiles: (p10, p50, p90) => fitPERTFromPercentiles(p10, p50, p90),
  },
  uniform: {
    label: "Uniform",
    create: (p) => new UniformDistribution(p.a ?? 0, p.b ?? 1),
    fitFromPercentiles: (p10, _p50, p90) => fitUniformFromPercentiles(p10, p90),
  },
  beta: {
    label: "Beta",
    create: (p) => new BetaDistribution(p.alpha ?? 2, p.beta ?? 2, p.a ?? 0, p.b ?? 1),
    fitFromPercentiles: (p10, p50, p90, extra) =>
      fitBetaFromPercentiles(p10, p50, p90, extra?.a ?? 0, extra?.b ?? 1),
  },
  gamma: {
    label: "Gamma",
    create: (p) => new GammaDistribution(p.shape ?? 2, p.scale ?? 1),
    fitFromPercentiles: (p10, p50, p90) => fitGammaFromPercentiles(p10, p50, p90),
  },
  empirical: {
    label: "Empirical (historical)",
    create: (p) => {
      // Empirical data is an array, not a scalar param map; callers with real
      // data should construct `new EmpiricalDistribution(data)` directly.
      // This registry path exists so percentile-entry mode still works.
      return fitEmpiricalFromPercentiles(p.p10 ?? 0, p.p50 ?? 0.5, p.p90 ?? 1);
    },
    fitFromPercentiles: (p10, p50, p90) => fitEmpiricalFromPercentiles(p10, p50, p90),
  },
  mixture: {
    label: "Mixture",
    create: (_p) => {
      throw new Error(
        "Mixture distributions are composed from two component DistributionStrategy instances via `new MixtureDistribution(a, b, weightA)`, not created from the flat params registry.",
      );
    },
    fitFromPercentiles: () => {
      throw new Error("Mixture distributions are not fit from percentiles directly — fit each component instead.");
    },
  },
};

export function createDistribution(family: DistributionFamily, params: Record<string, number>): DistributionStrategy {
  return DISTRIBUTION_REGISTRY[family].create(params);
}

export function fitFromPercentiles(
  family: DistributionFamily,
  p10: number,
  p50: number,
  p90: number,
  extra?: Record<string, number>,
): DistributionStrategy {
  return DISTRIBUTION_REGISTRY[family].fitFromPercentiles(p10, p50, p90, extra);
}
