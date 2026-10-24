import { describe, it, expect } from 'vitest'
import {
  isLeapYear,
  getDaysInMonth,
  getLocalTodayDateString,
  getLocalYesterdayDateString,
  isValidLocalDateString,
  parseRelativeLocalDateString,
  getMonthStartLocalDateString,
  getMonthEndLocalDateString,
  getPreviousMonthLocalDateString,
  getNextMonthLocalDateString,
  compareLocalDates,
  isDateInRange,
} from '../../src/utils/dates'
import { ValidationError } from '../../src/utils/errors'

describe('Date Utilities and Calendar Boundaries (Phase 2)', () => {
  describe('isLeapYear', () => {
    it('correctly identifies leap years and non-leap years', () => {
      expect(isLeapYear(2024)).toBe(true)
      expect(isLeapYear(2000)).toBe(true) // Divisible by 400
      expect(isLeapYear(2026)).toBe(false)
      expect(isLeapYear(1900)).toBe(false) // Divisible by 100 but not 400
      expect(isLeapYear(2023)).toBe(false)
    })
  })

  describe('getDaysInMonth', () => {
    it('returns exact days for all 12 calendar months', () => {
      expect(getDaysInMonth(2026, 1)).toBe(31) // Jan
      expect(getDaysInMonth(2026, 2)).toBe(28) // Feb non-leap
      expect(getDaysInMonth(2024, 2)).toBe(29) // Feb leap
      expect(getDaysInMonth(2026, 3)).toBe(31) // Mar
      expect(getDaysInMonth(2026, 4)).toBe(30) // Apr
      expect(getDaysInMonth(2026, 5)).toBe(31) // May
      expect(getDaysInMonth(2026, 6)).toBe(30) // Jun
      expect(getDaysInMonth(2026, 7)).toBe(31) // Jul
      expect(getDaysInMonth(2026, 8)).toBe(31) // Aug
      expect(getDaysInMonth(2026, 9)).toBe(30) // Sep
      expect(getDaysInMonth(2026, 10)).toBe(31) // Oct
      expect(getDaysInMonth(2026, 11)).toBe(30) // Nov
      expect(getDaysInMonth(2026, 12)).toBe(31) // Dec
    })

    it('rejects invalid months', () => {
      expect(() => getDaysInMonth(2026, 0)).toThrow(ValidationError)
      expect(() => getDaysInMonth(2026, 13)).toThrow(ValidationError)
    })
  })

  describe('Local Date Formatting and Yesterday', () => {
    it('formats a date to YYYY-MM-DD using device-local values', () => {
      const d = new Date(2026, 9, 24) // Month index 9 = October
      expect(getLocalTodayDateString(d)).toBe('2026-10-24')
    })

    it('calculates yesterday across month boundary', () => {
      const firstOfMarch = new Date(2026, 2, 1) // 2026-03-01
      expect(getLocalYesterdayDateString(firstOfMarch)).toBe('2026-02-28')

      const leapFirstOfMarch = new Date(2024, 2, 1) // 2024-03-01 (leap)
      expect(getLocalYesterdayDateString(leapFirstOfMarch)).toBe('2024-02-29')
    })

    it('calculates yesterday across year boundary', () => {
      const newYearDay = new Date(2026, 0, 1) // 2026-01-01
      expect(getLocalYesterdayDateString(newYearDay)).toBe('2025-12-31')
    })
  })

  describe('parseRelativeLocalDateString', () => {
    const fixedNow = new Date(2026, 9, 24) // 2026-10-24

    it('resolves "today" to current local date', () => {
      expect(parseRelativeLocalDateString('today', fixedNow)).toBe('2026-10-24')
      expect(parseRelativeLocalDateString('TODAY', fixedNow)).toBe('2026-10-24')
    })

    it('resolves "yesterday" to previous local date', () => {
      expect(parseRelativeLocalDateString('yesterday', fixedNow)).toBe('2026-10-23')
      expect(parseRelativeLocalDateString('YESTERDAY', fixedNow)).toBe('2026-10-23')
    })

    it('passes through valid YYYY-MM-DD date strings', () => {
      expect(parseRelativeLocalDateString('2026-05-15', fixedNow)).toBe('2026-05-15')
    })

    it('returns null for unrecognized strings', () => {
      expect(parseRelativeLocalDateString('tomorrow', fixedNow)).toBeNull()
      expect(parseRelativeLocalDateString('2026-02-29', fixedNow)).toBeNull() // invalid non-leap
      expect(parseRelativeLocalDateString('invalid', fixedNow)).toBeNull()
    })
  })

  describe('Month Boundaries and Navigation', () => {
    it('returns month start and end correctly', () => {
      expect(getMonthStartLocalDateString('2026-10-24')).toBe('2026-10-01')
      expect(getMonthEndLocalDateString('2026-10-24')).toBe('2026-10-31')

      // February in leap year
      expect(getMonthStartLocalDateString('2024-02-15')).toBe('2024-02-01')
      expect(getMonthEndLocalDateString('2024-02-15')).toBe('2024-02-29')

      // February in non-leap year
      expect(getMonthStartLocalDateString('2026-02-10')).toBe('2026-02-01')
      expect(getMonthEndLocalDateString('2026-02-10')).toBe('2026-02-28')
    })

    it('navigates previous month across year rollover (December to January)', () => {
      expect(getPreviousMonthLocalDateString('2026-01-15')).toBe('2025-12-01')
      expect(getPreviousMonthLocalDateString('2026-05-20')).toBe('2026-04-01')
    })

    it('navigates next month across year rollover (December to January)', () => {
      expect(getNextMonthLocalDateString('2025-12-31')).toBe('2026-01-01')
      expect(getNextMonthLocalDateString('2026-04-10')).toBe('2026-05-01')
    })
  })

  describe('Date Comparisons and Range Checks', () => {
    it('compares local dates lexicographically with exact order', () => {
      expect(compareLocalDates('2026-01-01', '2026-01-02')).toBe(-1)
      expect(compareLocalDates('2026-05-15', '2026-05-15')).toBe(0)
      expect(compareLocalDates('2026-12-31', '2025-12-31')).toBe(1)
    })

    it('checks date inclusion in an inclusive range', () => {
      expect(isDateInRange('2026-10-15', '2026-10-01', '2026-10-31')).toBe(true)
      expect(isDateInRange('2026-10-01', '2026-10-01', '2026-10-31')).toBe(true)
      expect(isDateInRange('2026-10-31', '2026-10-01', '2026-10-31')).toBe(true)
      expect(isDateInRange('2026-09-30', '2026-10-01', '2026-10-31')).toBe(false)
      expect(isDateInRange('2026-11-01', '2026-10-01', '2026-10-31')).toBe(false)
    })
  })
})
