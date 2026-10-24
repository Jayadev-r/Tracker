import { describe, it, expect } from 'vitest'
import {
  transactionSchema,
  categorySchema,
  accountSchema,
  budgetSchema,
  settingsSchema,
  isValidLocalDateString,
  isPositivePaise,
} from '../../src/db/schema'
import { generateUuid } from '../../src/utils/ids'

describe('Domain Schema Validation (Phase 1)', () => {
  const validUuid = generateUuid()
  const validIsoNow = new Date().toISOString()

  describe('Paise Amount Validation', () => {
    it('accepts positive safe integers for paise amounts', () => {
      expect(isPositivePaise(100)).toBe(true) // ₹1.00
      expect(isPositivePaise(15000)).toBe(true) // ₹150.00
      expect(isPositivePaise(1)).toBe(true) // 1 paisa
      expect(isPositivePaise(10000000000)).toBe(true) // ₹10,00,00,000.00
    })

    it('rejects zero, negative numbers, decimals, and unsafe integers', () => {
      expect(isPositivePaise(0)).toBe(false)
      expect(isPositivePaise(-15000)).toBe(false)
      expect(isPositivePaise(150.5)).toBe(false)
      expect(isPositivePaise(150.01)).toBe(false)
      expect(isPositivePaise(Number.MAX_SAFE_INTEGER + 100)).toBe(false)
      expect(isPositivePaise(NaN)).toBe(false)
      expect(isPositivePaise(Infinity)).toBe(false)
    })
  })

  describe('Local Date Validation (YYYY-MM-DD)', () => {
    it('accepts valid calendar dates', () => {
      expect(isValidLocalDateString('2026-01-01')).toBe(true)
      expect(isValidLocalDateString('2026-10-24')).toBe(true)
      expect(isValidLocalDateString('2026-12-31')).toBe(true)
      expect(isValidLocalDateString('2024-02-29')).toBe(true) // 2024 is leap year
    })

    it('rejects invalid calendar dates and malformed strings', () => {
      expect(isValidLocalDateString('2026-02-29')).toBe(false) // 2026 is NOT a leap year
      expect(isValidLocalDateString('2026-04-31')).toBe(false) // April has 30 days
      expect(isValidLocalDateString('2026-06-31')).toBe(false) // June has 30 days
      expect(isValidLocalDateString('2026-13-01')).toBe(false) // Invalid month
      expect(isValidLocalDateString('2026-00-10')).toBe(false) // Invalid month
      expect(isValidLocalDateString('2026-05-32')).toBe(false) // Invalid day
      expect(isValidLocalDateString('2026/10/24')).toBe(false) // Slash separator
      expect(isValidLocalDateString('24-10-2026')).toBe(false) // DD-MM-YYYY
      expect(isValidLocalDateString('not-a-date')).toBe(false)
    })
  })

  describe('Transaction Schema', () => {
    const validTransaction = {
      id: validUuid,
      type: 'expense' as const,
      amountPaise: 15000,
      categoryId: generateUuid(),
      accountId: generateUuid(),
      description: 'Lunch with colleagues',
      transactionDate: '2026-10-24',
      createdAt: validIsoNow,
      updatedAt: validIsoNow,
      source: 'chat' as const,
      transferGroupId: null,
      refundOfId: null,
    }

    it('successfully parses valid transaction data', () => {
      const parsed = transactionSchema.parse(validTransaction)
      expect(parsed.id).toBe(validTransaction.id)
      expect(parsed.amountPaise).toBe(15000)
      expect(parsed.type).toBe('expense')
    })

    it('rejects decimal amounts in amountPaise', () => {
      expect(() =>
        transactionSchema.parse({
          ...validTransaction,
          amountPaise: 150.5,
        })
      ).toThrow()
    })

    it('rejects negative or zero transaction amounts', () => {
      expect(() =>
        transactionSchema.parse({
          ...validTransaction,
          amountPaise: -15000,
        })
      ).toThrow()

      expect(() =>
        transactionSchema.parse({
          ...validTransaction,
          amountPaise: 0,
        })
      ).toThrow()
    })

    it('rejects invalid transaction dates', () => {
      expect(() =>
        transactionSchema.parse({
          ...validTransaction,
          transactionDate: '2026-02-29',
        })
      ).toThrow()
    })

    it('rejects descriptions exceeding 300 characters', () => {
      const longDescription = 'a'.repeat(301)
      expect(() =>
        transactionSchema.parse({
          ...validTransaction,
          description: longDescription,
        })
      ).toThrow()
    })

    it('rejects unsupported transaction types', () => {
      expect(() =>
        transactionSchema.parse({
          ...validTransaction,
          type: 'investment',
        })
      ).toThrow()
    })
  })

  describe('Category Schema', () => {
    it('validates correct category data', () => {
      const validCategory = {
        id: validUuid,
        name: 'Groceries',
        type: 'expense' as const,
        icon: 'ShoppingBag',
        color: '#10b981',
        aliases: ['grocery', 'supermarket'],
        isArchived: false,
        createdAt: validIsoNow,
        updatedAt: validIsoNow,
      }
      const parsed = categorySchema.parse(validCategory)
      expect(parsed.name).toBe('Groceries')
      expect(parsed.aliases).toHaveLength(2)
    })

    it('rejects empty category name and invalid types', () => {
      expect(() =>
        categorySchema.parse({
          id: validUuid,
          name: '   ',
          type: 'expense',
          icon: 'Tag',
          color: '#ffffff',
          aliases: [],
          isArchived: false,
          createdAt: validIsoNow,
          updatedAt: validIsoNow,
        })
      ).toThrow()

      expect(() =>
        categorySchema.parse({
          id: validUuid,
          name: 'Groceries',
          type: 'savings', // Invalid type
          icon: 'Tag',
          color: '#ffffff',
          aliases: [],
          isArchived: false,
          createdAt: validIsoNow,
          updatedAt: validIsoNow,
        })
      ).toThrow()
    })
  })

  describe('Account Schema', () => {
    it('validates account data with non-negative or zero balance', () => {
      const validAccount = {
        id: validUuid,
        name: 'Primary Bank',
        type: 'bank' as const,
        openingBalancePaise: 500000, // ₹5,000.00
        openingBalanceDate: '2026-10-24',
        isArchived: false,
        createdAt: validIsoNow,
        updatedAt: validIsoNow,
      }
      const parsed = accountSchema.parse(validAccount)
      expect(parsed.openingBalancePaise).toBe(500000)
    })

    it('rejects invalid account types and non-safe integer balances', () => {
      expect(() =>
        accountSchema.parse({
          id: validUuid,
          name: 'Account',
          type: 'crypto', // Invalid type
          openingBalancePaise: 0,
          openingBalanceDate: '2026-10-24',
          isArchived: false,
          createdAt: validIsoNow,
          updatedAt: validIsoNow,
        })
      ).toThrow()

      expect(() =>
        accountSchema.parse({
          id: validUuid,
          name: 'Account',
          type: 'cash',
          openingBalancePaise: 100.5, // Decimal not allowed
          openingBalanceDate: '2026-10-24',
          isArchived: false,
          createdAt: validIsoNow,
          updatedAt: validIsoNow,
        })
      ).toThrow()
    })
  })

  describe('Budget Schema', () => {
    it('validates active budget definitions', () => {
      const validBudget = {
        id: validUuid,
        categoryId: generateUuid(),
        period: 'monthly' as const,
        periodStart: '2026-10-01',
        limitPaise: 2000000, // ₹20,000.00
        createdAt: validIsoNow,
        updatedAt: validIsoNow,
      }
      const parsed = budgetSchema.parse(validBudget)
      expect(parsed.limitPaise).toBe(2000000)
      expect(parsed.period).toBe('monthly')
    })

    it('rejects zero or negative budget limits', () => {
      expect(() =>
        budgetSchema.parse({
          id: validUuid,
          categoryId: generateUuid(),
          period: 'monthly',
          periodStart: '2026-10-01',
          limitPaise: 0,
          createdAt: validIsoNow,
          updatedAt: validIsoNow,
        })
      ).toThrow()
    })
  })

  describe('Settings Schema', () => {
    it('validates standard application settings', () => {
      const validSettings = {
        id: 'app-settings' as const,
        currency: 'INR' as const,
        locale: 'en-IN' as const,
        theme: 'system' as const,
        weekStartsOn: 1 as const,
        defaultAccountId: validUuid,
        schemaVersion: 1,
        backupReminderEnabled: false,
        lastBackupAt: null,
        createdAt: validIsoNow,
        updatedAt: validIsoNow,
      }
      const parsed = settingsSchema.parse(validSettings)
      expect(parsed.currency).toBe('INR')
      expect(parsed.locale).toBe('en-IN')
      expect(parsed.schemaVersion).toBe(1)
    })

    it('rejects non-INR currency or invalid week start days', () => {
      expect(() =>
        settingsSchema.parse({
          id: 'app-settings',
          currency: 'USD', // Only INR is permitted in v1
          locale: 'en-IN',
          theme: 'system',
          weekStartsOn: 1,
          defaultAccountId: null,
          schemaVersion: 1,
          backupReminderEnabled: false,
          lastBackupAt: null,
          createdAt: validIsoNow,
          updatedAt: validIsoNow,
        })
      ).toThrow()

      expect(() =>
        settingsSchema.parse({
          id: 'app-settings',
          currency: 'INR',
          locale: 'en-IN',
          theme: 'system',
          weekStartsOn: 5, // Invalid weekStartsOn
          defaultAccountId: null,
          schemaVersion: 1,
          backupReminderEnabled: false,
          lastBackupAt: null,
          createdAt: validIsoNow,
          updatedAt: validIsoNow,
        })
      ).toThrow()
    })
  })
})
