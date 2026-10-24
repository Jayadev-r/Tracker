import { describe, it, expect } from 'vitest'
import {
  calculatePeriodSummary,
  calculateCategorySummaries,
  calculateDailySummaries,
} from '../../src/services/reportingService'
import type { Transaction, Category } from '../../src/types'
import { generateUuid } from '../../src/utils/ids'

describe('Reporting Service & Financial Formulas (Phase 2)', () => {
  const foodCategoryId = generateUuid()
  const fuelCategoryId = generateUuid()
  const salaryCategoryId = generateUuid()
  const accountId = generateUuid()
  const now = new Date().toISOString()

  const categories: Category[] = [
    {
      id: foodCategoryId,
      name: 'Food',
      type: 'expense',
      icon: 'Utensils',
      color: '#f97316',
      aliases: ['food'],
      isArchived: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: fuelCategoryId,
      name: 'Fuel',
      type: 'expense',
      icon: 'Fuel',
      color: '#eab308',
      aliases: ['fuel'],
      isArchived: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: salaryCategoryId,
      name: 'Salary',
      type: 'income',
      icon: 'Briefcase',
      color: '#10b981',
      aliases: ['salary'],
      isArchived: false,
      createdAt: now,
      updatedAt: now,
    },
  ]

  describe('Specification Section 14.5 Financial Test Fixtures', () => {
    // Ledger:
    // Income: ₹36,000 (3,600,000 paise)
    // Expense: ₹100 Food (10,000 paise)
    // Expense: ₹200 Fuel (20,000 paise)
    // Refund: ₹20 Food (2,000 paise)
    const fixtureTransactions: Transaction[] = [
      {
        id: generateUuid(),
        type: 'income',
        amountPaise: 3600000,
        categoryId: salaryCategoryId,
        accountId,
        description: 'Monthly Salary',
        transactionDate: '2026-10-01',
        createdAt: now,
        updatedAt: now,
        source: 'form',
        transferGroupId: null,
        refundOfId: null,
      },
      {
        id: generateUuid(),
        type: 'expense',
        amountPaise: 10000,
        categoryId: foodCategoryId,
        accountId,
        description: 'Food expense',
        transactionDate: '2026-10-05',
        createdAt: now,
        updatedAt: now,
        source: 'form',
        transferGroupId: null,
        refundOfId: null,
      },
      {
        id: generateUuid(),
        type: 'expense',
        amountPaise: 20000,
        categoryId: fuelCategoryId,
        accountId,
        description: 'Fuel expense',
        transactionDate: '2026-10-10',
        createdAt: now,
        updatedAt: now,
        source: 'form',
        transferGroupId: null,
        refundOfId: null,
      },
      {
        id: generateUuid(),
        type: 'refund',
        amountPaise: 2000,
        categoryId: foodCategoryId,
        accountId,
        description: 'Food refund',
        transactionDate: '2026-10-12',
        createdAt: now,
        updatedAt: now,
        source: 'form',
        transferGroupId: null,
        refundOfId: null,
      },
    ]

    it('produces exact financial totals according to specification formulas', () => {
      const summary = calculatePeriodSummary(fixtureTransactions)

      // Expected:
      // Total income = ₹36,000 (3,600,000 paise)
      expect(summary.incomePaise).toBe(3600000)

      // Gross expenses = ₹300 (30,000 paise)
      expect(summary.grossExpensesPaise).toBe(30000)

      // Refunds = ₹20 (2,000 paise)
      expect(summary.refundsPaise).toBe(2000)

      // Net expenses = ₹280 (28,000 paise)
      expect(summary.netExpensesPaise).toBe(28000)

      // Remaining from recorded income = ₹35,720 (3,572,000 paise)
      expect(summary.remainingFromRecordedIncomePaise).toBe(3572000)

      // Savings rate = (35,720 / 36,000) * 100
      expect(summary.savingsRatePercentage).toBeCloseTo((3572000 / 3600000) * 100, 2)
      expect(summary.transactionCount).toBe(4)
      expect(summary.transferCount).toBe(0)
    })

    it('produces exact category-wise net expenses with refunds subtracted', () => {
      const categorySummaries = calculateCategorySummaries(fixtureTransactions, categories)

      // Food net expense: ₹100 - ₹20 = ₹80 (8000 paise)
      const foodSummary = categorySummaries.find((c) => c.categoryId === foodCategoryId)
      expect(foodSummary).toBeDefined()
      expect(foodSummary?.grossAmountPaise).toBe(10000)
      expect(foodSummary?.refundsPaise).toBe(2000)
      expect(foodSummary?.netAmountPaise).toBe(8000)

      // Fuel net expense: ₹200 (20000 paise)
      const fuelSummary = categorySummaries.find((c) => c.categoryId === fuelCategoryId)
      expect(fuelSummary).toBeDefined()
      expect(fuelSummary?.grossAmountPaise).toBe(20000)
      expect(fuelSummary?.refundsPaise).toBe(0)
      expect(fuelSummary?.netAmountPaise).toBe(20000)
    })
  })

  describe('Exclusion of Transfers from Income and Expense Totals', () => {
    it('strictly excludes transfers from all income, expense, and refund totals', () => {
      const transferGroupId = generateUuid()
      const txWithTransfer: Transaction[] = [
        {
          id: generateUuid(),
          type: 'income',
          amountPaise: 50000, // ₹500
          categoryId: salaryCategoryId,
          accountId,
          description: 'Income',
          transactionDate: '2026-10-15',
          createdAt: now,
          updatedAt: now,
          source: 'form',
          transferGroupId: null,
          refundOfId: null,
        },
        {
          id: generateUuid(),
          type: 'expense',
          amountPaise: 20000, // ₹200
          categoryId: foodCategoryId,
          accountId,
          description: 'Expense',
          transactionDate: '2026-10-15',
          createdAt: now,
          updatedAt: now,
          source: 'form',
          transferGroupId: null,
          refundOfId: null,
        },
        // Transfer sides: ₹1000 moved between accounts
        {
          id: generateUuid(),
          type: 'transfer',
          amountPaise: 100000,
          categoryId: null,
          accountId,
          description: 'Transfer Out',
          transactionDate: '2026-10-16',
          createdAt: now,
          updatedAt: now,
          source: 'form',
          transferGroupId,
          transferRole: 'source',
          refundOfId: null,
        },
        {
          id: generateUuid(),
          type: 'transfer',
          amountPaise: 100000,
          categoryId: null,
          accountId: generateUuid(),
          description: 'Transfer In',
          transactionDate: '2026-10-16',
          createdAt: now,
          updatedAt: now,
          source: 'form',
          transferGroupId,
          transferRole: 'destination',
          refundOfId: null,
        },
      ]

      const summary = calculatePeriodSummary(txWithTransfer)

      // Transfers must NOT be counted as income or expenses
      expect(summary.incomePaise).toBe(50000)
      expect(summary.grossExpensesPaise).toBe(20000)
      expect(summary.netExpensesPaise).toBe(20000)
      expect(summary.remainingFromRecordedIncomePaise).toBe(30000)
      expect(summary.transferCount).toBe(2)
      expect(summary.transactionCount).toBe(4)
    })
  })

  describe('Edge Cases in Reporting Formulas', () => {
    it('sets savingsRate to null (unavailable) when income is zero', () => {
      const onlyExpenses: Transaction[] = [
        {
          id: generateUuid(),
          type: 'expense',
          amountPaise: 5000,
          categoryId: foodCategoryId,
          accountId,
          description: 'Snacks',
          transactionDate: '2026-10-01',
          createdAt: now,
          updatedAt: now,
          source: 'form',
          transferGroupId: null,
          refundOfId: null,
        },
      ]

      const summary = calculatePeriodSummary(onlyExpenses)
      expect(summary.incomePaise).toBe(0)
      expect(summary.netExpensesPaise).toBe(5000)
      expect(summary.remainingFromRecordedIncomePaise).toBe(-5000)
      expect(summary.savingsRatePercentage).toBeNull() // Never NaN or Infinity
    })

    it('correctly reports negative net expenses when refunds exceed expenses without clamping', () => {
      const refundsExceedExpenses: Transaction[] = [
        {
          id: generateUuid(),
          type: 'expense',
          amountPaise: 5000, // ₹50
          categoryId: foodCategoryId,
          accountId,
          description: 'Item',
          transactionDate: '2026-10-01',
          createdAt: now,
          updatedAt: now,
          source: 'form',
          transferGroupId: null,
          refundOfId: null,
        },
        {
          id: generateUuid(),
          type: 'refund',
          amountPaise: 8000, // ₹80 refund
          categoryId: foodCategoryId,
          accountId,
          description: 'Refund from prior period',
          transactionDate: '2026-10-02',
          createdAt: now,
          updatedAt: now,
          source: 'form',
          transferGroupId: null,
          refundOfId: null,
        },
      ]

      const summary = calculatePeriodSummary(refundsExceedExpenses)
      expect(summary.grossExpensesPaise).toBe(5000)
      expect(summary.refundsPaise).toBe(8000)
      expect(summary.netExpensesPaise).toBe(-3000) // Negative net expense (retained without clamping)
    })

    it('calculates daily summaries accurately', () => {
      const dailyTransactions: Transaction[] = [
        {
          id: generateUuid(),
          type: 'expense',
          amountPaise: 5000,
          categoryId: foodCategoryId,
          accountId,
          description: 'Day 1 Expense',
          transactionDate: '2026-10-01',
          createdAt: now,
          updatedAt: now,
          source: 'form',
          transferGroupId: null,
          refundOfId: null,
        },
        {
          id: generateUuid(),
          type: 'income',
          amountPaise: 10000,
          categoryId: salaryCategoryId,
          accountId,
          description: 'Day 1 Income',
          transactionDate: '2026-10-01',
          createdAt: now,
          updatedAt: now,
          source: 'form',
          transferGroupId: null,
          refundOfId: null,
        },
        {
          id: generateUuid(),
          type: 'expense',
          amountPaise: 3000,
          categoryId: fuelCategoryId,
          accountId,
          description: 'Day 2 Expense',
          transactionDate: '2026-10-02',
          createdAt: now,
          updatedAt: now,
          source: 'form',
          transferGroupId: null,
          refundOfId: null,
        },
      ]

      const daily = calculateDailySummaries(dailyTransactions)
      expect(daily).toHaveLength(2)

      const day1 = daily.find((d) => d.date === '2026-10-01')
      expect(day1?.incomePaise).toBe(10000)
      expect(day1?.grossExpensesPaise).toBe(5000)
      expect(day1?.netExpensesPaise).toBe(5000)
      expect(day1?.transactionCount).toBe(2)

      const day2 = daily.find((d) => d.date === '2026-10-02')
      expect(day2?.incomePaise).toBe(0)
      expect(day2?.grossExpensesPaise).toBe(3000)
      expect(day2?.netExpensesPaise).toBe(3000)
      expect(day2?.transactionCount).toBe(1)
    })
  })
})
