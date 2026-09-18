"use client";

import { CITY_PRESET_LIST, CITY_PRESET_PARAMS, CITY_PRESETS } from "@/lib/engine/defaults";
import { useScenarioStore } from "@/lib/store";
import { DistributionCard } from "./DistributionCard";
import { ProcessCard } from "./ProcessCard";
import { CheckboxField, NumberField, Section, ToggleField } from "./ScalarField";

const inr = (x: number) => x.toFixed(0);
const pct = (x: number) => `${(x * 100).toFixed(2)}%`;

/**
 * Every field a person actually needs to decide "should I rent or buy" is
 * ordered near the top of this rail: their income, the specific property,
 * the specific rent, the loan they'd actually get quoted. Everything below
 * the "Assumptions you can usually leave as default" divider is macro
 * plumbing (inflation dynamics, mean-reversion speeds, correlation) that a
 * layperson rarely has a strong, specific view on — the shipped defaults
 * there are deliberately reasonable so most people never need to open
 * those sections at all. This ordering is a direct response to client
 * feedback: personal, high-leverage inputs first; generic macro
 * assumptions last.
 */
export function ParameterRail() {
  const config = useScenarioStore((s) => s.config);
  const updateConfig = useScenarioStore((s) => s.updateConfig);
  const setConfig = useScenarioStore((s) => s.setConfig);

  return (
    <aside className="w-full max-w-sm shrink-0 overflow-y-auto px-3 pb-24 text-[13px]">
      <Section title="City & scenario">
        <label className="grid gap-1 text-[12px]">
          <span className="text-neutral-600 dark:text-neutral-300">Starting point: a real city preset</span>
          <select
            value={config.property.cityPresetId in CITY_PRESETS ? config.property.cityPresetId : "custom"}
            onChange={(e) => {
              const preset = CITY_PRESETS[e.target.value];
              if (preset) setConfig(preset);
            }}
            className="rounded border border-black/15 dark:border-white/15 bg-transparent px-1.5 py-1 text-[12px]"
          >
            {CITY_PRESET_LIST.map(({ id, label }) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
            <option value="custom">Custom (already edited below)</option>
          </select>
          <span className="text-[10px] text-neutral-400">
            {config.property.cityPresetId in CITY_PRESET_PARAMS
              ? CITY_PRESET_PARAMS[config.property.cityPresetId]!.note
              : "You've changed values away from the preset — pick a city above to reset to its defaults."}
          </span>
        </label>
        <NumberField
          label="How many years you're comparing"
          value={config.meta.horizonYears}
          min={5}
          max={40}
          step={1}
          unit="years"
          help="If you might sell/move out sooner than this, shorten it — selling early is usually worse for buying (see the 'when does buying catch up' chart)."
          onChange={(v) => updateConfig((c) => ({ ...c, meta: { ...c.meta, horizonYears: v } }))}
        />
        <NumberField
          label="Your savings available today"
          value={config.meta.liquidCapital}
          min={0}
          max={10_000_000}
          step={10_000}
          unit="₹"
          help="Everything you could put toward a down payment or, if you rent instead, invest immediately. This is the one number both choices start from equally."
          onChange={(v) => updateConfig((c) => ({ ...c, meta: { ...c.meta, liquidCapital: v } }))}
        />
        <NumberField
          label="Number of scenarios to simulate"
          value={config.meta.numPaths}
          min={200}
          max={20000}
          step={100}
          help="More scenarios = smoother, more reliable percentages, but a slower run. 5,000 is a good default; drop to ~500 while you're experimenting for a faster response."
          onChange={(v) => updateConfig((c) => ({ ...c, meta: { ...c.meta, numPaths: v } }))}
        />
        <NumberField
          label="Random seed"
          value={config.meta.seed}
          step={1}
          help="Same seed + same settings = the exact same result every time, so you can reproduce or share a specific run. Change it to see how much randomness alone moves the answer."
          onChange={(v) => updateConfig((c) => ({ ...c, meta: { ...c.meta, seed: Math.round(v) } }))}
        />
      </Section>

      <Section title="Your income & tax">
        <NumberField
          label="Annual gross income"
          value={config.tax.annualGrossIncome}
          min={0}
          max={20_000_000}
          step={50_000}
          unit="₹/yr"
          help="Your total salary before tax. This drives how much tax you actually save from a home loan (Section 24b/80C) or from HRA if you rent — often a bigger factor than people expect."
          onChange={(v) => updateConfig((c) => ({ ...c, tax: { ...c.tax, annualGrossIncome: v } }))}
        />
        <ToggleField
          label="Tax regime"
          value={config.tax.regime}
          options={[
            { value: "old", label: "Old regime" },
            { value: "new", label: "New regime" },
          ]}
          onChange={(v) => updateConfig((c) => ({ ...c, tax: { ...c.tax, regime: v } }))}
        />
        <p className="text-[10px] text-neutral-400">
          The old regime lets you deduct home-loan interest and HRA, which is where owning-vs-renting tax
          differences actually show up; the new regime has lower slabs but no such deductions.
        </p>
        <NumberField
          label="Basic salary (share of gross)"
          value={config.tax.basicSalaryPct}
          min={0.2}
          max={0.8}
          step={0.01}
          unit={pct(config.tax.basicSalaryPct)}
          help="HRA exemption rules are based on your basic pay, not your total salary — check a recent payslip if unsure; 50% is a common default."
          onChange={(v) => updateConfig((c) => ({ ...c, tax: { ...c.tax, basicSalaryPct: v } }))}
        />
        <NumberField
          label="HRA received"
          value={config.tax.hraReceivedMonthly}
          min={0}
          max={500_000}
          step={1_000}
          unit="₹/mo"
          help="The House Rent Allowance component your employer already pays you — only relevant if you rent, and only under the old regime."
          onChange={(v) => updateConfig((c) => ({ ...c, tax: { ...c.tax, hraReceivedMonthly: v } }))}
        />
        <CheckboxField
          label="This is one of India's 4 HRA metro cities (Delhi, Mumbai, Kolkata, Chennai)"
          value={config.tax.isMetroForHRA}
          help="Metro cities get a larger HRA tax exemption (50% of basic pay vs. 40% elsewhere) — a real, often-missed distinction. Bengaluru and Pune are NOT metro for this rule, despite being major cities."
          onChange={(v) => updateConfig((c) => ({ ...c, tax: { ...c.tax, isMetroForHRA: v } }))}
        />
      </Section>

      <Section title="The property you're comparing">
        <NumberField
          label="Purchase price"
          value={config.property.purchasePrice}
          min={1_000_000}
          max={50_000_000}
          step={100_000}
          unit="₹"
          help="The listed price of the specific 2BHK you'd actually buy. Raising this is the fastest way to see the affordability warning — the tool will tell you plainly if your savings can't cover the upfront cost at 20% down."
          onChange={(v) => updateConfig((c) => ({ ...c, property: { ...c.property, purchasePrice: v } }))}
        />
        <NumberField
          label="Carpet area"
          value={config.property.carpetAreaSqft}
          min={200}
          max={3000}
          step={10}
          unit="sqft"
          help="Used to scale monthly maintenance charges, which are usually billed per square foot."
          onChange={(v) => updateConfig((c) => ({ ...c, property: { ...c.property, carpetAreaSqft: v } }))}
        />
        <NumberField
          label="Down payment"
          value={config.property.downPaymentFraction}
          min={0.1}
          max={0.9}
          step={0.01}
          unit={pct(config.property.downPaymentFraction)}
          help="The share of the price you pay upfront rather than borrow. Indian lenders effectively require at least ~20% for loans of this size (RBI's loan-to-value cap) — going lower than that isn't realistic for most buyers."
          onChange={(v) => updateConfig((c) => ({ ...c, property: { ...c.property, downPaymentFraction: v } }))}
        />
      </Section>

      <Section title="The rent alternative">
        <ToggleField
          label="How to set the rent"
          value={config.rent.baseRentMode}
          options={[
            { value: "yieldOfPurchasePrice", label: "As a % of the price" },
            { value: "explicit", label: "Type the rent directly" },
          ]}
          onChange={(v) => updateConfig((c) => ({ ...c, rent: { ...c.rent, baseRentMode: v } }))}
        />
        {config.rent.baseRentMode === "yieldOfPurchasePrice" ? (
          <NumberField
            label="Gross rental yield"
            value={config.rent.grossRentalYieldPct}
            min={0.01}
            max={0.06}
            step={0.001}
            unit={pct(config.rent.grossRentalYieldPct)}
            help="Annual rent as a % of the purchase price — this ratio IS the rent-vs-buy question in miniature. Indian metros typically run 2-3.5%; lower means renting the equivalent home is relatively cheap versus buying it."
            onChange={(v) => updateConfig((c) => ({ ...c, rent: { ...c.rent, grossRentalYieldPct: v } }))}
          />
        ) : (
          <NumberField
            label="Monthly rent"
            value={config.rent.baseRentMonthly}
            min={0}
            max={200_000}
            step={500}
            unit="₹/mo"
            help="The actual monthly rent for an equivalent 2BHK, if you already know it from listings."
            onChange={(v) => updateConfig((c) => ({ ...c, rent: { ...c.rent, baseRentMonthly: v } }))}
          />
        )}
        <NumberField
          label="Security deposit"
          value={config.rent.depositMonths}
          min={0}
          max={12}
          step={0.5}
          unit="months' rent"
          help="Cash tied up with the landlord instead of invested. Varies a lot by city custom: ~3 months in Mumbai/Pune, but often 6-10 months in Bengaluru."
          onChange={(v) => updateConfig((c) => ({ ...c, rent: { ...c.rent, depositMonths: v } }))}
        />
        <NumberField
          label="How often you expect to move"
          value={config.rent.moveEveryYears}
          min={1}
          max={15}
          step={0.5}
          unit="years"
          help="Each move costs roughly a month's rent in brokerage/packing, and floats your deposit while you re-settle it — moving less often is one real financial edge renting can lose if you're not careful."
          onChange={(v) => updateConfig((c) => ({ ...c, rent: { ...c.rent, moveEveryYears: v } }))}
        />
      </Section>

      <Section title="The loan">
        <NumberField
          label="Loan tenure"
          value={config.loan.tenureYears}
          min={5}
          max={30}
          step={1}
          unit="years"
          help="Longer tenure means a smaller EMI but more total interest paid over the life of the loan."
          onChange={(v) => updateConfig((c) => ({ ...c, loan: { ...c.loan, tenureYears: v } }))}
        />
        <ToggleField
          label="Interest rate type"
          value={config.loan.rateType}
          options={[
            { value: "fixed", label: "Fixed" },
            { value: "floating", label: "Floating" },
          ]}
          onChange={(v) => updateConfig((c) => ({ ...c, loan: { ...c.loan, rateType: v } }))}
        />
        <p className="text-[10px] text-neutral-400">
          Most Indian home loans are floating, tracking the repo rate — pick Floating to model rate uncertainty
          instead of assuming today's rate holds for 20 years straight.
        </p>
        {config.loan.rateType === "fixed" ? (
          <NumberField
            label="Fixed rate"
            value={config.loan.fixedRatePct}
            min={0.04}
            max={0.16}
            step={0.001}
            unit={pct(config.loan.fixedRatePct)}
            help="Whatever rate your lender has actually quoted you."
            onChange={(v) => updateConfig((c) => ({ ...c, loan: { ...c.loan, fixedRatePct: v } }))}
          />
        ) : (
          <ProcessCard
            label="Floating loan rate"
            spec={config.loan.floatingRateProcess}
            initialLevel={0.085}
            unit="fraction/yr"
            formatValue={pct}
            onChange={(spec) => updateConfig((c) => ({ ...c, loan: { ...c.loan, floatingRateProcess: spec } }))}
          />
        )}
        <ToggleField
          label="When the rate changes"
          value={config.loan.rateResetPolicy}
          options={[
            { value: "tenureReset", label: "My EMI stays fixed" },
            { value: "emiReset", label: "My EMI changes" },
          ]}
          onChange={(v) => updateConfig((c) => ({ ...c, loan: { ...c.loan, rateResetPolicy: v } }))}
        />
        <p className="text-[10px] text-neutral-400">
          Indian lenders default to keeping your EMI fixed and quietly extending (or shortening) how many years it
          takes to pay off the loan instead — pick that option unless your bank has told you otherwise.
        </p>
      </Section>

      <Section title="Property appreciation">
        <p className="mb-1 text-[11px] text-neutral-500">
          What you believe this specific property's value will do over time — arguably the single belief that
          matters most to whether buying wins.
        </p>
        <ProcessCard
          label="Appreciation"
          spec={config.macro.appreciationProcess}
          initialLevel={config.property.purchasePrice}
          unit="₹ level"
          formatValue={inr}
          onChange={(spec) => updateConfig((c) => ({ ...c, macro: { ...c.macro, appreciationProcess: spec } }))}
        />
      </Section>

      <Section title="Investment of the differential">
        <p className="mb-1 text-[11px] text-neutral-500">
          The renter invests whatever they save by not buying — these two return assumptions are just as decisive
          as property appreciation, so they're worth a real opinion too, not just the default.
        </p>
        <NumberField
          label="Share invested in equity vs. debt"
          value={config.investment.equityAllocationPct}
          min={0}
          max={1}
          step={0.05}
          unit={pct(config.investment.equityAllocationPct)}
          help="Higher equity share means higher expected growth but a bumpier ride — this blends the two return processes below into one portfolio."
          onChange={(v) => updateConfig((c) => ({ ...c, investment: { ...c.investment, equityAllocationPct: v } }))}
        />
        <ProcessCard
          label="Equity returns"
          spec={config.investment.equityReturnProcess}
          initialLevel={1}
          formatValue={pct}
          onChange={(spec) => updateConfig((c) => ({ ...c, investment: { ...c.investment, equityReturnProcess: spec } }))}
        />
        <ProcessCard
          label="Debt returns"
          spec={config.investment.debtReturnProcess}
          initialLevel={1}
          formatValue={pct}
          onChange={(spec) => updateConfig((c) => ({ ...c, investment: { ...c.investment, debtReturnProcess: spec } }))}
        />
        <NumberField
          label="Investment discipline"
          value={config.investment.investmentDisciplineFactor}
          min={0}
          max={1}
          step={0.05}
          unit={pct(config.investment.investmentDisciplineFactor)}
          help="Be honest here: what share of the money 'saved by renting' would you actually invest every month, rather than spend? 100% is the optimistic case; most people are somewhere below it."
          onChange={(v) => updateConfig((c) => ({ ...c, investment: { ...c.investment, investmentDisciplineFactor: v } }))}
        />
      </Section>

      {/* Everything below this line is macro plumbing most people don't
          have a strong specific view on — the shipped defaults are
          reasonable, so treat this as optional fine-tuning, not a
          checklist you need to work through. */}
      <div className="my-3 border-t border-dashed border-black/15 pt-2 text-center text-[11px] font-medium text-neutral-400 dark:border-white/15">
        Assumptions you can usually leave as default
      </div>

      <Section title="Rent hikes" defaultOpen={false}>
        <ProcessCard
          label="Rent hikes"
          spec={config.rent.rentHikeProcess}
          initialLevel={0.06}
          unit="fraction/yr"
          formatValue={pct}
          onChange={(spec) => updateConfig((c) => ({ ...c, rent: { ...c.rent, rentHikeProcess: spec } }))}
        />
      </Section>

      <Section title="Maintenance & repairs" defaultOpen={false}>
        <NumberField
          label="Society maintenance"
          value={config.carryingCosts.maintenanceRsPerSqftMonth}
          min={0}
          max={15}
          step={0.1}
          unit="₹/sqft/mo"
          help="The recurring monthly charge most Indian apartment societies bill, on top of EMI — renters don't pay this."
          onChange={(v) => updateConfig((c) => ({ ...c, carryingCosts: { ...c.carryingCosts, maintenanceRsPerSqftMonth: v } }))}
        />
        <ProcessCard
          label="Cost escalation"
          spec={config.carryingCosts.maintenanceEscalationProcess}
          initialLevel={1}
          formatValue={pct}
          onChange={(spec) => updateConfig((c) => ({ ...c, carryingCosts: { ...c.carryingCosts, maintenanceEscalationProcess: spec } }))}
        />
        <NumberField
          label="Property tax"
          value={config.carryingCosts.propertyTaxPctOfValueAnnual}
          min={0}
          max={0.02}
          step={0.0005}
          unit={pct(config.carryingCosts.propertyTaxPctOfValueAnnual)}
          help="Annual municipal property tax, as a % of the property's current value — again, only owners pay this."
          onChange={(v) => updateConfig((c) => ({ ...c, carryingCosts: { ...c.carryingCosts, propertyTaxPctOfValueAnnual: v } }))}
        />
        <NumberField
          label="Big-repair frequency"
          value={config.carryingCosts.lumpyRepairArrivalLambdaAnnual}
          min={0}
          max={2}
          step={0.05}
          unit="events/yr"
          help="How often an unplanned, expensive repair (leak, plumbing, structural) shows up, on average. 0.3 means roughly once every ~3 years — a cost renters simply never face."
          onChange={(v) => updateConfig((c) => ({ ...c, carryingCosts: { ...c.carryingCosts, lumpyRepairArrivalLambdaAnnual: v } }))}
        />
        <DistributionCard
          label="Lumpy repair severity"
          spec={config.carryingCosts.lumpyRepairSeverity}
          unit="₹ per event"
          formatValue={inr}
          onChange={(spec) => updateConfig((c) => ({ ...c, carryingCosts: { ...c.carryingCosts, lumpyRepairSeverity: spec } }))}
        />
      </Section>

      <Section title="Macro (inflation & income growth)" defaultOpen={false}>
        <ProcessCard
          label="Inflation (CPI)"
          spec={config.macro.inflationProcess}
          initialLevel={0.05}
          unit="fraction/yr"
          formatValue={pct}
          onChange={(spec) => updateConfig((c) => ({ ...c, macro: { ...c.macro, inflationProcess: spec } }))}
        />
        <ProcessCard
          label="Income growth"
          spec={config.macro.incomeGrowthProcess}
          initialLevel={1}
          formatValue={pct}
          onChange={(spec) => updateConfig((c) => ({ ...c, macro: { ...c.macro, incomeGrowthProcess: spec } }))}
        />
      </Section>

      <Section title="Exit assumptions" defaultOpen={false}>
        <NumberField
          label="Sale brokerage"
          value={config.exit.saleBrokeragePct}
          min={0}
          max={0.03}
          step={0.001}
          unit={pct(config.exit.saleBrokeragePct)}
          help="The cut a broker typically takes when you eventually sell the property."
          onChange={(v) => updateConfig((c) => ({ ...c, exit: { ...c.exit, saleBrokeragePct: v } }))}
        />
        <DistributionCard
          label="Time to sell"
          spec={config.exit.timeToSellMonths}
          unit="months"
          formatValue={inr}
          onChange={(spec) => updateConfig((c) => ({ ...c, exit: { ...c.exit, timeToSellMonths: spec } }))}
        />
        <CheckboxField
          label="Mark exit costs to market continuously"
          value={config.exit.markToMarketContinuously}
          help="If off, sale brokerage & capital-gains tax are only subtracted at the very end of the horizon — turning it on shows what you'd actually walk away with if you sold this month, which is the more honest comparison."
          onChange={(v) => updateConfig((c) => ({ ...c, exit: { ...c.exit, markToMarketContinuously: v } }))}
        />
      </Section>
    </aside>
  );
}
