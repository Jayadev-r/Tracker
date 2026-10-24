import { describe, it, expect } from 'vitest'
import { parseTransaction, type ParseContext } from '../../src/features/chat-entry/parseTransaction'
import type { Category, Account } from '../../src/types'
import { generateUuid } from '../../src/utils/ids'

describe('Deterministic Chat Parser (Phase 3)', () => {
  const cashAccountId = generateUuid()
  const bankAccountId = generateUuid()
  const foodCategoryId = generateUuid()
  const shoppingCategoryId = generateUuid()
  const fuelCategoryId = generateUuid()
  const salaryCategoryId = generateUuid()
  const freelanceCategoryId = generateUuid()

  const fixedRefDate = new Date(2026, 9, 24) // 2026-10-24
  const now = fixedRefDate.toISOString()

  const categories: Category[] = [
    {
      id: foodCategoryId,
      name: 'Food',
      type: 'expense',
      icon: 'Utensils',
      color: '#f97316',
      aliases: ['food', 'meal', 'lunch', 'dinner', 'snack'],
      isArchived: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: shoppingCategoryId,
      name: 'Shopping',
      type: 'expense',
      icon: 'Tag',
      color: '#ec4899',
      aliases: ['shopping', 'clothes'],
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
      aliases: ['fuel', 'petrol', 'diesel'],
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
      aliases: ['salary', 'payroll'],
      isArchived: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: freelanceCategoryId,
      name: 'Freelance',
      type: 'income',
      icon: 'Laptop',
      color: '#3b82f6',
      aliases: ['freelance', 'consulting'],
      isArchived: false,
      createdAt: now,
      updatedAt: now,
    },
  ]

  const accounts: Account[] = [
    {
      id: cashAccountId,
      name: 'Cash',
      type: 'cash',
      openingBalancePaise: 0,
      openingBalanceDate: '2026-10-24',
      isArchived: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: bankAccountId,
      name: 'Bank',
      type: 'bank',
      openingBalancePaise: 500000,
      openingBalanceDate: '2026-10-24',
      isArchived: false,
      createdAt: now,
      updatedAt: now,
    },
  ]

  const context: ParseContext = {
    categories,
    accounts,
    defaultAccountId: cashAccountId,
    referenceDate: fixedRefDate,
  }

  describe('Specification Required Input Patterns', () => {
    it('parses "150 food"', () => {
      const res = parseTransaction('150 food', context)
      expect(res.status).toBe('success')
      if (res.status === 'success') {
        expect(res.draft.amountPaise).toBe(15000)
        expect(res.draft.type).toBe('expense')
        expect(res.draft.categoryId).toBe(foodCategoryId)
        expect(res.draft.accountId).toBe(cashAccountId)
        expect(res.draft.transactionDate).toBe('2026-10-24')
      }
    })

    it('parses "250 for food"', () => {
      const res = parseTransaction('250 for food', context)
      expect(res.status).toBe('success')
      if (res.status === 'success') {
        expect(res.draft.amountPaise).toBe(25000)
        expect(res.draft.categoryId).toBe(foodCategoryId)
      }
    })

    it('parses "shopping - 2000" with hyphen separator as positive 200000 paise', () => {
      const res = parseTransaction('shopping - 2000', context)
      expect(res.status).toBe('success')
      if (res.status === 'success') {
        expect(res.draft.amountPaise).toBe(200000)
        expect(res.draft.categoryId).toBe(shoppingCategoryId)
        expect(res.draft.type).toBe('expense')
      }
    })

    it('parses "200 fuel yesterday" resolving date to previous day', () => {
      const res = parseTransaction('200 fuel yesterday', context)
      expect(res.status).toBe('success')
      if (res.status === 'success') {
        expect(res.draft.amountPaise).toBe(20000)
        expect(res.draft.categoryId).toBe(fuelCategoryId)
        expect(res.draft.transactionDate).toBe('2026-10-23') // 2026-10-24 minus 1
      }
    })

    it('parses "salary 36000" as income', () => {
      const res = parseTransaction('salary 36000', context)
      expect(res.status).toBe('success')
      if (res.status === 'success') {
        expect(res.draft.amountPaise).toBe(3600000)
        expect(res.draft.type).toBe('income')
        expect(res.draft.categoryId).toBe(salaryCategoryId)
      }
    })

    it('parses "received 5000 from freelance" as income', () => {
      const res = parseTransaction('received 5000 from freelance', context)
      expect(res.status).toBe('success')
      if (res.status === 'success') {
        expect(res.draft.amountPaise).toBe(500000)
        expect(res.draft.type).toBe('income')
        expect(res.draft.categoryId).toBe(freelanceCategoryId)
      }
    })

    it('parses "spent 300 on lunch" mapping alias "lunch" to Food', () => {
      const res = parseTransaction('spent 300 on lunch', context)
      expect(res.status).toBe('success')
      if (res.status === 'success') {
        expect(res.draft.amountPaise).toBe(30000)
        expect(res.draft.categoryId).toBe(foodCategoryId)
      }
    })

    it('parses "refund 250 shopping" with refund type', () => {
      const res = parseTransaction('refund 250 shopping', context)
      expect(res.status).toBe('success')
      if (res.status === 'success') {
        expect(res.draft.amountPaise).toBe(25000)
        expect(res.draft.type).toBe('refund')
        expect(res.draft.categoryId).toBe(shoppingCategoryId)
      }
    })

    it('parses "250 food cash" identifying account explicitly', () => {
      const res = parseTransaction('250 food cash', context)
      expect(res.status).toBe('success')
      if (res.status === 'success') {
        expect(res.draft.amountPaise).toBe(25000)
        expect(res.draft.categoryId).toBe(foodCategoryId)
        expect(res.draft.accountId).toBe(cashAccountId)
      }
    })

    it('parses "₹150.50 food" with rupee symbol', () => {
      const res = parseTransaction('₹150.50 food', context)
      expect(res.status).toBe('success')
      if (res.status === 'success') {
        expect(res.draft.amountPaise).toBe(15050)
        expect(res.draft.categoryId).toBe(foodCategoryId)
      }
    })

    it('parses "150.50 INR food" with INR code', () => {
      const res = parseTransaction('150.50 INR food', context)
      expect(res.status).toBe('success')
      if (res.status === 'success') {
        expect(res.draft.amountPaise).toBe(15050)
      }
    })

    it('parses Indian comma-grouped amounts like "1,50,000 salary"', () => {
      const res = parseTransaction('1,50,000 salary', context)
      expect(res.status).toBe('success')
      if (res.status === 'success') {
        expect(res.draft.amountPaise).toBe(15000000)
        expect(res.draft.type).toBe('income')
      }
    })
  })

  describe('Ambiguity and Edge Cases', () => {
    it('returns invalid on empty or whitespace-only input', () => {
      expect(parseTransaction('', context).status).toBe('invalid')
      expect(parseTransaction('   ', context).status).toBe('invalid')
    })

    it('requests clarification when amount is missing ("food")', () => {
      const res = parseTransaction('food', context)
      expect(res.status).toBe('needs_clarification')
      if (res.status === 'needs_clarification') {
        expect(res.questions.some((q) => q.includes('Amount is missing'))).toBe(true)
      }
    })

    it('requests clarification when category is missing ("150")', () => {
      const res = parseTransaction('150', context)
      expect(res.status).toBe('needs_clarification')
      if (res.status === 'needs_clarification') {
        expect(res.draft.amountPaise).toBe(15000)
        expect(res.questions.some((q) => q.includes('choose a category'))).toBe(true)
      }
    })

    it('rejects leading negative amounts ("-200 food")', () => {
      const res = parseTransaction('-200 food', context)
      expect(res.status).toBe('invalid')
      if (res.status === 'invalid') {
        expect(res.message).toContain('Negative transaction amounts are not supported')
      }
    })

    it('rejects zero amounts ("0 food")', () => {
      const res = parseTransaction('0 food', context)
      expect(res.status).toBe('invalid')
      if (res.status === 'invalid') {
        expect(res.message).toContain('greater than zero')
      }
    })

    it('rejects precision exceeding 2 decimal places ("150.555 food")', () => {
      const res = parseTransaction('150.555 food', context)
      expect(res.status).toBe('invalid')
      if (res.status === 'invalid') {
        expect(res.message).toContain('maximum 2 decimal places supported')
      }
    })

    it('rejects multiple amounts in a single entry ("150 food 200 fuel")', () => {
      const res = parseTransaction('150 food 200 fuel', context)
      expect(res.status).toBe('invalid')
      if (res.status === 'invalid') {
        expect(res.message).toContain('Multiple amounts detected')
      }
    })

    it('requests clarification for unknown categories ("150 unknowncategory")', () => {
      const res = parseTransaction('150 unknowncategory', context)
      expect(res.status).toBe('needs_clarification')
      if (res.status === 'needs_clarification') {
        expect(res.draft.amountPaise).toBe(15000)
        expect(res.questions[0]).toContain('Category missing or unrecognized')
      }
    })

    it('requests clarification for ambiguous category alias', () => {
      const ambiguousContext: ParseContext = {
        ...context,
        categories: [
          ...categories,
          {
            id: generateUuid(),
            name: 'Dining Out',
            type: 'expense',
            icon: 'Utensils',
            color: '#000',
            aliases: ['lunch'], // Conflicts with Food alias 'lunch'
            isArchived: false,
            createdAt: now,
            updatedAt: now,
          },
        ],
      }
      const res = parseTransaction('300 lunch', ambiguousContext)
      expect(res.status).toBe('needs_clarification')
      if (res.status === 'needs_clarification') {
        expect(res.questions[0]).toContain('Ambiguous category')
      }
    })

    it('requests clarification for transfer when source and destination are missing', () => {
      const res = parseTransaction('transfer 500', context)
      expect(res.status).toBe('needs_clarification')
      if (res.status === 'needs_clarification') {
        expect(res.draft.type).toBe('transfer')
        expect(res.draft.amountPaise).toBe(50000)
        expect(res.questions[0]).toContain('source (from) and destination (to)')
      }
    })

    it('parses valid transfer with accounts ("transfer 500 from bank to cash")', () => {
      const res = parseTransaction('transfer 500 from bank to cash', context)
      expect(res.status).toBe('success')
      if (res.status === 'success') {
        expect(res.draft.type).toBe('transfer')
        expect(res.draft.amountPaise).toBe(50000)
        expect(res.draft.accountId).toBe(bankAccountId)
        expect(res.draft.transferToAccountId).toBe(cashAccountId)
      }
    })

    it('rejects transfer where source and destination are the same account', () => {
      const res = parseTransaction('transfer 500 from cash to cash', context)
      expect(res.status).toBe('invalid')
      if (res.status === 'invalid') {
        expect(res.message).toContain('must be different')
      }
    })
  })
})
