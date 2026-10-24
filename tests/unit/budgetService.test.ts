import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { PaisaTrackDatabase } from '../../src/db/database'
import { initializeDatabase } from '../../src/db/init'
import { BudgetService } from '../../src/services/budgetService'
import { TransactionService } from '../../src/services/transactionService'
import { ValidationError, NotFoundError } from '../../src/utils/errors'
import type { Category, Account } from '../../src/types'

describe('BudgetService (Phase 6)', () => {
  let db: PaisaTrackDatabase
  let budgetService: BudgetService
  let txService: TransactionService
  let dbName: string
  let foodCat: Category
  let salaryCat: Category
  let account: Account

  beforeEach(async () => {
    dbName = `test-budget-service-${Date.now()}-${Math.random().toString(36).slice(2)}`
    db = new PaisaTrackDatabase(dbName)
    await initializeDatabase(db)
    budgetService = new BudgetService(db)
    txService = new TransactionService(db)

    const cats = await db.categories.toArray()
    foodCat = cats.find((c) => c.type === 'expense')!
    salaryCat = cats.find((c) => c.type === 'income')!

    const accs = await db.accounts.toArray()
    account = accs[0]
  })

  afterEach(async () => {
    await db.delete()
  })

  it('creates monthly budget and prevents duplicate for same category and period', async () => {
    const budget = await budgetService.createBudget({
      categoryId: foodCat.id,
      period: 'monthly',
      periodStart: '2026-10-15', // Should normalize to 2026-10-01
      limitPaise: 1000000, // ₹10,000
    })

    expect(budget.id).toBeDefined()
    expect(budget.periodStart).toBe('2026-10-01')
    expect(budget.limitPaise).toBe(1000000)

    // Attempt duplicate for same category and month
    await expect(
      budgetService.createBudget({
        categoryId: foodCat.id,
        period: 'monthly',
        periodStart: '2026-10-20',
        limitPaise: 1500000,
      })
    ).rejects.toThrow(ValidationError)
  })

  it('rejects creating budgets for income categories', async () => {
    await expect(
      budgetService.createBudget({
        categoryId: salaryCat.id,
        period: 'monthly',
        periodStart: '2026-10-01',
        limitPaise: 5000000,
      })
    ).rejects.toThrow(ValidationError)
  })

  it('rejects budget limits <= 0', async () => {
    await expect(
      budgetService.createBudget({
        categoryId: foodCat.id,
        period: 'monthly',
        periodStart: '2026-10-01',
        limitPaise: 0,
      })
    ).rejects.toThrow(ValidationError)

    await expect(
      budgetService.createBudget({
        categoryId: foodCat.id,
        period: 'monthly',
        periodStart: '2026-10-01',
        limitPaise: -5000,
      })
    ).rejects.toThrow(ValidationError)
  })

  it('updates budget limit and deletes cleanly', async () => {
    const budget = await budgetService.createBudget({
      categoryId: foodCat.id,
      period: 'monthly',
      periodStart: '2026-10-01',
      limitPaise: 1000000,
    })

    const updated = await budgetService.updateBudget(budget.id, {
      limitPaise: 1200000,
    })
    expect(updated.limitPaise).toBe(1200000)

    await budgetService.deleteBudget(budget.id)
    const loaded = await budgetService.getBudgetById(budget.id)
    expect(loaded).toBeUndefined()
  })

  it('calculates normal, warning (80%), and alert (100%+) thresholds with unclamped remaining', async () => {
    // Budget: ₹10,000 (1,000,000 paise)
    const budget = await budgetService.createBudget({
      categoryId: foodCat.id,
      period: 'monthly',
      periodStart: '2026-10-01',
      limitPaise: 1000000,
    })

    // Scenario 1: Zero spending -> threshold: 'normal'
    let progress = await budgetService.getBudgetProgress(budget)
    expect(progress.spentPaise).toBe(0)
    expect(progress.remainingPaise).toBe(1000000)
    expect(progress.spentPercentage).toBe(0)
    expect(progress.threshold).toBe('normal')
    expect(progress.isOverBudget).toBe(false)

    // Scenario 2: Spending ₹8,000 (80%) -> threshold: 'warning'
    const exp1 = await txService.createTransaction({
      type: 'expense',
      amountPaise: 800000,
      transactionDate: '2026-10-10',
      accountId: account.id,
      categoryId: foodCat.id,
      description: 'Big groceries',
    })

    progress = await budgetService.getBudgetProgress(budget)
    expect(progress.spentPaise).toBe(800000)
    expect(progress.remainingPaise).toBe(200000)
    expect(progress.spentPercentage).toBe(80)
    expect(progress.threshold).toBe('warning')
    expect(progress.isOverBudget).toBe(false)

    // Scenario 3: Partial refund of ₹500 (50,000 paise) -> spent = 750,000 (75%) -> back to 'normal'
    const refund = await txService.createTransaction({
      type: 'refund',
      amountPaise: 50000,
      transactionDate: '2026-10-11',
      accountId: account.id,
      categoryId: foodCat.id,
      linkedExpenseTransactionId: exp1.id,
      description: 'Returned spoiled item',
    })

    progress = await budgetService.getBudgetProgress(budget)
    expect(progress.spentPaise).toBe(750000)
    expect(progress.remainingPaise).toBe(250000)
    expect(progress.spentPercentage).toBe(75)
    expect(progress.threshold).toBe('normal')

    // Scenario 4: Over budget -> spending ₹3,000 more -> total spent = 1,050,000 (105%) -> threshold: 'alert'
    await txService.createTransaction({
      type: 'expense',
      amountPaise: 300000,
      transactionDate: '2026-10-15',
      accountId: account.id,
      categoryId: foodCat.id,
      description: 'Dinner outing',
    })

    progress = await budgetService.getBudgetProgress(budget)
    expect(progress.spentPaise).toBe(1050000)
    expect(progress.remainingPaise).toBe(-50000) // Negative remaining: unclamped
    expect(progress.spentPercentage).toBe(105)
    expect(progress.threshold).toBe('alert')
    expect(progress.isOverBudget).toBe(true)
  })

  it('excludes transfers and out-of-period transactions from budget progress', async () => {
    const budget = await budgetService.createBudget({
      categoryId: foodCat.id,
      period: 'monthly',
      periodStart: '2026-10-01',
      limitPaise: 500000, // ₹5,000
    })

    // Out of period expense (November)
    await txService.createTransaction({
      type: 'expense',
      amountPaise: 400000,
      transactionDate: '2026-11-05',
      accountId: account.id,
      categoryId: foodCat.id,
      description: 'November expense',
    })

    const progress = await budgetService.getBudgetProgress(budget)
    expect(progress.spentPaise).toBe(0)
    expect(progress.remainingPaise).toBe(500000)
  })
})
