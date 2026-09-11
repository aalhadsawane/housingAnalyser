import * as Comlink from "comlink";
import { runSimulation, type SimulationResult } from "@/lib/engine/simulate";
import type { ScenarioConfig } from "@/lib/engine/schema";

/**
 * Runs the Monte Carlo simulation off the main thread so the UI (sliders,
 * distribution previews, the rest of the page) stays responsive during a
 * 5-10 second run. Progress is throttled to a fixed number of postMessage
 * calls regardless of path count — reporting every single path across the
 * worker boundary would itself become a meaningful cost at 5,000+ paths.
 */

export interface WorkerApi {
  run(config: ScenarioConfig, onProgress: (pathsCompleted: number, totalPaths: number) => void): Promise<SimulationResult>;
}

const PROGRESS_UPDATES_TARGET = 100; // roughly this many onProgress calls across a full run, regardless of numPaths

const api: WorkerApi = {
  async run(config, onProgress) {
    const reportEvery = Math.max(1, Math.floor(config.meta.numPaths / PROGRESS_UPDATES_TARGET));
    const result = runSimulation(config, {
      onProgress: (pathsCompleted, totalPaths) => {
        if (pathsCompleted % reportEvery === 0 || pathsCompleted === totalPaths) {
          onProgress(pathsCompleted, totalPaths);
        }
      },
    });
    return result;
  },
};

Comlink.expose(api);
