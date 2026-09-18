"use client";

import { useEffect, useMemo, useRef } from "react";
import { AdvantageDecomposition } from "@/components/charts/AdvantageDecomposition";
import { BreakevenHistogram } from "@/components/charts/BreakevenHistogram";
import { NetWorthFanChart } from "@/components/charts/NetWorthFanChart";
import { SensitivityTornado } from "@/components/charts/SensitivityTornado";
import { WealthDifferenceDistributions } from "@/components/charts/WealthDifferenceDistributions";
import { WinnerMarginChart } from "@/components/charts/WinnerMarginChart";
import { WinProbabilityChart } from "@/components/charts/WinProbabilityChart";
import { ParameterRail } from "@/components/config/ParameterRail";
import { DecisionHeader } from "@/components/DecisionHeader";
import {
  computeAdvantageDecomposition,
  computeBreakevenMonths,
  computeDecisionSummary,
  computeDeltaHistogramAtMonth,
  computeFanBands,
  computeSensitivityTornado,
  computeWinnerMarginByMonth,
  computeWinProbabilityByMonth,
} from "@/lib/engine/stats";
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

  const summary = useMemo(() => {
    if (!run.result) return null;
    return computeDecisionSummary(run.result.buyNetWorth, run.result.rentNetWorth);
  }, [run.result]);

  const winProbabilityByMonth = useMemo(() => {
    if (!run.result) return null;
    return computeWinProbabilityByMonth(run.result.buyNetWorth, run.result.rentNetWorth);
  }, [run.result]);

  const breakevenMonths = useMemo(() => {
    if (!run.result) return null;
    return computeBreakevenMonths(run.result.buyNetWorth, run.result.rentNetWorth);
  }, [run.result]);

  const winnerMarginByMonth = useMemo(() => {
    if (!run.result) return null;
    return computeWinnerMarginByMonth(run.result.buyNetWorth, run.result.rentNetWorth);
  }, [run.result]);

  const deltaHistograms = useMemo(() => {
    if (!run.result) return null;
    const months = run.result.months;
    const yearTargets = [3, 5, 10, 20].filter((y) => y * 12 <= months);
    return yearTargets.map((y) => ({
      yearLabel: `After ${y} year${y === 1 ? "" : "s"}`,
      histogram: computeDeltaHistogramAtMonth(run.result!.buyNetWorth, run.result!.rentNetWorth, y * 12 - 1),
    }));
  }, [run.result]);

  const tornado = useMemo(() => {
    if (!run.result) return null;
    return computeSensitivityTornado(run.result.driverSummaries, run.result.buyNetWorth, run.result.rentNetWorth);
  }, [run.result]);

  const advantageDecomposition = useMemo(() => {
    if (!run.result) return null;
    return computeAdvantageDecomposition(run.result.buyDecompositions, run.result.rentDecompositions);
  }, [run.result]);

  const fanBands = useMemo(() => {
    if (!run.result) return null;
    return { buy: computeFanBands(run.result.buyNetWorth), rent: computeFanBands(run.result.rentNetWorth) };
  }, [run.result]);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-black/10 px-4 py-3 dark:border-white/10">
        <h1 className="text-[17px] font-semibold tracking-tight">Rent vs. Buy — Stochastic Housing Workbench</h1>
        <p className="text-[12px] text-neutral-500">
          Every input on the left is a random variable you control — its distribution family is always named, and
          you can change it. Results below are a distribution of outcomes, not a single guess.
        </p>
      </header>

      <div className="flex flex-1 gap-4 px-4 py-3">
        <ParameterRail />

        <main className="min-w-0 flex-1 pb-24">
          <div className="mb-4 flex items-center gap-3">
            <button
              onClick={handleRun}
              disabled={run.status === "running"}
              className="rounded-md bg-[#6d67e4] px-4 py-1.5 text-[13px] font-medium text-white disabled:opacity-50"
            >
              {run.status === "running" ? `Running… ${(run.progress * 100).toFixed(0)}%` : "Run simulation"}
            </button>
            <span className="text-[12px] text-neutral-400">
              {config.meta.numPaths.toLocaleString("en-IN")} scenarios × {config.meta.horizonYears} years, seed{" "}
              {config.meta.seed}
            </span>
            {run.status === "error" && <span className="text-[12px] text-red-500">Error: {run.error}</span>}
          </div>

          {!run.result ? (
            <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-black/15 text-[13px] text-neutral-400 dark:border-white/15">
              Configure the scenario on the left, then run the simulation to see the decision.
            </div>
          ) : (
            <div className="grid gap-4">
              <DecisionHeader summary={summary} horizonYears={config.meta.horizonYears} />

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-black/10 bg-white/70 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                  {winProbabilityByMonth && <WinProbabilityChart winProbabilityByMonth={winProbabilityByMonth} />}
                </div>
                <div className="rounded-xl border border-black/10 bg-white/70 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                  {breakevenMonths && <BreakevenHistogram breakevenMonths={breakevenMonths} />}
                </div>
              </div>

              <div className="rounded-xl border border-black/10 bg-white/70 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                {winnerMarginByMonth && <WinnerMarginChart points={winnerMarginByMonth} />}
              </div>

              <div className="rounded-xl border border-black/10 bg-white/70 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                {deltaHistograms && <WealthDifferenceDistributions histograms={deltaHistograms} />}
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-black/10 bg-white/70 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                  {tornado && <SensitivityTornado entries={tornado} />}
                </div>
                <div className="rounded-xl border border-black/10 bg-white/70 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                  {advantageDecomposition && <AdvantageDecomposition decomposition={advantageDecomposition} />}
                </div>
              </div>

              <details className="rounded-xl border border-black/10 bg-white/70 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                <summary className="cursor-pointer text-[13px] font-semibold text-neutral-600 dark:text-neutral-300">
                  Show detailed wealth trajectories over time
                </summary>
                <p className="mb-2 mt-2 text-[11px] text-neutral-500">
                  For readers comfortable with percentile bands: median net worth over time for each choice, with the
                  middle 80% of scenarios shaded.
                </p>
                {fanBands && (
                  <NetWorthFanChart
                    buyBands={fanBands.buy}
                    rentBands={fanBands.rent}
                    breakevenMonth={summary?.breakevenMonthMedian ?? null}
                  />
                )}
              </details>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
