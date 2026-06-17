/**
 * PayPal Gateway SDK — Currency conversion + amount helpers.
 *
 * AIFUT stores money internally as BigInt in the smallest unit (Wallet.balance
 * convention = VND * 100, UNIT_SCALE = 100). PayPal transports decimal strings
 * ("19.99"). These helpers are the single, audited boundary between the two
 * representations so rounding behavior is consistent everywhere.
 *
 * Spread: a configurable cross-currency cushion (default 1%) applied when
 * converting an internal balance OUT to a PayPal charge, covering FX risk and
 * rounding loss. It is intentionally NOT applied on the inbound (capture) path
 * — inbound amounts are reconciled against the recorded transaction with a
 * tolerance band (see paypal.ipn.guard.ts), and PayPal fees are stored
 * separately rather than mutating the internal amount.
 *
 * All arithmetic on internal units uses BigInt; only the final FX multiply
 * (which needs a fractional rate) uses Number, then rounds back to BigInt.
 */

/** Smallest-internal-unit scale. Matches Wallet.balance (currency * 100). */
export const UNIT_SCALE = 100n;

/** Default cross-currency spread (1%). Configurable via env PAYPAL_SPREAD_RATE. */
export const DEFAULT_PAYPAL_SPREAD_RATE = 0.01;

/**
 * Resolve the active spread rate. Reads PAYPAL_SPREAD_RATE when present and
 * sane (0 <= rate < 1); otherwise falls back to the 1% default.
 */
export function resolveSpreadRate(): number {
  const raw = process.env['PAYPAL_SPREAD_RATE'];
  if (raw === undefined) return DEFAULT_PAYPAL_SPREAD_RATE;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed >= 1) {
    return DEFAULT_PAYPAL_SPREAD_RATE;
  }
  return parsed;
}

/**
 * Convert an internal BigInt amount (smallest unit) to a PayPal decimal string
 * with exactly two fraction digits, e.g. 199900n -> "1999.00".
 *
 * Pure string/BigInt math — no float rounding error.
 */
export function internalToPayPalDecimal(amount: bigint): string {
  if (amount < 0n) {
    throw new Error('internalToPayPalDecimal: amount must be non-negative.');
  }
  const whole = amount / UNIT_SCALE;
  const frac = amount % UNIT_SCALE;
  return `${whole.toString()}.${frac.toString().padStart(2, '0')}`;
}

/**
 * Convert a PayPal decimal string to an internal BigInt amount (smallest unit),
 * e.g. "19.99" -> 1999n. Tolerates missing/short/long fraction digits.
 */
export function payPalDecimalToInternal(value: string): bigint {
  const trimmed = String(value).trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`payPalDecimalToInternal: invalid decimal "${value}".`);
  }
  const [whole, frac = ''] = trimmed.split('.');
  const padded = frac.padEnd(2, '0').slice(0, 2);
  return BigInt(whole) * UNIT_SCALE + BigInt(padded);
}

/**
 * Convert an internal amount (in its source currency smallest unit) to the
 * target PayPal-charge amount, applying the FX rate and the outbound spread.
 *
 *   targetInternal = round( sourceInternal / fxRate * (1 + spread) )
 *
 * `fxRate` is "source units per 1 target unit" (e.g. VND per USD = 25400).
 * When source and target currency are identical, pass fxRate = 1.
 *
 * Returns the spread-adjusted amount as BigInt smallest units in the TARGET
 * currency, ready to be formatted with internalToPayPalDecimal().
 */
export function applySpreadToPayPalAmount(
  sourceInternal: bigint,
  fxRate: number,
  spreadRate: number = resolveSpreadRate(),
): bigint {
  if (sourceInternal < 0n) {
    throw new Error('applySpreadToPayPalAmount: amount must be non-negative.');
  }
  if (!Number.isFinite(fxRate) || fxRate <= 0) {
    throw new Error(`applySpreadToPayPalAmount: invalid fxRate ${fxRate}.`);
  }
  // BigInt -> Number is safe here because payment amounts are well within
  // Number.MAX_SAFE_INTEGER for any realistic transaction size.
  const converted = (Number(sourceInternal) / fxRate) * (1 + spreadRate);
  const rounded = Math.round(converted);
  if (!Number.isFinite(rounded) || rounded < 0) {
    throw new Error('applySpreadToPayPalAmount: conversion overflow.');
  }
  return BigInt(rounded);
}

/**
 * Inbound capture amount reconciliation helper.
 *
 * Returns true when the PayPal-reported amount (already converted to internal
 * units) is within `toleranceRate` of the recorded transaction amount. Used by
 * the idempotency guard for the ±2% cross-currency tolerance band.
 */
export function isAmountWithinTolerance(
  recordedInternal: bigint,
  reportedInternal: bigint,
  toleranceRate = 0.02,
): boolean {
  if (recordedInternal <= 0n) {
    return recordedInternal === reportedInternal;
  }
  const diff = Number(
    recordedInternal > reportedInternal
      ? recordedInternal - reportedInternal
      : reportedInternal - recordedInternal,
  );
  const allowed = Math.max(Number(recordedInternal) * toleranceRate, 1);
  return diff <= allowed;
}

/** Truncate a description to PayPal's 127-char purchase_unit limit. */
export function truncateDescription(text: string, max = 127): string {
  const clean = (text ?? '').trim();
  return clean.length <= max ? clean : clean.slice(0, max);
}
