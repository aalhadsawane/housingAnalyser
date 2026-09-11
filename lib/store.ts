import { create } from "zustand";
import { DEFAULT_SCENARIO_CONFIG } from "./engine/defaults";
import type { ScenarioConfig } from "./engine/schema";
import type { SimulationResult } from "./engine/simulate";

/**
 * Single global store for the scenario configuration and the latest
 * simulation result. Components read the slice they need via a selector
 * and write back through `updateConfig`, which takes an immutable updater
 * function — this keeps DistributionCard/ProcessCard fully generic (they
 * only ever see `{ spec, onChange }`), while each call site in the
 * parameter rail supplies the specific path being edited.
 */

interface SimulationRunState {
  status: "idle" | "running" | "done" | "error";
  progress: number; // 0..1
  result: SimulationResult | null;
  error: string | null;
}

interface ScenarioStore {
  config: ScenarioConfig;
  setConfig: (config: ScenarioConfig) => void;
  updateConfig: (updater: (config: ScenarioConfig) => ScenarioConfig) => void;
  run: SimulationRunState;
  setRun: (run: Partial<SimulationRunState>) => void;
}

export const useScenarioStore = create<ScenarioStore>((set) => ({
  config: DEFAULT_SCENARIO_CONFIG,
  setConfig: (config) => set({ config }),
  updateConfig: (updater) => set((state) => ({ config: updater(state.config) })),
  run: { status: "idle", progress: 0, result: null, error: null },
  setRun: (run) => set((state) => ({ run: { ...state.run, ...run } })),
}));
