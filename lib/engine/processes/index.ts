import { BlockBootstrapProcess } from "./BlockBootstrap";
import { GBMProcess } from "./GBM";
import { IIDProcess } from "./IID";
import { MertonJumpDiffusionProcess } from "./MertonJumpDiffusion";
import { OrnsteinUhlenbeckProcess } from "./OrnsteinUhlenbeck";
import { RegimeSwitchingProcess } from "./RegimeSwitching";
import type { ProcessKind } from "./types";

export * from "./types";
export {
  BlockBootstrapProcess,
  GBMProcess,
  IIDProcess,
  MertonJumpDiffusionProcess,
  OrnsteinUhlenbeckProcess,
  RegimeSwitchingProcess,
};
export { samplePoisson } from "./util";
export type { Regime } from "./RegimeSwitching";

/**
 * Human-readable metadata for the UI's process picker. Unlike the
 * distribution registry, processes take structurally different constructor
 * arguments (a Regime[] vs. a jump-size distribution vs. a historical
 * series) so there is no single flat `create(params)` here — the config
 * schema (lib/engine/schema.ts) builds each concrete process from its own
 * validated shape. This map exists so the UI can list kinds and labels
 * generically.
 */
export const PROCESS_KIND_LABELS: Record<ProcessKind, string> = {
  iid: "IID draws",
  ornsteinUhlenbeck: "Ornstein-Uhlenbeck (mean-reverting)",
  gbm: "Geometric Brownian Motion",
  mertonJump: "Merton jump-diffusion",
  regimeSwitching: "Regime-switching",
  blockBootstrap: "Block bootstrap (historical)",
};
