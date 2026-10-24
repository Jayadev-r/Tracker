import { z } from 'zod'

/**
 * Validates a local date string in YYYY-MM-DD format with strict calendar boundary checking.
 * Rejects invalid dates such as 2026-02-29 (non-leap year) or 2026-04-31 (April has 30 days).
 */
export function isValidLocalDateString(dateStr: string): boolean {
  if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(dateStr)) {
    return false
  }
  const parts = dateStr.split('-')
  const year = Number(parts[0])
  const month = Number(parts[1])
  const day = Number(parts[2])

  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

/**
 * Validates that an amount is a positive safe integer representing paise.
 * Rejects floating-point values, zero, negative numbers, and unsafe integers.
 */
export function isPositivePaise(amount: number): boolean {
  return Number.isSafeInteger(amount) && amount > 0
}

/**
 * Validates an ISO 8601 timestamp string.
 */
export function isValidIsoTimestamp(timestamp: string): boolean {
  if (typeof timestamp !== 'string' || timestamp.trim() === '') {
    return false
  }
  const time = Date.parse(timestamp)
  return !isNaN(time)
}

// Reusable Zod primitives
export const localDateSchema = z.string().refine(isValidLocalDateString, {
  message: 'Invalid local date: must be a valid calendar date in YYYY-MM-DD format',
})

export const positivePaiseSchema = z.number().refine(isPositivePaise, {
  message: 'Amount in paise must be a positive safe integer (> 0)',
})

export const safeIntegerPaiseSchema = z.number().refine((val) => Number.isSafeInteger(val), {
  message: 'Amount in paise must be a safe integer',
})

export const isoTimestampSchema = z.string().refine(isValidIsoTimestamp, {
  message: 'Invalid timestamp: must be an ISO 8601 timestamp string',
})

export const uuidSchema = z.string().uuid({
  message: 'ID must be a valid UUID string',
})

// Transaction Schema
export const transactionTypeSchema = z.enum(['income', 'expense', 'refund', 'transfer'])
export const transactionSourceSchema = z.enum(['chat', 'form', 'import'])
export const transferRoleSchema = z.enum(['source', 'destination']).nullable().optional()

export const transactionSchema = z.object({
  id: uuidSchema,
  type: transactionTypeSchema,
  amountPaise: positivePaiseSchema,
  categoryId: uuidSchema.nullable(),
  accountId: uuidSchema.nullable(),
  description: z.string().max(300, 'Description must not exceed 300 characters'),
  transactionDate: localDateSchema,
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
  source: transactionSourceSchema,
  transferGroupId: uuidSchema.nullable(),
  transferRole: transferRoleSchema,
  refundOfId: uuidSchema.nullable(),
  deletedAt: isoTimestampSchema.nullable().optional(),
})

// Category Schema
export const categoryTypeSchema = z.enum(['income', 'expense'])

export const categorySchema = z.object({
  id: uuidSchema,
  name: z.string().trim().min(1, 'Category name cannot be empty').max(50, 'Category name too long'),
  type: categoryTypeSchema,
  icon: z.string().trim().min(1, 'Icon identifier required'),
  color: z.string().trim().min(1, 'Color identifier required'),
  aliases: z.array(z.string().trim().min(1)).default([]),
  isArchived: z.boolean().default(false),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
})

// Account Schema
export const accountTypeSchema = z.enum(['cash', 'bank', 'credit_card', 'other'])

export const accountSchema = z.object({
  id: uuidSchema,
  name: z.string().trim().min(1, 'Account name cannot be empty').max(50, 'Account name too long'),
  type: accountTypeSchema,
  openingBalancePaise: safeIntegerPaiseSchema,
  openingBalanceDate: localDateSchema,
  isArchived: z.boolean().default(false),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
})

// Budget Schema
export const budgetPeriodSchema = z.enum(['weekly', 'monthly'])

export const budgetSchema = z.object({
  id: uuidSchema,
  categoryId: uuidSchema,
  period: budgetPeriodSchema,
  periodStart: localDateSchema,
  limitPaise: positivePaiseSchema,
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
})

// Settings Schema
export const themePreferenceSchema = z.enum(['system', 'light', 'dark'])
export const weekStartDaySchema = z.union([z.literal(0), z.literal(1)])

export const settingsSchema = z.object({
  id: z.literal('app-settings'),
  currency: z.literal('INR'),
  locale: z.literal('en-IN'),
  theme: themePreferenceSchema,
  weekStartsOn: weekStartDaySchema,
  defaultAccountId: uuidSchema.nullable(),
  schemaVersion: z.number().int().positive(),
  backupReminderEnabled: z.boolean(),
  lastBackupAt: z.string().nullable().refine((val) => val === null || isValidIsoTimestamp(val), {
    message: 'lastBackupAt must be a valid ISO timestamp or null',
  }),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
})
