import * as Comlink from "comlink";
import type { ScenarioConfig } from "./engine/schema";
import type { SimulationResult } from "./engine/simulate";
import type { WorkerApi } from "@/workers/sim.worker";

/**
 * Browser-only entry point for running a simulation: spawns sim.worker.ts
 * on a real OS thread (via the Worker API) so a 5-10 second Monte Carlo run
 * never blocks the main thread the UI's sliders and charts live on. Call
 * `terminate()` when the caller unmounts or starts a new run to free the
 * thread — this module does not pool workers itself.
 */

export interface SimulationHandle {
  run(config: ScenarioConfig, onProgress?: (pathsCompleted: number, totalPaths: number) => void): Promise<SimulationResult>;
  terminate(): void;
}

export function createSimulationWorker(): SimulationHandle {
  const worker = new Worker(new URL("../workers/sim.worker.ts", import.meta.url), { type: "module" });
  const api = Comlink.wrap<WorkerApi>(worker);

  return {
    async run(config, onProgress) {
      // Comlink.proxy() marks the local callback so it's sent as a live,
      // remotely-invokable reference rather than attempting (and failing)
      // to structured-clone a function. Its message channel is scoped to
      // this call and cleaned up when the worker itself is terminated —
      // there is no separate handle to release from this side.
      const proxiedCallback = Comlink.proxy(onProgress ?? (() => {}));
      return api.run(config, proxiedCallback);
    },
    terminate() {
      worker.terminate();
    },
  };
}
