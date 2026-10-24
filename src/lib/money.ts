// Money is always handled as integer minor units (e.g. cents). Decimal strings
// only appear at the boundary with Wix APIs, which take/return "12.34" style values.

const ZERO_DECIMAL = new Set(['BIF', 'CLP', 'DJF', 'GNF', 'ISK', 'JPY', 'KMF', 'KRW', 'PYG', 'RWF', 'UGX', 'UYI', 'VND', 'VUV', 'XAF', 'XOF', 'XPF']);
const THREE_DECIMAL = new Set(['BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND']);

export function currencyExponent(currency: string): number {
  const code = currency.toUpperCase();
  if (ZERO_DECIMAL.has(code)) return 0;
  if (THREE_DECIMAL.has(code)) return 3;
  return 2;
}

/** Parses a decimal string/number from a Wix API into minor units without float math. */
export function toMinor(value: string | number, currency: string): number {
  const exp = currencyExponent(currency);
  const str = typeof value === 'number' ? value.toFixed(exp + 2) : value.trim();
  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(str);
  if (!match) throw new Error(`Invalid money amount: ${str}`);
  const [, sign, whole, frac = ''] = match;
  const padded = (frac + '0'.repeat(exp + 1)).slice(0, exp + 1);
  // Round half-up on the first dropped digit.
  let minor = Number(whole) * 10 ** exp + Number(padded.slice(0, exp) || '0');
  if (Number(padded[exp]) >= 5) minor += 1;
  return sign ? -minor : minor;
}

/** Formats minor units as the decimal string Wix APIs expect ("12.34"). */
export function toDecimalString(minor: number, currency: string): string {
  assertMinor(minor);
  const exp = currencyExponent(currency);
  if (exp === 0) return String(minor);
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor).toString().padStart(exp + 1, '0');
  return `${sign}${abs.slice(0, -exp)}.${abs.slice(-exp)}`;
}

export function formatMoney(minor: number, currency: string, locale: string): string {
  const exp = currencyExponent(currency);
  return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: exp, maximumFractionDigits: exp })
    .format(minor / 10 ** exp);
}

/** Applies a basis-point percentage (10000 = 100%) with half-up rounding, integer-only. */
export function applyBasisPoints(minor: number, basisPoints: number): number {
  assertMinor(minor);
  if (!Number.isInteger(basisPoints)) throw new Error('basisPoints must be an integer');
  const product = minor * basisPoints;
  const quotient = Math.trunc(product / 10000);
  const remainder = Math.abs(product % 10000);
  return remainder * 2 >= 10000 ? quotient + Math.sign(product) : quotient;
}

export function clamp(value: number, min: number | undefined, max: number | undefined): number {
  let out = value;
  if (min !== undefined && out < min) out = min;
  if (max !== undefined && out > max) out = max;
  return out;
}

export function assertMinor(minor: number): void {
  if (!Number.isSafeInteger(minor)) throw new Error(`Money must be a safe integer of minor units, got ${minor}`);
}
