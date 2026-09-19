import Decimal from 'decimal.js';

/**
 * Decimal-safe money helpers.
 *
 * All monetary math in this project goes through decimal.js so that values like
 * 0.1 + 0.2 behave the way an accountant expects (0.30, not 0.30000000000000004).
 *
 * Convention:
 *  - money values are rounded to 2 decimals (paise) at the boundary only
 *  - quantity values are rounded to 4 decimals (base units: g / ml / piece)
 */
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export type Numeric = number | string | Decimal;

export const D = (value: Numeric = 0): Decimal => new Decimal(value ?? 0);

/** Round to 2 decimals (currency). */
export const toMoney = (value: Numeric): number =>
  D(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();

/** Round to 4 decimals (quantities in base units). */
export const toQuantity = (value: Numeric): number =>
  D(value).toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toNumber();

/** Round to 2 decimals (percentages). */
export const toPercent = (value: Numeric): number =>
  D(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();

export const sum = (values: Numeric[]): Decimal =>
  values.reduce<Decimal>((acc, v) => acc.plus(D(v)), D(0));

/** Safe division that returns 0 instead of Infinity/NaN when the divisor is 0. */
export const divide = (a: Numeric, b: Numeric): Decimal => {
  const divisor = D(b);
  if (divisor.isZero()) return D(0);
  return D(a).dividedBy(divisor);
};

export { Decimal };
