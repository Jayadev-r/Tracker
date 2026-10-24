import type { PaisaTrackDatabase } from '../db/database'
import { db as defaultDb } from '../db/database'
import type { Budget, BudgetPeriod, Category } from '../types'
import { budgetSchema } from '../db/schema'
import { generateUuid } from '../utils/ids'
import {
  getMonthStartLocalDateString,
  getMonthEndLocalDateString,
  getWeekStartLocalDateString,
  getWeekEndLocalDateString,
  isValidLocalDateString,
} from '../utils/dates'
import { ValidationError, NotFoundError } from '../utils/errors'

export type BudgetThreshold = 'normal' | 'warning' | 'alert'

export interface BudgetProgress {
  budget: Budget
  category: Category
  periodStart: string
  periodEnd: string
  limitPaise: number
  spentPaise: number
  remainingPaise: number
  spentPercentage: number
  threshold: BudgetThreshold
  isOverBudget: boolean
}

export interface CreateBudgetInput {
  categoryId: string
  period: BudgetPeriod
  periodStart: string
  limitPaise: number
}

export class BudgetService {
  private readonly db: PaisaTrackDatabase

  constructor(database: PaisaTrackDatabase = defaultDb) {
    this.db = database
  }

  /**
   * Lists budgets, optionally filtered by period start and period type.
   */
  async listBudgets(periodStart?: string, period?: BudgetPeriod): Promise<Budget[]> {
    let collection = this.db.budgets.toCollection()

    if (periodStart && period) {
      const all = await this.db.budgets.where({ period, periodStart }).toArray()
      return all
    } else if (periodStart) {
      collection = this.db.budgets.where('periodStart').equals(periodStart)
    } else if (period) {
      collection = this.db.budgets.where('period').equals(period)
    }

    return collection.toArray()
  }

  /**
   * Retrieves a single budget by ID.
   */
  async getBudgetById(id: string): Promise<Budget | undefined> {
    return this.db.budgets.get(id)
  }

  /**
   * Creates a new budget with validation and duplicate prevention.
   */
  async createBudget(input: CreateBudgetInput): Promise<Budget> {
    // 1. Validate Category
    const category = await this.db.categories.get(input.categoryId)
    if (!category) {
      throw new NotFoundError('Category', input.categoryId)
    }
    if (category.type !== 'expense') {
      throw new ValidationError('Budgets can only be created for expense categories.')
    }

    // 2. Validate Limit
    if (!Number.isSafeInteger(input.limitPaise) || input.limitPaise <= 0) {
      throw new ValidationError('Budget limit must be a positive safe integer in paise.')
    }

    // 3. Validate and Normalize Period Start
    if (!isValidLocalDateString(input.periodStart)) {
      throw new ValidationError(`Invalid period start date "${input.periodStart}". Must be YYYY-MM-DD.`)
    }

    let normalizedPeriodStart = input.periodStart
    if (input.period === 'monthly') {
      normalizedPeriodStart = getMonthStartLocalDateString(input.periodStart)
    } else if (input.period === 'weekly') {
      // Get settings for weekStartsOn
      const settings = await this.db.settings.get('app-settings')
      const weekStartsOn = settings?.weekStartsOn ?? 1
      const parts = input.periodStart.split('-')
      const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
      normalizedPeriodStart = getWeekStartLocalDateString(d, weekStartsOn)
    }

    // 4. Duplicate Check
    const existing = await this.db.budgets
      .where('[categoryId+period+periodStart]')
      .equals([input.categoryId, input.period, normalizedPeriodStart])
      .first()

    if (existing) {
      throw new ValidationError(
        `A ${input.period} budget for "${category.name}" starting on ${normalizedPeriodStart} already exists.`
      )
    }

    const now = new Date().toISOString()
    const budget: Budget = {
      id: generateUuid(),
      categoryId: input.categoryId,
      period: input.period,
      periodStart: normalizedPeriodStart,
      limitPaise: input.limitPaise,
      createdAt: now,
      updatedAt: now,
    }

    const validated = budgetSchema.parse(budget)
    await this.db.budgets.add(validated)
    return validated
  }

  /**
   * Updates an existing budget's limit.
   */
  async updateBudget(id: string, updates: { limitPaise: number }): Promise<Budget> {
    const budget = await this.getBudgetById(id)
    if (!budget) {
      throw new NotFoundError('Budget', id)
    }

    if (!Number.isSafeInteger(updates.limitPaise) || updates.limitPaise <= 0) {
      throw new ValidationError('Budget limit must be a positive safe integer in paise.')
    }

    const now = new Date().toISOString()
    const updated: Budget = {
      ...budget,
      limitPaise: updates.limitPaise,
      updatedAt: now,
    }

    const validated = budgetSchema.parse(updated)
    await this.db.budgets.put(validated)
    return validated
  }

  /**
   * Deletes a budget.
   */
  async deleteBudget(id: string): Promise<void> {
    const budget = await this.getBudgetById(id)
    if (!budget) {
      throw new NotFoundError('Budget', id)
    }
    await this.db.budgets.delete(id)
  }

  /**
   * Calculates progress and threshold alerts for a given budget.
   */
  async getBudgetProgress(budget: Budget): Promise<BudgetProgress> {
    const category = await this.db.categories.get(budget.categoryId)
    const fallbackCategory: Category = category ?? {
      id: budget.categoryId,
      name: 'Unknown Category',
      type: 'expense',
      icon: 'HelpCircle',
      color: '#64748b',
      aliases: [],
      isArchived: true,
      createdAt: budget.createdAt,
      updatedAt: budget.updatedAt,
    }

    // Determine period boundaries
    let periodEnd: string
    if (budget.period === 'monthly') {
      periodEnd = getMonthEndLocalDateString(budget.periodStart)
    } else {
      const parts = budget.periodStart.split('-')
      const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
      const settings = await this.db.settings.get('app-settings')
      const weekStartsOn = settings?.weekStartsOn ?? 1
      periodEnd = getWeekEndLocalDateString(d, weekStartsOn)
    }

    // Fetch qualifying transactions for this category in the period
    const txs = await this.db.transactions
      .where('categoryId')
      .equals(budget.categoryId)
      .toArray()

    let grossExpensePaise = 0
    let refundsPaise = 0

    for (const tx of txs) {
      if (tx.transactionDate < budget.periodStart || tx.transactionDate > periodEnd) {
        continue
      }
      if (tx.type === 'expense') {
        grossExpensePaise += tx.amountPaise
      } else if (tx.type === 'refund') {
        refundsPaise += tx.amountPaise
      }
    }

    const spentPaise = Math.max(0, grossExpensePaise - refundsPaise)
    const remainingPaise = budget.limitPaise - spentPaise
    const spentPercentage = budget.limitPaise > 0 ? (spentPaise / budget.limitPaise) * 100 : 0

    let threshold: BudgetThreshold = 'normal'
    if (spentPercentage >= 100) {
      threshold = 'alert'
    } else if (spentPercentage >= 80) {
      threshold = 'warning'
    }

    return {
      budget,
      category: fallbackCategory,
      periodStart: budget.periodStart,
      periodEnd,
      limitPaise: budget.limitPaise,
      spentPaise,
      remainingPaise,
      spentPercentage,
      threshold,
      isOverBudget: remainingPaise < 0,
    }
  }

  /**
   * Lists budget progress for all budgets active in a given period.
   */
  async listBudgetProgressForPeriod(
    periodStart: string,
    period: BudgetPeriod = 'monthly'
  ): Promise<BudgetProgress[]> {
    const normalizedStart =
      period === 'monthly'
        ? getMonthStartLocalDateString(periodStart)
        : periodStart

    const budgets = await this.db.budgets
      .where('periodStart')
      .equals(normalizedStart)
      .filter((b) => b.period === period)
      .toArray()

    const progressList = await Promise.all(
      budgets.map((b) => this.getBudgetProgress(b))
    )

    // Sort by highest percentage spent descending
    return progressList.sort((a, b) => b.spentPercentage - a.spentPercentage)
  }
}

export const budgetService = new BudgetService()
