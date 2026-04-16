/**
 * Calculates the estimated monthly mortgage payment using the standard annuity formula.
 * @param {number} price - Total property price in €
 * @param {{ downPct: number, rateYearly: number, termYears: number }} opts
 * @returns {number|null} Monthly payment in € rounded to nearest integer, or null if price is falsy
 */
export function calcMonthlyPayment(price, opts) {
  if (!price) return null;
  const { downPct, rateYearly, termYears } = opts;
  const principal = price * (1 - downPct / 100);
  const r = rateYearly / 100 / 12;
  const n = termYears * 12;
  if (r === 0) return Math.round(principal / n);
  return Math.round((principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1));
}
