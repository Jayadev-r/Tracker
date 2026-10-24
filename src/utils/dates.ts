import { ValidationError } from './errors'

/**
 * Checks if a given year is a leap year according to the Gregorian calendar rules.
 */
export function isLeapYear(year: number): boolean {
  if (!Number.isInteger(year)) return false
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

/**
 * Returns the number of days in a specific calendar month (1-indexed: 1 = Jan, 12 = Dec).
 */
export function getDaysInMonth(year: number, month: number): number {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new ValidationError(`Invalid year or month: year=${year}, month=${month}`)
  }
  const daysMap = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return daysMap[month - 1] ?? 30
}

/**
 * Formats a Date object into a local date string (YYYY-MM-DD) using device-local calendar values.
 * This ensures no timezone shifting occurs across UTC boundaries.
 */
export function getLocalTodayDateString(date: Date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Formats a Date object representing yesterday into a local date string (YYYY-MM-DD).
 */
export function getLocalYesterdayDateString(referenceDate: Date = new Date()): string {
  const d = new Date(referenceDate)
  d.setDate(d.getDate() - 1)
  return getLocalTodayDateString(d)
}

/**
 * Validates a local date string in YYYY-MM-DD format with strict calendar boundary checking.
 * Rejects invalid dates such as 2026-02-29 (non-leap year) or 2026-04-31 (April has 30 days).
 */
export function isValidLocalDateString(dateStr: string): boolean {
  if (typeof dateStr !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(dateStr)) {
    return false
  }
  const parts = dateStr.split('-')
  const year = Number(parts[0])
  const month = Number(parts[1])
  const day = Number(parts[2])

  const maxDays = getDaysInMonth(year, month)
  return day >= 1 && day <= maxDays
}

/**
 * Parses supported user-facing date expressions (e.g. 'today', 'yesterday', or 'YYYY-MM-DD').
 */
export function parseRelativeLocalDateString(
  token: string,
  referenceDate: Date = new Date()
): string | null {
  const normalized = token.trim().toLowerCase()
  if (normalized === 'today') {
    return getLocalTodayDateString(referenceDate)
  }
  if (normalized === 'yesterday') {
    return getLocalYesterdayDateString(referenceDate)
  }
  if (isValidLocalDateString(normalized)) {
    return normalized
  }
  return null
}

/**
 * Returns the first day of the month (YYYY-MM-01) for a given local date string.
 */
export function getMonthStartLocalDateString(dateStr: string): string {
  if (!isValidLocalDateString(dateStr)) {
    throw new ValidationError(`Cannot get month start for invalid date: "${dateStr}"`)
  }
  const [year, month] = dateStr.split('-')
  return `${year}-${month}-01`
}

/**
 * Returns the last day of the month for a given local date string.
 * Accurately handles leap years for February.
 */
export function getMonthEndLocalDateString(dateStr: string): string {
  if (!isValidLocalDateString(dateStr)) {
    throw new ValidationError(`Cannot get month end for invalid date: "${dateStr}"`)
  }
  const parts = dateStr.split('-')
  const year = Number(parts[0])
  const month = Number(parts[1])
  const lastDay = getDaysInMonth(year, month)
  return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
}

/**
 * Navigates to the first day of the previous calendar month.
 * Correctly rolls over December to January and handles year boundaries.
 */
export function getPreviousMonthLocalDateString(dateStr: string): string {
  if (!isValidLocalDateString(dateStr)) {
    throw new ValidationError(`Cannot navigate previous month for invalid date: "${dateStr}"`)
  }
  const parts = dateStr.split('-')
  let year = Number(parts[0])
  let month = Number(parts[1]) - 1

  if (month < 1) {
    month = 12
    year -= 1
  }

  return `${year}-${String(month).padStart(2, '0')}-01`
}

/**
 * Navigates to the first day of the next calendar month.
 * Correctly rolls over December to January and handles year boundaries.
 */
export function getNextMonthLocalDateString(dateStr: string): string {
  if (!isValidLocalDateString(dateStr)) {
    throw new ValidationError(`Cannot navigate next month for invalid date: "${dateStr}"`)
  }
  const parts = dateStr.split('-')
  let year = Number(parts[0])
  let month = Number(parts[1]) + 1

  if (month > 12) {
    month = 1
    year += 1
  }

  return `${year}-${String(month).padStart(2, '0')}-01`
}

/**
 * Compares two YYYY-MM-DD local date strings.
 * Returns -1 if a < b, 0 if a === b, 1 if a > b.
 */
export function compareLocalDates(a: string, b: string): number {
  if (!isValidLocalDateString(a) || !isValidLocalDateString(b)) {
    throw new ValidationError(`Cannot compare invalid local dates: "${a}", "${b}"`)
  }
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

/**
 * Checks whether a local date falls within an inclusive [startDate, endDate] range.
 */
export function isDateInRange(dateStr: string, startDateStr: string, endDateStr: string): boolean {
  if (
    !isValidLocalDateString(dateStr) ||
    !isValidLocalDateString(startDateStr) ||
    !isValidLocalDateString(endDateStr)
  ) {
    throw new ValidationError(
      `Invalid date in range check: date="${dateStr}", start="${startDateStr}", end="${endDateStr}"`
    )
  }
  return dateStr >= startDateStr && dateStr <= endDateStr
}
