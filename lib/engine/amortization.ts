/**
 * Loan amortization: EMI calculation and month-by-month schedule
 * simulation, supporting a time-varying (floating) rate path under either
 * of the two reset policies Indian lenders use:
 *
 *  - "tenureReset" (the market default): EMI is fixed at origination.
 *    When the rate moves, the interest/principal split within the fixed
 *    EMI shifts instead — the loan implicitly gets a longer or shorter
 *    payoff tenure. If a rate rise ever pushes interest-for-the-month
 *    above the EMI itself, this correctly produces negative amortization
 *    (the balance grows) rather than silently clamping it away — a real,
 *    material risk this model should not hide.
 *  - "emiReset": EMI is recalculated every month against the current
 *    balance, current rate, and the nominal remaining tenure, so the
 *    payoff date stays fixed and EMI absorbs the rate change instead.
 */

export interface AmortizationMonth {
  month: number; // 0-indexed
  annualRatePct: number;
  emi: number;
  interestPaid: number;
  principalPaid: number; // can be negative under tenureReset negative amortization
  prepaymentPaid: number;
  openingBalance: number;
  closingBalance: number;
}

export function computeEmi(principal: number, annualRatePct: number, tenureMonths: number): number {
  if (tenureMonths <= 0) return principal;
  const r = annualRatePct / 12;
  if (r === 0) return principal / tenureMonths;
  const factor = Math.pow(1 + r, tenureMonths);
  return (principal * r * factor) / (factor - 1);
}

export interface AmortizationInputs {
  principal: number;
  originalAnnualRatePct: number;
  tenureMonths: number;
  /** Annual rate (as a fraction, e.g. 0.085) applying at each simulated month. Constant array for a fixed-rate loan. Must be at least `totalMonths` long. */
  ratePathAnnualPct: Float64Array;
  resetPolicy: "tenureReset" | "emiReset";
  /** How many months to simulate (the horizon may be shorter or longer than the nominal tenure). */
  totalMonths: number;
  /** Optional prepayment amount for a given month, evaluated against the balance after the regular payment that month. Returning 0 (the default) means no prepayment. */
  prepaymentForMonth?: (month: number, balanceAfterRegularPayment: number) => number;
}

export function simulateAmortizationSchedule(inputs: AmortizationInputs): AmortizationMonth[] {
  const { principal, originalAnnualRatePct, tenureMonths, ratePathAnnualPct, resetPolicy, totalMonths } = inputs;
  const prepaymentForMonth = inputs.prepaymentForMonth ?? (() => 0);
  const fixedEmi = computeEmi(principal, originalAnnualRatePct, tenureMonths);

  const schedule: AmortizationMonth[] = [];
  let balance = principal;

  for (let t = 0; t < totalMonths; t++) {
    const openingBalance = balance;
    if (balance <= 0) {
      schedule.push({
        month: t,
        annualRatePct: ratePathAnnualPct[t] ?? originalAnnualRatePct,
        emi: 0,
        interestPaid: 0,
        principalPaid: 0,
        prepaymentPaid: 0,
        openingBalance: 0,
        closingBalance: 0,
      });
      continue;
    }

    const annualRatePct = ratePathAnnualPct[t] ?? originalAnnualRatePct;
    const monthlyRate = annualRatePct / 12;
    const remainingNominalMonths = Math.max(tenureMonths - t, 1);
    const emi = resetPolicy === "emiReset" ? computeEmi(balance, annualRatePct, remainingNominalMonths) : fixedEmi;

    const interestPaid = balance * monthlyRate;
    const principalComponent = emi - interestPaid; // can be negative -> negative amortization
    let balanceAfterRegular = balance - principalComponent;

    let prepaymentPaid = prepaymentForMonth(t, balanceAfterRegular);
    prepaymentPaid = Math.max(0, Math.min(prepaymentPaid, balanceAfterRegular));
    const closingBalance = Math.max(0, balanceAfterRegular - prepaymentPaid);

    schedule.push({
      month: t,
      annualRatePct,
      emi,
      interestPaid,
      principalPaid: principalComponent,
      prepaymentPaid,
      openingBalance,
      closingBalance,
    });

    balance = closingBalance;
  }

  return schedule;
}
