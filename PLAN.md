# Rent vs. Buy — Stochastic Housing Decision Workbench
### Detailed design & implementation plan (v1, for review)

---

## 0. What we are actually building

A **Monte Carlo workbench** that answers one question — *rent or buy a 2BHK?* — not with a
single number but with a **distribution of outcomes**, because every input (appreciation,
rent hikes, equity returns, interest rates, inflation) is a random variable and several of
them are *stochastic processes*, not one-shot draws.

The object of comparison is **terminal and path-wise net worth**, under the discipline that
both branches are **capital-neutral at t=0**: the renter invests exactly the money the buyer
sinks into the down payment + closing costs, and thereafter invests (or liquidates) the
monthly cash-flow difference. Without that discipline every rent-vs-buy calculator is
rigged, and most are.

**Audience:** you and people like you — comfortable with SDEs and copulas, not with
`npm install`. So: no code, no notebooks, no config files. Sliders, distribution pickers with
live PDF previews, named presets, and charts that carry the argument.

---

## 1. Architecture decision (the one thing I want your sign-off on)

You asked for Python's ecosystem *and* a Vercel-hosted site. Those pull in opposite
directions. Three options:

| | Where sim runs | Latency per re-run | Cost | Python? |
|---|---|---|---|---|
| **A. TS engine in a Web Worker** | User's browser | ~0.3–1.0 s for 10k paths × 360 months | Free, no server | Python used offline for validation/calibration |
| **B. Vercel Python serverless (numpy/scipy)** | Server | 2–6 s cold start + 0.5 s compute + network, every slider move | Function invocations; timeout ceilings | Yes, at runtime |
| **C. Pyodide (numpy in WASM, in-browser)** | User's browser | ~6–10 MB download + 3–5 s init, then fast | Free | Yes, at runtime |

**My recommendation: A**, with Python kept as a first-class *offline* citizen.

Reasoning: the entire value of this tool is the tight loop — nudge the appreciation drift,
watch P(buy wins) move. Option B puts a network round trip and a cold start inside that loop
and it will feel dead. Option C pays a 10 MB tax on first load to import numpy so we can
call `np.random.normal`, which is roughly 40 lines of TypeScript. The math we need — PCG32,
Ziggurat normals, Cholesky, GBM/OU/jump-diffusion, percentiles, Spearman, Sobol — is all
short, all testable, and runs 10–50× faster in a Worker than any round trip.

**Python's actual job**, which is real and not a consolation prize:
1. `research/reference_model.py` — an independent numpy/scipy implementation of the same
   model. The TS engine must match it to within Monte Carlo error on a fixed seed grid
   (golden-file parity tests). Two independent implementations agreeing is the only
   cheap protection against a silent off-by-one in the amortisation schedule.
2. **Calibration** — fit distributions to actual history (NHB Residex / city house-price
   indices, CPI, RBI repo, NIFTY total-return, city rental yields), and emit the fitted
   parameters as the app's shipped presets. scipy/statsmodels/`arch` earn their keep here.
3. **Heavy analytics offline** — Sobol indices via SALib, block-bootstrap studies,
   regime-fitting — results baked in as presets rather than computed live.
4. *(Stretch, Phase 7)* A Python serverless route `/api/deep` for genuinely expensive
   analyses the user opts into and waits for — full Saltelli Sobol, 1M-path runs. Opt-in,
   outside the interactive loop, so its latency is honest.

If you'd rather have Python at runtime, say so and I'll build C instead — the engine is
written behind an interface either way, so it's a swap, not a rewrite.

---

## 2. The model

Time is **monthly**, `t = 1..T` (`T = 12 × horizon_years`, default 20, configurable to 40).
Everything below is a configurable input unless marked *derived*.

### 2.1 State at t = 0

- Liquid capital `W0` — **default ₹21,00,000** (your mutual-fund corpus), configurable.
- Both branches start with `W0`. That is the whole point.

### 2.2 BUY branch

**Acquisition**
- Purchase price `P0` (2BHK, default ~₹1.2 Cr — set per city preset), carpet/built-up area.
- Down payment fraction `d` (default 20%), subject to `d·P0 + closing ≤ W0` (violation is
  flagged in the UI, not silently allowed).
- Stamp duty (state-dependent: MH 6% incl. metro cess, KA ~6.5%, women-buyer concession
  toggle), registration (1%, capped ₹30k in MH), brokerage 1–2%, legal/due-diligence,
  GST 5% if under-construction (nil for ready-with-OC), parking, society corpus/amenity
  deposit, interiors & furnishing capex.
- **Under-construction path** (toggle): possession delay ~ stochastic (lognormal or
  empirical, median 6–18 months), during which the buyer pays **pre-EMI + rent
  simultaneously** — this is the single most under-modelled risk in Indian housing and it
  gets its own switch.

**Financing**
- Loan `L = P0 − d·P0` *(derived)*, tenure (default 20y), fixed vs **floating**.
- Floating rate as a **mean-reverting process** (Vasicek/OU on repo rate + lender spread),
  or regime-switching, or AR(1) — user picks the process and its parameters.
- On a rate change: **EMI reset** vs **tenure reset** (Indian lenders default to tenure
  reset; it changes the answer materially).
- Prepayment policy: none / fixed annual lump sum / % of annual bonus / "prepay whenever
  surplus > X" — with prepayment penalty config (nil for floating retail loans).
- Processing fee, optional loan-protection insurance premium.

**Carrying costs** (each with its own escalation process, defaulting to CPI-linked)
- Society maintenance ₹/sqft/month.
- Property tax (% of assessed value, annual).
- Home insurance.
- **Repairs**: routine (% of value/yr) **plus lumpy** — Poisson arrivals with lognormal
  severity (the ₹4 lakh leak in year 11). Modelling repairs as a smooth percentage is a lie
  the distribution should not tell.
- Sinking-fund / society special assessments.

**Asset value**
- `P_t` via a user-chosen process: **GBM** (drift `μ_h`, vol `σ_h`), or **Merton
  jump-diffusion** (crash risk), or **mean-reverting on price-to-rent or price-to-income**
  (economically the most defensible — bubbles deflate), or regime-switching
  (boom/normal/bust with a transition matrix), or block-bootstrap from historical index data.
- Optional **land/structure split**: land appreciates, structure depreciates at `δ`/yr.
  Matters a lot at 25–30 year horizons and almost no calculator does it.

**Tax** (all parameterised — see §2.5)
- §24(b) home-loan interest deduction, cap ₹2,00,000/yr, self-occupied, **old regime only**.
- §80C principal + (year-1) stamp duty & registration, within the ₹1.5L cap and net of
  whatever headroom your EPF/ELSS already consumes (configurable).
- Marginal rate from a configurable slab table; **old vs new regime toggle**, and an
  "optimise regime each year" option.

**Exit at T (or on a forced-sale event)**
- Sale brokerage 1–2%, illiquidity haircut, time-to-sell (months of carrying cost).
- LTCG on property (holding > 24 months): configurable rate; default 12.5% without
  indexation, with the pre-23-Jul-2024 "lower of 12.5% w/o indexation or 20% with
  indexation" election available as a toggle. §54 / §54EC reinvestment exemption toggles.
- Outstanding loan principal repaid from proceeds *(derived)*.

**Buy net worth** *(derived, every t)*:
`NW_buy(t) = P_t − outstanding_principal(t) + side_portfolio(t) − latent_sale_costs_and_tax(t)`
(with a toggle for whether to mark exit costs to market continuously or only at T — the
former is the honest one and makes the crossover chart tell the truth).

### 2.3 RENT branch

- Base rent `R0` ₹/month, or derived from a **gross rental yield** on `P0` (default 2.5–3.5%
  in Indian metros — this ratio *is* the decision, so it gets first-class UI treatment).
- Security deposit (2–3 months Mumbai/Pune, up to 10 months Bengaluru) — locked capital,
  returned at exit with a configurable probability/severity of partial forfeiture.
- **Rent hike**: annual, at lease anniversary, drawn from a distribution and optionally
  correlated with CPI; cap/collar config (many leases specify 5% or 10%).
- **Moving**: every `k` years (or Poisson-driven), costing brokerage (≈1 month rent),
  packers, deposit-float friction, and a configurable disruption cost.
- Renter's insurance; no property tax, no maintenance, no structural repair exposure.
- **HRA exemption** (old regime): `min(HRA received, rent − 10%·(basic+DA), 50%/40%·(basic+DA))`
  — configurable salary, basic %, HRA %, metro flag. This is a large, real, frequently
  ignored subsidy to renting for salaried Indians.

**Investment of the differential**
- t=0: renter invests `W0 − deposit`.
- Each month: `Δ = (EMI + maintenance + property tax + insurance + repairs) − (rent + renter's insurance)`.
  If `Δ > 0` the renter invests it; if `Δ < 0` they liquidate (with tax drag). Sign
  convention handled symmetrically — no "renter magically never dips into savings".
- Portfolio: equity/debt allocation with rebalancing, each leg its own return process
  (GBM or bootstrap or regime-switching), **correlated with property returns** (§2.4),
  expense ratio, exit load, SIP step-up with income growth.
- Taxes: equity LTCG 12.5% above the ₹1.25L/yr exemption (>12m), STCG 20%, debt at slab —
  all parameterised. Optional "tax-aware harvesting" toggle that uses the annual exemption.
- Behavioural realism switch: **investment discipline factor** (0–100% of the theoretical
  surplus actually gets invested). The honest counterweight to "renting wins on paper".

**Rent net worth** *(derived)*: `NW_rent(t) = portfolio(t) − liquidation_tax(t) + deposit_recoverable(t)`

### 2.4 Macro layer & dependence structure

Shared latent drivers, simulated once per path and consumed by both branches:

| Driver | Default process | Feeds |
|---|---|---|
| CPI inflation | AR(1) / OU around target | maintenance, property tax, insurance, rent drift, income |
| Policy/repo rate | Vasicek OU (+ optional regime) | floating loan rate, debt returns |
| Property appreciation | GBM / jump / mean-reverting on P/R | `P_t` |
| Equity return | GBM / bootstrap / regime | portfolio |
| Rent growth | AR(1) around CPI + spread | `R_t` |
| Income growth | AR(1) + promotion jumps | SIP step-up, affordability, tax slab |

**Correlation**: user-editable correlation matrix over the driving shocks, made
positive-semi-definite (nearest-PSD projection) and applied via **Cholesky**. Defaults ship
with a calibrated matrix; the UI shows it as an editable heatmap with a PSD warning light.
Optional **Student-t copula** (heavy joint tails — equity crash *and* property crash
together, which is exactly the scenario that ruins a leveraged buyer).

### 2.5 Life events (optional, each toggleable)

- **Relocation shock**: Poisson arrival → buyer forced to sell (costs + possibly short
  holding → STCG) or convert to let-out (rental income, 30% standard deduction, full
  interest deduction, but vacancy risk); renter just moves.
- **Job loss**: income interruption of stochastic length → EMI stress, probability of
  default/forced sale; renter can downsize.
- **Upsizing** at a life event (child, marriage): buyer sells+rebuys (double transaction
  cost) or renter just signs a bigger lease.
- **Imputed utility of ownership**: a configurable ₹/month subjective premium (security,
  freedom to renovate, no landlord). Default 0, visible and explicit rather than smuggled in.

### 2.6 Tax rules are data, not code

All Indian tax parameters live in a single versioned, dated, **user-editable** table
(`lib/engine/tax/india.rules.ts`) — slabs, §24(b) cap, §80C cap, HRA formula coefficients,
LTCG rates and holding periods, exemption thresholds, stamp-duty by state. Two reasons:
tax law changes every February, and my defaults should be *your* defaults to audit and
override, not hard-coded assertions buried in a function. Every default carries a
`source` and `asOf` field surfaced in a tooltip.

---

## 3. The distribution editor (the feature that makes this yours, not a calculator)

Every numeric input is a **random variable specification**, editable through one consistent
control:

**Families:** Fixed (degenerate) · Normal · Lognormal · Student-t · Triangular · PERT ·
Uniform · Beta (scaled to [a,b]) · Gamma · Empirical/historical · Mixture of any two
(for "80% normal regime, 20% crisis regime").

**Every editor shows:** live PDF/CDF sparkline, mean / sd / median / P5 / P95 readouts that
update as you drag, optional truncation bounds, and — critically — the ability to
**specify by percentiles** ("I believe P10 = 3%, P90 = 11%") with the family's parameters
solved by inverse fit. Economists think in percentiles, not in `σ`.

**Time-varying inputs additionally pick a process:** IID draws · AR(1)/Ornstein-Uhlenbeck
(κ, θ, σ) · GBM (μ, σ) · Merton jump-diffusion (λ, jump size distribution) · 2-or-3-state
regime-switching (per-state μ/σ + transition matrix) · stationary block bootstrap from
historical data. Each process gets its own small preview panel showing 20 sample paths, so
you can *see* what you just specified before committing 10,000 of them.

**Presets:** Mumbai · Pune · Bengaluru · Hyderabad · Delhi-NCR · Chennai, each with
calibrated prices, yields, stamp duty, deposit norms. Plus scenario presets:
"Conservative", "Aggressive appreciation", "2008-style crash in year 5", "Stagflation".

**Reproducibility:** global seed (shown, editable, copyable) so any figure in the app is
exactly reproducible, plus antithetic variates and optional Sobol quasi-MC for smoother
percentile curves at the same path count. Full config is JSON import/export and is encoded
in the URL, so a scenario is a **shareable link** — you can send a colleague the exact
parameterisation behind a claim.

---

## 4. Outputs — the charts, and what each is *for*

> Charts get designed under the `dataviz` skill (consistent palette, light/dark, accessible).
> Every chart has a one-line "how to read this" and exports to PNG/SVG/CSV.

**Required by you — the time comparison:**
1. **Net worth vs. time, Buy vs Rent — fan chart.** Two median lines, each with 10/25/75/90
   percentile bands, the **crossover point annotated**, and a shaded region showing where
   the two distributions overlap (i.e. where the "winner" is not statistically meaningful).
   This is the hero chart.

**The decision:**
2. **Distribution of ΔNW = NW_buy − NW_rent at horizon** — KDE/histogram with P(buy wins),
   median advantage, and **CVaR₅** (how bad is the bad case for each choice).
3. **Breakeven-horizon distribution** — histogram of the first year buying overtakes
   renting, plus the % of paths where it never does. Converts "should I buy?" into
   "how long must I stay?", which is the actionable form of the question.
4. **P(buy wins) vs. horizon** — a single monotone-ish curve that tells you the minimum
   commitment period. Pairs with (3).

**Drivers and insight:**
5. **Tornado / sensitivity chart** — standardised regression betas and Spearman rank
   correlations of each sampled input against ΔNW, computed from the *existing* paths
   (free). Answers "what actually decides this?" — usually appreciation drift vs equity
   return, and almost never property tax.
6. **Two-way heatmap of P(buy wins)** over any two chosen parameters (e.g. appreciation
   drift × equity return; price × rental yield), with the indifference contour drawn at 50%.
7. **Indifference curve**: required property appreciation to break even, as a function of
   horizon, given your equity assumption. The cleanest single statement the model can make.
8. *(Phase 7, offline/opt-in)* **Sobol first-order & total-effect indices** — interaction
   effects that rank correlations miss.

**Mechanics and diagnostics:**
9. **Monthly cash-flow comparison over time** — EMI + carrying costs vs rent, stacked, with
   the crossover where rent overtakes ownership outflow; band-shaded for uncertainty.
10. **Loan amortisation & LTV** — principal vs interest split over time, equity build-up,
    and **P(underwater)** by month, the leveraged-buyer risk that fan charts hide.
11. **Portfolio vs property value** fan charts side by side (gross, pre-netting).
12. **Affordability / stress**: EMI-to-income ratio distribution over time, and
    P(payment stress) given the income process.
13. **Real vs nominal toggle** across every chart — a 20-year nominal chart flatters
    property; economists will want the deflated version and should get it in one click.
14. **Single-path explorer** — pick a percentile path (median, P10, P90, or a seed) and walk
    through it year by year as a table + annotated chart. Invaluable for sanity-checking the
    model and for explaining it to someone else.
15. **Scenario A/B overlay** — two full configs compared on the same axes.

**Auto-generated insight panel** (plain English, regenerated on every run):
> *"Buying wins in **63%** of scenarios over 20 years, with a median advantage of ₹41.2 L —
> but the 5% worst outcomes leave you ₹58 L behind. The dominant driver is property
> appreciation (rank ρ = 0.51); below **5.8% p.a.** nominal appreciation, renting wins at the
> median. Typical breakeven: **year 9** (IQR 7–13). Your down payment plus closing costs
> consume 94% of liquid capital, leaving no emergency buffer — see the payment-stress chart."*

Templated, not LLM-generated: deterministic, reproducible, auditable.

---

## 5. Tech stack

- **Next.js 15 (App Router) + TypeScript**, deployed on Vercel. Mostly client components;
  the simulation never touches a server.
- **UI**: Tailwind + shadcn/ui. Layout: left parameter rail (collapsible, grouped
  Property / Loan / Rent / Investment / Macro / Tax / Life), centre chart canvas, right
  insight panel. Sticky summary bar with P(buy wins) + median Δ + breakeven, always visible.
- **Charts**: Observable Plot (D3-based, concise, excellent for fan charts, heatmaps,
  histograms) in a thin React wrapper; custom SVG where Plot is awkward.
- **Engine**: `lib/engine/*` — pure TypeScript, zero React/DOM, `Float64Array` throughout,
  seedable **PCG32** + **Ziggurat** normals. Runs in a **Web Worker** (Comlink) with
  streaming progress so the UI stays live during a run. Rough cost: 10k paths × 360 months
  ≈ 3.6M steps × ~15 state updates ≈ well under a second.
- **State**: Zustand; config validated by **Zod** (single source of truth for schema,
  defaults, and JSON import validation); URL-encoded compressed config for shareable links.
- **Python** (`research/`, uv-managed, not deployed): numpy/scipy/pandas/statsmodels/SALib
  reference model, parity tests, calibration, offline Sobol.
- **Testing**: Vitest for engine units (distribution moments + KS tests against scipy
  quantiles, EMI against the closed-form formula, tax functions against hand-worked
  examples, conservation identities — e.g. every rupee is accounted for in both branches);
  Playwright smoke test for the app; **golden parity test** TS vs Python on a fixed seed grid.

---

## 6. Repository layout

```
housingAnalyser/
├─ app/                       # Next.js routes
├─ components/
│  ├─ config/                 # DistributionEditor, ProcessEditor, CorrelationHeatmap, panels/
│  ├─ charts/                 # one file per chart in §4
│  └─ insights/               # summary bar + narrative panel
├─ lib/engine/
│  ├─ rng.ts  distributions.ts  processes.ts  correlate.ts
│  ├─ amortization.ts  tax/india.rules.ts  tax/india.ts
│  ├─ buyPath.ts  rentPath.ts  simulate.ts
│  ├─ stats.ts                # percentiles, KDE, Spearman, tornado, Sobol
│  └─ schema.ts               # Zod config + defaults + city/scenario presets
├─ workers/sim.worker.ts
├─ research/                  # Python: reference_model.py, validate_parity.py, calibrate.py, data/
├─ tests/
└─ PLAN.md                    # this document
```

---

## 7. Phases (each ends in something you can click)

| Phase | Deliverable | Why this order |
|---|---|---|
| **0** | Scaffold + Vercel deploy of a hello-world | Prove the deployment pipeline on day one, never at the end |
| **1** | Deterministic engine: full cash flows, amortisation, taxes, terminal wealth, both branches. CLI + a bare results table | A stochastic model built on a wrong deterministic core is 10,000 wrong answers. Validated against a hand-built spreadsheet |
| **2** | Stochastic layer: RNG, distributions, processes, correlation, MC driver, Web Worker, progress streaming | The engine, finished |
| **3** | Python reference model + parity tests + first calibration pass → shipped presets | Independent confirmation before we build UI on top |
| **4** | Config UI: parameter panels, distribution editor with PDF previews, process editor with path previews, correlation heatmap, presets, save/load/share | The thing that makes it usable by non-coders |
| **5** | Charts 1–4 and 9–10, summary bar | The decision is now answerable |
| **6** | Charts 5–8, 11–15, auto-insight panel, real/nominal toggle, exports | The insight layer |
| **7** | Optional: Python serverless `/api/deep` for Sobol & 1M-path runs; PDF report export; scenario library | Stretch |

I'd expect Phases 0–2 to be the bulk of the careful work, Phase 4 the bulk of the fiddly work.

---

## 8. Decisions I need from you before starting

1. **Architecture** — confirm **A** (TypeScript engine in-browser + Python offline for
   validation/calibration), or tell me to build **C** (Pyodide, numpy at runtime) if you
   want Python literally executing in the page.
2. **Target property** — city, indicative 2BHK price, and current market rent for the
   equivalent flat. If you'd rather not say, I'll ship city presets and default to
   Pune ≈ ₹1.1 Cr / ₹30k rent, and you can change it in the UI in two seconds.
3. **Tax regime** — old (HRA + §24(b) + §80C all live, which is where the model is most
   interesting) or new? I'll implement both regardless; this only sets the default.
4. **Horizon** — default 20 years, or something else?
5. **Loan assumption** — do you intend 20% down / 20-year tenure as the base case?
6. **Anything in §2.5 (life events) you consider essential vs. noise** — I'll build them all
   but default the speculative ones off.

None of these block Phase 0–1; if you're away I'll start on the scaffold and the
deterministic engine under the defaults above and flag every assumption in the UI.

---

## 9. Things I want to be honest about up front

- **Tax defaults need your audit.** I'll encode Indian rules as of FY 2025-26 to the best of
  my knowledge with sources in tooltips, but tax law is exactly the kind of thing where a
  confident wrong constant poisons every output. That's why it's an editable data table.
- **Calibration data is the weak link.** Indian house-price indices (NHB Residex) are coarse,
  city-level, and short compared to Case-Shiller. The presets will be defensible, not
  authoritative, and the app will say so. Your own priors, entered as percentiles, are
  probably better than my fitted defaults — which is the argument for making the
  distribution editor good.
- **The model can be made to say anything.** Any tool with this many knobs can be tuned to a
  predetermined conclusion. The countermeasures are the sensitivity chart (which exposes
  which knob is doing the work), the indifference curve (which states the assumption the
  decision actually rests on), and shareable seeded configs (which make every claim
  reproducible). Those aren't decoration; they're the point.
