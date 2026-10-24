import type { PaisaTrackDatabase } from '../db/database'
import { db as defaultDb } from '../db/database'
import type { Transaction, Category } from '../types'
import { addPaise, subtractPaise } from '../utils/money'

export interface PeriodSummary {
  incomePaise: number
  grossExpensesPaise: number
  refundsPaise: number
  netExpensesPaise: number
  remainingFromRecordedIncomePaise: number
  savingsRatePercentage: number | null // null when income is 0, never NaN or Infinity
  transactionCount: number
  transferCount: number
}

export interface CategorySummary {
  categoryId: string
  categoryName: string
  categoryType: 'income' | 'expense'
  icon: string
  color: string
  grossAmountPaise: number
  refundsPaise: number
  netAmountPaise: number
  percentageOfTotal: number | null
}

export interface DailySummary {
  date: string
  incomePaise: number
  grossExpensesPaise: number
  refundsPaise: number
  netExpensesPaise: number
  transactionCount: number
}

/**
 * Pure calculation functions for financial reporting.
 * Completely decoupled from UI and database access.
 */

/**
 * Calculates high-level income, expense, refund, and savings metrics for a list of transactions.
 * Rules:
 * - All monetary calculations use integer paise.
 * - Transfers are strictly excluded from income, gross expenses, refunds, and net expenses.
 * - netExpensesPaise = grossExpensesPaise - refundsPaise (may be negative if refunds exceed expenses).
 * - remainingFromRecordedIncomePaise = incomePaise - netExpensesPaise.
 * - savingsRatePercentage is null when income is 0.
 */
export function calculatePeriodSummary(transactions: readonly Transaction[]): PeriodSummary {
  let incomePaise = 0
  let grossExpensesPaise = 0
  let refundsPaise = 0
  let transferCount = 0
  let nonTransferCount = 0

  for (const tx of transactions) {
    if (tx.type === 'income') {
      incomePaise = addPaise(incomePaise, tx.amountPaise)
      nonTransferCount++
    } else if (tx.type === 'expense') {
      grossExpensesPaise = addPaise(grossExpensesPaise, tx.amountPaise)
      nonTransferCount++
    } else if (tx.type === 'refund') {
      refundsPaise = addPaise(refundsPaise, tx.amountPaise)
      nonTransferCount++
    } else if (tx.type === 'transfer') {
      transferCount++
    }
  }

  const netExpensesPaise = subtractPaise(grossExpensesPaise, refundsPaise)
  const remainingFromRecordedIncomePaise = subtractPaise(incomePaise, netExpensesPaise)

  // Savings rate is only defined when income is strictly positive (> 0)
  let savingsRatePercentage: number | null = null
  if (incomePaise > 0) {
    savingsRatePercentage = (remainingFromRecordedIncomePaise / incomePaise) * 100
  }

  return {
    incomePaise,
    grossExpensesPaise,
    refundsPaise,
    netExpensesPaise,
    remainingFromRecordedIncomePaise,
    savingsRatePercentage,
    transactionCount: nonTransferCount + transferCount,
    transferCount,
  }
}

/**
 * Calculates category-wise distribution of net expenses and income.
 * Refunds assigned to an expense category reduce that category's net expense.
 */
export function calculateCategorySummaries(
  transactions: readonly Transaction[],
  categories: readonly Category[]
): CategorySummary[] {
  const categoryMap = new Map<string, Category>()
  for (const cat of categories) {
    categoryMap.set(cat.id, cat)
  }

  // Aggregate gross and refunds per category
  const categoryStats = new Map<
    string,
    { grossPaise: number; refundsPaise: number; type: 'income' | 'expense' }
  >()

  for (const tx of transactions) {
    if (tx.type === 'transfer') continue
    if (!tx.categoryId) continue

    let stat = categoryStats.get(tx.categoryId)
    if (!stat) {
      const cat = categoryMap.get(tx.categoryId)
      const type = cat?.type ?? (tx.type === 'income' ? 'income' : 'expense')
      stat = { grossPaise: 0, refundsPaise: 0, type }
      categoryStats.set(tx.categoryId, stat)
    }

    if (tx.type === 'income' || tx.type === 'expense') {
      stat.grossPaise = addPaise(stat.grossPaise, tx.amountPaise)
    } else if (tx.type === 'refund') {
      stat.refundsPaise = addPaise(stat.refundsPaise, tx.amountPaise)
    }
  }

  // Calculate overall net expenses for percentage weighting
  let totalNetExpenses = 0
  for (const [, stat] of categoryStats) {
    if (stat.type === 'expense') {
      const net = subtractPaise(stat.grossPaise, stat.refundsPaise)
      if (net > 0) {
        totalNetExpenses = addPaise(totalNetExpenses, net)
      }
    }
  }

  const summaries: CategorySummary[] = []
  for (const [categoryId, stat] of categoryStats) {
    const category = categoryMap.get(categoryId)
    const netAmountPaise = subtractPaise(stat.grossPaise, stat.refundsPaise)

    let percentageOfTotal: number | null = null
    if (stat.type === 'expense' && totalNetExpenses > 0 && netAmountPaise > 0) {
      percentageOfTotal = (netAmountPaise / totalNetExpenses) * 100
    }

    summaries.push({
      categoryId,
      categoryName: category?.name ?? 'Unknown Category',
      categoryType: stat.type,
      icon: category?.icon ?? 'MoreHorizontal',
      color: category?.color ?? '#64748b',
      grossAmountPaise: stat.grossPaise,
      refundsPaise: stat.refundsPaise,
      netAmountPaise,
      percentageOfTotal,
    })
  }

  // Sort expense categories highest spending first, income categories highest income first
  summaries.sort((a, b) => b.netAmountPaise - a.netAmountPaise)
  return summaries
}

/**
 * Calculates day-by-day financial metrics for a collection of transactions.
 */
export function calculateDailySummaries(transactions: readonly Transaction[]): DailySummary[] {
  const dayMap = new Map<string, { income: number; gross: number; refunds: number; count: number }>()

  for (const tx of transactions) {
    if (tx.type === 'transfer') continue

    let day = dayMap.get(tx.transactionDate)
    if (!day) {
      day = { income: 0, gross: 0, refunds: 0, count: 0 }
      dayMap.set(tx.transactionDate, day)
    }

    day.count++
    if (tx.type === 'income') {
      day.income = addPaise(day.income, tx.amountPaise)
    } else if (tx.type === 'expense') {
      day.gross = addPaise(day.gross, tx.amountPaise)
    } else if (tx.type === 'refund') {
      day.refunds = addPaise(day.refunds, tx.amountPaise)
    }
  }

  const dailyList: DailySummary[] = []
  for (const [date, val] of dayMap) {
    dailyList.push({
      date,
      incomePaise: val.income,
      grossExpensesPaise: val.gross,
      refundsPaise: val.refunds,
      netExpensesPaise: subtractPaise(val.gross, val.refunds),
      transactionCount: val.count,
    })
  }

  dailyList.sort((a, b) => a.date.localeCompare(b.date))
  return dailyList
}

/**
 * Reporting Service coordinating database queries and reporting calculations.
 */
export class ReportingService {
  private db: PaisaTrackDatabase

  constructor(database: PaisaTrackDatabase = defaultDb) {
    this.db = database
  }

  /**
   * Retrieves high-level period summary metrics for the given date range.
   */
  async getPeriodSummary(startDate: string, endDate: string): Promise<PeriodSummary> {
    const transactions = await this.db.transactions
      .where('transactionDate')
      .between(startDate, endDate, true, true)
      .toArray()

    return calculatePeriodSummary(transactions)
  }

  /**
   * Retrieves category spending breakdown for the given date range.
   */
  async getCategorySummaries(startDate: string, endDate: string): Promise<CategorySummary[]> {
    const transactions = await this.db.transactions
      .where('transactionDate')
      .between(startDate, endDate, true, true)
      .toArray()

    const categories = await this.db.categories.toArray()
    return calculateCategorySummaries(transactions, categories)
  }

  /**
   * Retrieves daily aggregates for calendar and daily chart views.
   */
  async getDailySummaries(startDate: string, endDate: string): Promise<DailySummary[]> {
    const transactions = await this.db.transactions
      .where('transactionDate')
      .between(startDate, endDate, true, true)
      .toArray()

    return calculateDailySummaries(transactions)
  }
}

export const reportingService = new ReportingService()
