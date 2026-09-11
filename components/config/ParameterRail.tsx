"use client";

import { useScenarioStore } from "@/lib/store";
import { DistributionCard } from "./DistributionCard";
import { ProcessCard } from "./ProcessCard";
import { CheckboxField, NumberField, Section, ToggleField } from "./ScalarField";

const inr = (x: number) => x.toFixed(0);
const pct = (x: number) => `${(x * 100).toFixed(2)}%`;

export function ParameterRail() {
  const config = useScenarioStore((s) => s.config);
  const updateConfig = useScenarioStore((s) => s.updateConfig);

  return (
    <aside className="w-full max-w-sm shrink-0 overflow-y-auto px-3 pb-24 text-[13px]">
      <Section title="Scenario">
        <NumberField label="Horizon" value={config.meta.horizonYears} min={5} max={40} step={1} unit="years" onChange={(v) => updateConfig((c) => ({ ...c, meta: { ...c.meta, horizonYears: v } }))} />
        <NumberField label="Monte Carlo paths" value={config.meta.numPaths} min={200} max={20000} step={100} onChange={(v) => updateConfig((c) => ({ ...c, meta: { ...c.meta, numPaths: v } }))} />
        <NumberField label="Liquid capital (W0)" value={config.meta.liquidCapital} min={0} max={10_000_000} step={10_000} unit="₹" onChange={(v) => updateConfig((c) => ({ ...c, meta: { ...c.meta, liquidCapital: v } }))} />
        <NumberField label="Random seed" value={config.meta.seed} step={1} onChange={(v) => updateConfig((c) => ({ ...c, meta: { ...c.meta, seed: Math.round(v) } }))} help="Same seed = identical results, reproducible and shareable." />
      </Section>

      <Section title="Property & loan">
        <NumberField label="Purchase price" value={config.property.purchasePrice} min={1_000_000} max={50_000_000} step={100_000} unit="₹" onChange={(v) => updateConfig((c) => ({ ...c, property: { ...c.property, purchasePrice: v } }))} />
        <NumberField label="Carpet area" value={config.property.carpetAreaSqft} min={200} max={3000} step={10} unit="sqft" onChange={(v) => updateConfig((c) => ({ ...c, property: { ...c.property, carpetAreaSqft: v } }))} />
        <NumberField label="Down payment" value={config.property.downPaymentFraction} min={0.1} max={0.9} step={0.01} unit={pct(config.property.downPaymentFraction)} onChange={(v) => updateConfig((c) => ({ ...c, property: { ...c.property, downPaymentFraction: v } }))} />
        <NumberField label="Loan tenure" value={config.loan.tenureYears} min={5} max={30} step={1} unit="years" onChange={(v) => updateConfig((c) => ({ ...c, loan: { ...c.loan, tenureYears: v } }))} />
        <ToggleField
          label="Rate type"
          value={config.loan.rateType}
          options={[{ value: "fixed", label: "Fixed" }, { value: "floating", label: "Floating" }]}
          onChange={(v) => updateConfig((c) => ({ ...c, loan: { ...c.loan, rateType: v } }))}
        />
        {config.loan.rateType === "fixed" ? (
          <NumberField label="Fixed rate" value={config.loan.fixedRatePct} min={0.04} max={0.16} step={0.001} unit={pct(config.loan.fixedRatePct)} onChange={(v) => updateConfig((c) => ({ ...c, loan: { ...c.loan, fixedRatePct: v } }))} />
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
          label="Rate reset policy"
          value={config.loan.rateResetPolicy}
          options={[{ value: "tenureReset", label: "Tenure resets (EMI fixed)" }, { value: "emiReset", label: "EMI resets (tenure fixed)" }]}
          onChange={(v) => updateConfig((c) => ({ ...c, loan: { ...c.loan, rateResetPolicy: v } }))}
        />
      </Section>

      <Section title="Property appreciation">
        <ProcessCard
          label="Appreciation"
          spec={config.macro.appreciationProcess}
          initialLevel={config.property.purchasePrice}
          unit="₹ level"
          formatValue={inr}
          onChange={(spec) => updateConfig((c) => ({ ...c, macro: { ...c.macro, appreciationProcess: spec } }))}
        />
      </Section>

      <Section title="Maintenance & repairs" defaultOpen={false}>
        <NumberField label="Maintenance" value={config.carryingCosts.maintenanceRsPerSqftMonth} min={0} max={15} step={0.1} unit="₹/sqft/mo" onChange={(v) => updateConfig((c) => ({ ...c, carryingCosts: { ...c.carryingCosts, maintenanceRsPerSqftMonth: v } }))} />
        <ProcessCard
          label="Cost escalation"
          spec={config.carryingCosts.maintenanceEscalationProcess}
          initialLevel={1}
          formatValue={pct}
          onChange={(spec) => updateConfig((c) => ({ ...c, carryingCosts: { ...c.carryingCosts, maintenanceEscalationProcess: spec } }))}
        />
        <NumberField label="Property tax" value={config.carryingCosts.propertyTaxPctOfValueAnnual} min={0} max={0.02} step={0.0005} unit={pct(config.carryingCosts.propertyTaxPctOfValueAnnual)} onChange={(v) => updateConfig((c) => ({ ...c, carryingCosts: { ...c.carryingCosts, propertyTaxPctOfValueAnnual: v } }))} />
        <NumberField label="Lumpy repair arrival rate" value={config.carryingCosts.lumpyRepairArrivalLambdaAnnual} min={0} max={2} step={0.05} unit="events/yr" onChange={(v) => updateConfig((c) => ({ ...c, carryingCosts: { ...c.carryingCosts, lumpyRepairArrivalLambdaAnnual: v } }))} />
        <DistributionCard
          label="Lumpy repair severity"
          spec={config.carryingCosts.lumpyRepairSeverity}
          unit="₹ per event"
          formatValue={inr}
          onChange={(spec) => updateConfig((c) => ({ ...c, carryingCosts: { ...c.carryingCosts, lumpyRepairSeverity: spec } }))}
        />
      </Section>

      <Section title="Rent">
        <ToggleField
          label="Base rent"
          value={config.rent.baseRentMode}
          options={[{ value: "yieldOfPurchasePrice", label: "Gross yield %" }, { value: "explicit", label: "Explicit ₹" }]}
          onChange={(v) => updateConfig((c) => ({ ...c, rent: { ...c.rent, baseRentMode: v } }))}
        />
        {config.rent.baseRentMode === "yieldOfPurchasePrice" ? (
          <NumberField label="Gross rental yield" value={config.rent.grossRentalYieldPct} min={0.01} max={0.06} step={0.001} unit={pct(config.rent.grossRentalYieldPct)} onChange={(v) => updateConfig((c) => ({ ...c, rent: { ...c.rent, grossRentalYieldPct: v } }))} />
        ) : (
          <NumberField label="Base rent" value={config.rent.baseRentMonthly} min={0} max={200_000} step={500} unit="₹/mo" onChange={(v) => updateConfig((c) => ({ ...c, rent: { ...c.rent, baseRentMonthly: v } }))} />
        )}
        <NumberField label="Deposit" value={config.rent.depositMonths} min={0} max={12} step={0.5} unit="months' rent" onChange={(v) => updateConfig((c) => ({ ...c, rent: { ...c.rent, depositMonths: v } }))} />
        <NumberField label="Move every" value={config.rent.moveEveryYears} min={1} max={15} step={0.5} unit="years" onChange={(v) => updateConfig((c) => ({ ...c, rent: { ...c.rent, moveEveryYears: v } }))} />
        <ProcessCard
          label="Rent hikes"
          spec={config.rent.rentHikeProcess}
          initialLevel={0.06}
          unit="fraction/yr"
          formatValue={pct}
          onChange={(spec) => updateConfig((c) => ({ ...c, rent: { ...c.rent, rentHikeProcess: spec } }))}
        />
      </Section>

      <Section title="Investment of the differential" defaultOpen={false}>
        <NumberField label="Equity allocation" value={config.investment.equityAllocationPct} min={0} max={1} step={0.05} unit={pct(config.investment.equityAllocationPct)} onChange={(v) => updateConfig((c) => ({ ...c, investment: { ...c.investment, equityAllocationPct: v } }))} />
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
          help="Share of the theoretical monthly surplus actually invested."
          onChange={(v) => updateConfig((c) => ({ ...c, investment: { ...c.investment, investmentDisciplineFactor: v } }))}
        />
      </Section>

      <Section title="Macro" defaultOpen={false}>
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

      <Section title="Tax" defaultOpen={false}>
        <ToggleField
          label="Regime"
          value={config.tax.regime}
          options={[{ value: "old", label: "Old" }, { value: "new", label: "New" }]}
          onChange={(v) => updateConfig((c) => ({ ...c, tax: { ...c.tax, regime: v } }))}
        />
        <NumberField label="Annual gross income" value={config.tax.annualGrossIncome} min={0} max={20_000_000} step={50_000} unit="₹" onChange={(v) => updateConfig((c) => ({ ...c, tax: { ...c.tax, annualGrossIncome: v } }))} />
        <NumberField label="Basic salary share" value={config.tax.basicSalaryPct} min={0.2} max={0.8} step={0.01} unit={pct(config.tax.basicSalaryPct)} onChange={(v) => updateConfig((c) => ({ ...c, tax: { ...c.tax, basicSalaryPct: v } }))} />
        <NumberField label="HRA received" value={config.tax.hraReceivedMonthly} min={0} max={500_000} step={1_000} unit="₹/mo" onChange={(v) => updateConfig((c) => ({ ...c, tax: { ...c.tax, hraReceivedMonthly: v } }))} />
        <CheckboxField label="Metro city (for 50%/40% HRA rule)" value={config.tax.isMetroForHRA} onChange={(v) => updateConfig((c) => ({ ...c, tax: { ...c.tax, isMetroForHRA: v } }))} />
      </Section>

      <Section title="Exit" defaultOpen={false}>
        <NumberField label="Sale brokerage" value={config.exit.saleBrokeragePct} min={0} max={0.03} step={0.001} unit={pct(config.exit.saleBrokeragePct)} onChange={(v) => updateConfig((c) => ({ ...c, exit: { ...c.exit, saleBrokeragePct: v } }))} />
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
          help="If off, sale brokerage & LTCG tax are only netted out at the very end of the horizon — turning it on shows what you'd actually walk away with if you sold this month."
          onChange={(v) => updateConfig((c) => ({ ...c, exit: { ...c.exit, markToMarketContinuously: v } }))}
        />
      </Section>
    </aside>
  );
}
