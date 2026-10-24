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
