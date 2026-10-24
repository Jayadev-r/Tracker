import { ValidationError } from './errors'

export interface ParseMoneyOptions {
  allowZero?: boolean
}

/**
 * Validates that a value is a safe integer in paise.
 */
export function isSafePaiseAmount(amount: number): boolean {
  return Number.isSafeInteger(amount)
}

/**
 * Validates that an amount is a positive safe integer (> 0).
 */
export function isPositivePaise(amount: number): boolean {
  return Number.isSafeInteger(amount) && amount > 0
}

/**
 * Parses a rupee string or number into integer paise.
 *
 * Rules:
 * - Accepts rupee values with optional currency symbols ('₹', 'INR') and comma formatting (standard and Indian grouping).
 * - "150" -> 15000
 * - "150.5" -> 15050
 * - "150.50" -> 15050
 * - "₹150.50" -> 15050
 * - "1,50,000" -> 15000000
 * - Rejects precision exceeding 2 decimal places (e.g. "150.555").
 * - Rejects negative amounts.
 * - Rejects zero amounts by default (unless options.allowZero is true).
 * - Rejects amounts exceeding Number.MAX_SAFE_INTEGER.
 * - Uses string/integer arithmetic to prevent binary floating-point errors.
 */
export function parseRupeesToPaise(
  input: string | number,
  options: ParseMoneyOptions = {}
): number {
  if (input === null || input === undefined) {
    throw new ValidationError('Monetary amount cannot be null or undefined.')
  }

  let cleaned = String(input).trim()

  if (cleaned === '') {
    throw new ValidationError('Monetary amount cannot be empty.')
  }

  // Remove currency symbols, currency codes, and whitespace
  cleaned = cleaned.replace(/^(₹|INR)\s*/i, '').replace(/\s*(₹|INR)$/i, '').trim()

  // Check for minus sign
  if (cleaned.startsWith('-')) {
    throw new ValidationError('Monetary amount cannot be negative.')
  }

  // Remove valid commas (both standard international and Indian numbering commas)
  cleaned = cleaned.replace(/,/g, '')

  // Validate numeric structure with at most one decimal point
  if (!/^\d+(\.\d+)?$/.test(cleaned)) {
    throw new ValidationError(`Invalid monetary amount format: "${input}"`)
  }

  const [integerStr = '0', fractionalStr = ''] = cleaned.split('.')

  // Enforce maximum 2 decimal places (paisa is 1/100 of rupee)
  if (fractionalStr.length > 2) {
    throw new ValidationError(
      `Invalid monetary precision: maximum 2 decimal places supported, got "${fractionalStr}"`
    )
  }

  // Pad fractional part to exactly 2 digits: "5" -> "50", "" -> "00"
  const paddedFractional = fractionalStr.padEnd(2, '0')

  // Parse as BigInt to prevent intermediate floating-point precision loss
  try {
    const bigPaise = BigInt(integerStr) * 100n + BigInt(paddedFractional)

    if (bigPaise > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new ValidationError(`Amount exceeds safe monetary limit: "${input}"`)
    }

    const paise = Number(bigPaise)

    if (paise === 0 && !options.allowZero) {
      throw new ValidationError('Monetary amount must be greater than zero.')
    }

    return paise
  } catch (err) {
    if (err instanceof ValidationError) {
      throw err
    }
    throw new ValidationError(`Failed to parse monetary amount: "${input}"`)
  }
}

/**
 * Converts integer paise into standard formatted INR currency (e.g. ₹1,23,456.78).
 */
export function formatPaise(
  amountPaise: number,
  options?: { showCurrencySymbol?: boolean }
): string {
  if (!Number.isSafeInteger(amountPaise)) {
    throw new ValidationError(`Invalid paise amount for formatting: ${amountPaise}`)
  }

  const isNegative = amountPaise < 0
  const absPaise = Math.abs(amountPaise)
  const rupees = absPaise / 100

  const formatter = new Intl.NumberFormat('en-IN', {
    style: options?.showCurrencySymbol === false ? 'decimal' : 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

  const formatted = formatter.format(rupees)
  return isNegative ? `-${formatted}` : formatted
}

/**
 * Formats integer paise into a compact INR representation for charts and summaries (e.g. ₹1.5K, ₹2.4L).
 */
export function formatPaiseCompact(amountPaise: number): string {
  if (!Number.isSafeInteger(amountPaise)) {
    throw new ValidationError(`Invalid paise amount for formatting: ${amountPaise}`)
  }

  const rupees = amountPaise / 100
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(rupees)
}

/**
 * Converts integer paise to a floating-point rupee number for display components only.
 * DO NOT use this result for internal financial arithmetic.
 */
export function paiseToRupees(amountPaise: number): number {
  if (!Number.isSafeInteger(amountPaise)) {
    throw new ValidationError(`Invalid paise amount: ${amountPaise}`)
  }
  return amountPaise / 100
}

/**
 * Safely adds two integer paise amounts and checks for safe integer limits.
 */
export function addPaise(aPaise: number, bPaise: number): number {
  if (!Number.isSafeInteger(aPaise) || !Number.isSafeInteger(bPaise)) {
    throw new ValidationError('Operands for addPaise must be safe integers.')
  }
  const result = aPaise + bPaise
  if (!Number.isSafeInteger(result)) {
    throw new ValidationError('Result of addPaise exceeds safe integer limit.')
  }
  return result
}

/**
 * Safely subtracts two integer paise amounts and checks for safe integer limits.
 */
export function subtractPaise(aPaise: number, bPaise: number): number {
  if (!Number.isSafeInteger(aPaise) || !Number.isSafeInteger(bPaise)) {
    throw new ValidationError('Operands for subtractPaise must be safe integers.')
  }
  const result = aPaise - bPaise
  if (!Number.isSafeInteger(result)) {
    throw new ValidationError('Result of subtractPaise exceeds safe integer limit.')
  }
  return result
}
