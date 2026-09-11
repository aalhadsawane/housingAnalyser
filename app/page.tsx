"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { NetWorthFanChart } from "@/components/charts/NetWorthFanChart";
import { ParameterRail } from "@/components/config/ParameterRail";
import { SummaryBar } from "@/components/SummaryBar";
import { computeDecisionSummary, computeFanBands } from "@/lib/engine/stats";
import { createSimulationWorker, type SimulationHandle } from "@/lib/simulationClient";
import { useScenarioStore } from "@/lib/store";

export default function Home() {
  const config = useScenarioStore((s) => s.config);
  const run = useScenarioStore((s) => s.run);
  const setRun = useScenarioStore((s) => s.setRun);
  const handleRef = useRef<SimulationHandle | null>(null);

  useEffect(() => {
    return () => handleRef.current?.terminate();
  }, []);

  async function handleRun() {
    setRun({ status: "running", progress: 0, error: null });
    handleRef.current?.terminate();
    const handle = createSimulationWorker();
    handleRef.current = handle;
    try {
      const result = await handle.run(config, (done, total) => {
        setRun({ progress: done / total });
      });
      setRun({ status: "done", progress: 1, result });
    } catch (err) {
      setRun({ status: "error", error: err instanceof Error ? err.message : String(err) });
    }
  }

  const bands = useMemo(() => {
    if (!run.result) return null;
    return {
      buy: computeFanBands(run.result.buyNetWorth),
      rent: computeFanBands(run.result.rentNetWorth),
    };
  }, [run.result]);

  const summary = useMemo(() => {
    if (!run.result) return null;
    return computeDecisionSummary(run.result.buyNetWorth, run.result.rentNetWorth);
  }, [run.result]);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-black/10 px-4 py-3 dark:border-white/10">
        <h1 className="text-[17px] font-semibold tracking-tight">Rent vs. Buy — Stochastic Housing Workbench</h1>
        <p className="text-[12px] text-neutral-500">
          Every input on the left is a random variable you control — its distribution family is always named, and
          you can change it. Results are a Monte Carlo distribution of outcomes, not a single guess.
        </p>
      </header>

      <div className="flex flex-1 gap-4 px-4 py-3">
        <ParameterRail />

        <main className="min-w-0 flex-1">
          <SummaryBar summary={summary} />

          <div className="mb-4 flex items-center gap-3">
            <button
              onClick={handleRun}
              disabled={run.status === "running"}
              className="rounded-md bg-[#6d67e4] px-4 py-1.5 text-[13px] font-medium text-white disabled:opacity-50"
            >
              {run.status === "running" ? `Running… ${(run.progress * 100).toFixed(0)}%` : "Run simulation"}
            </button>
            <span className="text-[12px] text-neutral-400">
              {config.meta.numPaths.toLocaleString("en-IN")} paths × {config.meta.horizonYears} years, seed{" "}
              {config.meta.seed}
            </span>
            {run.status === "error" && <span className="text-[12px] text-red-500">Error: {run.error}</span>}
          </div>

          {bands ? (
            <NetWorthFanChart
              buyBands={bands.buy}
              rentBands={bands.rent}
              breakevenMonth={summary?.breakevenMonthMedian ?? null}
            />
          ) : (
            <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-black/15 text-[13px] text-neutral-400 dark:border-white/15">
              Configure the scenario on the left, then run the simulation to see the buy-vs-rent net worth chart.
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
