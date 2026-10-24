import { describe, it, expect } from 'vitest'
import {
  parseRupeesToPaise,
  formatPaise,
  formatPaiseCompact,
  addPaise,
  subtractPaise,
  paiseToRupees,
} from '../../src/utils/money'
import { ValidationError } from '../../src/utils/errors'

describe('Money Utilities (Phase 2)', () => {
  describe('parseRupeesToPaise', () => {
    it('parses whole rupee strings into integer paise', () => {
      expect(parseRupeesToPaise('150')).toBe(15000)
      expect(parseRupeesToPaise('1')).toBe(100)
      expect(parseRupeesToPaise(150)).toBe(15000)
      expect(parseRupeesToPaise('36000')).toBe(3600000)
    })

    it('parses single and double decimal places correctly', () => {
      expect(parseRupeesToPaise('150.5')).toBe(15050)
      expect(parseRupeesToPaise('150.50')).toBe(15050)
      expect(parseRupeesToPaise('0.05', { allowZero: true })).toBe(5)
      expect(parseRupeesToPaise('0.5', { allowZero: true })).toBe(50)
    })

    it('accepts rupee symbols and INR prefixes/suffixes', () => {
      expect(parseRupeesToPaise('₹150.50')).toBe(15050)
      expect(parseRupeesToPaise('₹ 150.50')).toBe(15050)
      expect(parseRupeesToPaise('INR 150.50')).toBe(15050)
      expect(parseRupeesToPaise('150.50 INR')).toBe(15050)
      expect(parseRupeesToPaise('150.50 ₹')).toBe(15050)
    })

    it('handles international and Indian comma grouping', () => {
      expect(parseRupeesToPaise('1,500')).toBe(150000)
      expect(parseRupeesToPaise('1,50,000')).toBe(15000000)
      expect(parseRupeesToPaise('₹1,23,456.78')).toBe(12345678)
    })

    it('rejects numbers with more than 2 decimal places', () => {
      expect(() => parseRupeesToPaise('150.555')).toThrow(ValidationError)
      expect(() => parseRupeesToPaise('150.1234')).toThrow(
        /maximum 2 decimal places supported/
      )
    })

    it('rejects negative amounts', () => {
      expect(() => parseRupeesToPaise('-150')).toThrow(/cannot be negative/)
      expect(() => parseRupeesToPaise('-150.50')).toThrow(/cannot be negative/)
    })

    it('rejects zero amounts by default unless allowZero is enabled', () => {
      expect(() => parseRupeesToPaise('0')).toThrow(/must be greater than zero/)
      expect(() => parseRupeesToPaise('0.00')).toThrow(/must be greater than zero/)
      expect(parseRupeesToPaise('0', { allowZero: true })).toBe(0)
      expect(parseRupeesToPaise('0.00', { allowZero: true })).toBe(0)
    })

    it('rejects non-numeric or malformed strings', () => {
      expect(() => parseRupeesToPaise('')).toThrow(ValidationError)
      expect(() => parseRupeesToPaise('   ')).toThrow(ValidationError)
      expect(() => parseRupeesToPaise('abc')).toThrow(ValidationError)
      expect(() => parseRupeesToPaise('150.50.50')).toThrow(ValidationError)
    })

    it('rejects values exceeding Number.MAX_SAFE_INTEGER', () => {
      const unsafeValue = '9999999999999999999'
      expect(() => parseRupeesToPaise(unsafeValue)).toThrow(/exceeds safe monetary limit/)
    })
  })

  describe('formatPaise', () => {
    it('formats integer paise as standard INR currency', () => {
      const formatted150 = formatPaise(15000)
      expect(formatted150).toContain('150.00')

      const formattedLarge = formatPaise(12345678) // ₹1,23,456.78
      expect(formattedLarge).toContain('1,23,456.78')
    })

    it('formats zero correctly', () => {
      expect(formatPaise(0)).toContain('0.00')
    })

    it('formats negative balances with leading minus', () => {
      const formattedNeg = formatPaise(-15000)
      expect(formattedNeg).toMatch(/^-.*150\.00/)
    })
  })

  describe('formatPaiseCompact', () => {
    it('formats compact representations for charts', () => {
      const compact1K = formatPaiseCompact(150000) // ₹1,500
      expect(compact1K).toBeDefined()
    })
  })

  describe('Safe Arithmetic Helpers', () => {
    it('accurately adds integer paise without floating-point inaccuracies', () => {
      expect(addPaise(15050, 20025)).toBe(35075) // 150.50 + 200.25 = 350.75
      expect(addPaise(10, 20)).toBe(30)
    })

    it('accurately subtracts integer paise', () => {
      expect(subtractPaise(35075, 15050)).toBe(20025)
      expect(subtractPaise(100, 200)).toBe(-100)
    })

    it('converts paise to rupees accurately for display', () => {
      expect(paiseToRupees(15050)).toBe(150.5)
      expect(paiseToRupees(15000)).toBe(150)
      expect(paiseToRupees(0)).toBe(0)
    })

    it('rejects unsafe non-integer operands', () => {
      expect(() => addPaise(150.5, 200)).toThrow(ValidationError)
      expect(() => subtractPaise(200, 150.5)).toThrow(ValidationError)
    })
  })
})
