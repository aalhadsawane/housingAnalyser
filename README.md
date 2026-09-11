# Rent vs. Buy — Stochastic Housing Workbench

A Monte Carlo workbench for the India rent-vs-buy decision. Every input — property
appreciation, equity returns, inflation, the repo rate, rent hikes, income growth, repair
costs, and more — is a configurable random variable or stochastic process, not a single
guess. See [`PLAN.md`](./PLAN.md) for the full design.

## Status

Phases 0–2 (engine) and a first vertical slice of Phases 4–5 (UI) are built and verified
end-to-end in a real browser: the parameter rail, distribution/process editor cards, the
Web Worker–driven Monte Carlo simulation, the hero net-worth-vs-time fan chart, and the
summary bar all work together today. See `PLAN.md` section 7 for what's still ahead
(Phases 6–7: the remaining 10+ charts, auto-generated insight text, scenario presets/
sharing, and the optional Python-powered deep-analysis route).

## Getting started

```bash
npm install
npm run dev       # http://localhost:3000
npm test          # Vitest — 115 tests across the engine
npm run build      # production build
```

## Deploying to Vercel

This repo has **not yet been connected to Vercel** — that's a one-time manual step:

1. Go to <https://vercel.com/new> and import this GitHub repository
   (`aalhadsawane/housingAnalyser`).
2. Vercel auto-detects Next.js; no configuration is needed (there is no server-side
   component to configure — the simulation runs entirely in the browser, in a Web Worker).
3. Click Deploy.

Alternatively, from the CLI: `npx vercel login` (interactive browser login), then
`npx vercel --prod` from this directory.

## Repository layout

```
lib/engine/          Pure TypeScript simulation engine (Strategy-pattern
                      distributions & stochastic processes, amortization,
                      India tax rules, buy/rent cash-flow paths, Monte
                      Carlo driver, cross-path statistics)
lib/store.ts          Zustand store for the scenario configuration
lib/simulationClient.ts  Browser-side Web Worker handle
workers/sim.worker.ts    Comlink-wrapped simulation worker
components/config/    Distribution/Process editor cards + parameter rail
components/charts/    Chart components (hero fan chart; more to come)
tests/engine/          Vitest unit + integration tests (115 passing)
```

## Key design decisions

- **Engine runs in the browser** (TypeScript, in a Web Worker), not on a server — see
  `PLAN.md` section 1 for why, and what a Python/Pyodide-in-browser alternative would cost.
- **Strategy pattern throughout**: every distribution family and every stochastic process
  implements a shared interface (`DistributionStrategy` / `ProcessStrategy`) and is looked
  up from a registry — adding a new family/process is additive, with zero changes to the
  simulation loop or UI. See `lib/engine/distributions/` and `lib/engine/processes/`.
- **Total transparency** (PLAN.md section 3.1): every stochastic input's UI card always
  names its distribution family and lets you change it — never a bare, unlabeled slider.
- **Tax is data, not code**: `lib/engine/tax/india.rules.ts` is a single, dated, sourced
  file of Indian tax constants (FY2025-26) — audit or override it there.
