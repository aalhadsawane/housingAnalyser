import { EmpiricalDistribution } from "./distributions/Empirical";
import { MixtureDistribution } from "./distributions/Mixture";
import { createDistribution } from "./distributions/index";
import type { DistributionStrategy } from "./distributions/types";
import { BlockBootstrapProcess } from "./processes/BlockBootstrap";
import { GBMProcess } from "./processes/GBM";
import { IIDProcess } from "./processes/IID";
import { MertonJumpDiffusionProcess } from "./processes/MertonJumpDiffusion";
import { OrnsteinUhlenbeckProcess } from "./processes/OrnsteinUhlenbeck";
import { RegimeSwitchingProcess } from "./processes/RegimeSwitching";
import type { ProcessStrategy } from "./processes/types";
import type { DistributionSpec, ProcessSpec } from "./schema";

/**
 * The only place in the app that turns a validated (JSON-serialisable)
 * config spec into a live Strategy object. The UI reads/writes specs; the
 * simulation engine consumes the Strategy objects this factory builds —
 * neither side needs to know about the other's shape.
 */
export function buildDistribution(spec: DistributionSpec): DistributionStrategy {
  if (spec.family === "mixture") {
    if (!spec.components) {
      throw new Error("Mixture distribution spec requires `components: [DistributionSpec, DistributionSpec]`");
    }
    const [a, b] = spec.components;
    return new MixtureDistribution(buildDistribution(a), buildDistribution(b), spec.params.weightA ?? 0.5);
  }
  if (spec.family === "empirical" && spec.data && spec.data.length > 0) {
    return new EmpiricalDistribution(spec.data);
  }
  return createDistribution(spec.family, spec.params);
}

export function buildProcess(spec: ProcessSpec): ProcessStrategy {
  switch (spec.kind) {
    case "iid":
      return new IIDProcess(buildDistribution(spec.shock));
    case "ornsteinUhlenbeck":
      return new OrnsteinUhlenbeckProcess(spec.kappa, spec.theta, spec.sigma, buildDistribution(spec.shock));
    case "gbm":
      return new GBMProcess(spec.mu, spec.sigma, buildDistribution(spec.shock));
    case "mertonJump":
      return new MertonJumpDiffusionProcess(
        spec.mu,
        spec.sigma,
        spec.lambda,
        buildDistribution(spec.jumpSize),
        buildDistribution(spec.shock),
      );
    case "regimeSwitching":
      return new RegimeSwitchingProcess(
        spec.regimes.map((r) => ({ name: r.name, returnDistribution: buildDistribution(r.returnDistribution) })),
        spec.transitionMatrix,
        spec.initialRegimeWeights,
      );
    case "blockBootstrap":
      return new BlockBootstrapProcess(spec.historicalReturns, spec.blockLength);
  }
}
