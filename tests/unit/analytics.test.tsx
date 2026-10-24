import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PaisaTrackDatabase } from '../../src/db/database'
import { initializeDatabase } from '../../src/db/init'
import { TransactionService } from '../../src/services/transactionService'
import { AnalyticsPage } from '../../src/features/analytics/AnalyticsPage'
import type { Category, Account } from '../../src/types'
import {
  getLocalTodayDateString,
  getPreviousMonthLocalDateString,
  getMonthStartLocalDateString,
} from '../../src/utils/dates'
import { generateUuid } from '../../src/utils/ids'

describe('Analytics & Insights Feature (Phase 5)', () => {
  let db: PaisaTrackDatabase
  let txService: TransactionService
  let dbName: string
  let categories: Category[]
  let accounts: Account[]
  let salaryCat: Category
  let foodCat: Category
  let transportCat: Category
  let primaryAcc: Account
  let secondaryAcc: Account

  beforeEach(async () => {
    dbName = `test-analytics-${Date.now()}-${Math.random().toString(36).slice(2)}`
    db = new PaisaTrackDatabase(dbName)
    await initializeDatabase(db)
    txService = new TransactionService(db)

    categories = await db.categories.toArray()
    accounts = await db.accounts.toArray()

    salaryCat = categories.find((c) => c.type === 'income')!
    foodCat = categories.find((c) => c.type === 'expense' && (c.name.includes('Food') || c.name.includes('Groceries')))!
    transportCat = categories.find((c) => c.type === 'expense' && c.id !== foodCat.id)!

    primaryAcc = accounts[0]
    const now = new Date().toISOString()
    secondaryAcc = {
      id: generateUuid(),
      name: 'Bank Account',
      type: 'bank',
      openingBalancePaise: 0,
      openingBalanceDate: getLocalTodayDateString(),
      isArchived: false,
      createdAt: now,
      updatedAt: now,
    }
    await db.accounts.add(secondaryAcc)
  })

  afterEach(async () => {
    await db.delete()
  })

  it('renders clean empty state for charts and metrics when database has no transactions', async () => {
    render(<AnalyticsPage database={db} />)

    await waitFor(() => {
      // Period tabs should be active
      expect(screen.getByRole('tab', { name: 'This Month' })).toHaveAttribute('aria-selected', 'true')
      // Overview cards
      expect(screen.getByText('+ ₹0.00')).toBeInTheDocument()
      expect(screen.getAllByText('₹0.00').length).toBeGreaterThanOrEqual(1)
      // Empty category chart state
      expect(screen.getByText('No expense transactions recorded for This Month.')).toBeInTheDocument()
      // Empty trend chart state
      expect(screen.getByText('No activity recorded for This Month.')).toBeInTheDocument()
    })
  })

  it('calculates category totals correctly with refunds and excludes transfers and income', async () => {
    const today = getLocalTodayDateString()

    // 1. Income: ₹60,000 (should not appear in category spending breakdown)
    await txService.createTransaction({
      type: 'income',
      amountPaise: 6000000,
      transactionDate: today,
      accountId: primaryAcc.id,
      categoryId: salaryCat.id,
      description: 'Consulting Income',
    })

    // 2. Transfer: ₹15,000 (should not appear in category spending breakdown)
    await txService.createTransfer({
      amountPaise: 1500000,
      transactionDate: today,
      sourceAccountId: primaryAcc.id,
      destinationAccountId: secondaryAcc.id,
      description: 'Savings Transfer',
    })

    // 3. Food Expense: ₹4,000
    const foodTx = await txService.createTransaction({
      type: 'expense',
      amountPaise: 400000,
      transactionDate: today,
      accountId: primaryAcc.id,
      categoryId: foodCat.id,
      description: 'Supermarket shopping',
    })

    // 4. Food Refund: ₹1,000 against foodTx (Net Food: ₹3,000)
    await txService.createTransaction({
      type: 'refund',
      amountPaise: 100000,
      transactionDate: today,
      accountId: primaryAcc.id,
      categoryId: foodCat.id,
      linkedExpenseTransactionId: foodTx.id,
      description: 'Supermarket return',
    })

    // 5. Transit Expense: ₹1,000 (Net Transit: ₹1,000)
    await txService.createTransaction({
      type: 'expense',
      amountPaise: 100000,
      transactionDate: today,
      accountId: primaryAcc.id,
      categoryId: transportCat.id,
      description: 'Train pass',
    })

    // Total net expenses: ₹3,000 (Food) + ₹1,000 (Transit) = ₹4,000
    // Food share: 3000 / 4000 = 75.0%
    // Transit share: 1000 / 4000 = 25.0%

    render(<AnalyticsPage database={db} />)

    await waitFor(() => {
      // Net expenses in overview
      expect(screen.getAllByText('₹4,000.00').length).toBeGreaterThanOrEqual(1)
      // Category list items
      const breakdownList = screen.getByRole('list', { name: 'Expense categories breakdown' })
      expect(breakdownList).toBeInTheDocument()
      expect(breakdownList).toHaveTextContent(foodCat.name)
      expect(breakdownList).toHaveTextContent('₹3,000.00')
      expect(breakdownList).toHaveTextContent('(75.0%)')

      expect(breakdownList).toHaveTextContent(transportCat.name)
      expect(breakdownList).toHaveTextContent('₹1,000.00')
      expect(breakdownList).toHaveTextContent('(25.0%)')

      // Salary category should NOT be in the expense breakdown
      expect(breakdownList).not.toHaveTextContent(salaryCat.name)
    })
  })

  it('renders income and expenses trend data correctly in the accessible data table', async () => {
    const today = getLocalTodayDateString()

    // Day activity: Income ₹25,000 and Expense ₹4,500
    await txService.createTransaction({
      type: 'income',
      amountPaise: 2500000,
      transactionDate: today,
      accountId: primaryAcc.id,
      categoryId: salaryCat.id,
      description: 'Salary Day',
    })

    await txService.createTransaction({
      type: 'expense',
      amountPaise: 450000,
      transactionDate: today,
      accountId: primaryAcc.id,
      categoryId: foodCat.id,
      description: 'Dinner Party',
    })

    render(<AnalyticsPage database={db} />)

    await waitFor(() => {
      const trendTable = screen.getByRole('table', { name: 'Daily trend data table' })
      expect(trendTable).toBeInTheDocument()
      expect(trendTable).toHaveTextContent(today)
      expect(trendTable).toHaveTextContent('+ ₹25,000.00')
      expect(trendTable).toHaveTextContent('₹4,500.00')
    })
  })

  it('computes period comparison delta against previous month correctly', async () => {
    const today = getLocalTodayDateString()
    const prevMonthFirst = getMonthStartLocalDateString(getPreviousMonthLocalDateString(today))

    // Previous Month: Income ₹40,000, Expenses ₹10,000
    await txService.createTransaction({
      type: 'income',
      amountPaise: 4000000,
      transactionDate: prevMonthFirst,
      accountId: primaryAcc.id,
      categoryId: salaryCat.id,
      description: 'Prev month salary',
    })
    await txService.createTransaction({
      type: 'expense',
      amountPaise: 1000000,
      transactionDate: prevMonthFirst,
      accountId: primaryAcc.id,
      categoryId: foodCat.id,
      description: 'Prev month food',
    })

    // Current Month: Income ₹50,000 (+ ₹10,000 / +25.0%), Expenses ₹8,000 (- ₹2,000 / -20.0%)
    await txService.createTransaction({
      type: 'income',
      amountPaise: 5000000,
      transactionDate: today,
      accountId: primaryAcc.id,
      categoryId: salaryCat.id,
      description: 'This month salary',
    })
    await txService.createTransaction({
      type: 'expense',
      amountPaise: 800000,
      transactionDate: today,
      accountId: primaryAcc.id,
      categoryId: foodCat.id,
      description: 'This month food',
    })

    render(<AnalyticsPage database={db} />)

    await waitFor(() => {
      // Comparison header
      expect(screen.getByText('Comparison vs. Previous Period')).toBeInTheDocument()
      expect(screen.getByText(/This Month.*vs.*Last Month/)).toBeInTheDocument()
      // Income change: + ₹10,000.00 (+25.0%)
      expect(screen.getByText('+ ₹10,000.00 (+25.0%)')).toBeInTheDocument()
      // Spending change: -₹2,000.00 (-20.0%)
      expect(screen.getByText('-₹2,000.00 (-20.0%)')).toBeInTheDocument()
    })
  })

  it('handles zero denominators in period comparison safely without producing NaN or Infinity', async () => {
    const today = getLocalTodayDateString()

    // Previous month has 0 income and 0 expenses.
    // Current month has income ₹10,000 and expense ₹5,000.
    await txService.createTransaction({
      type: 'income',
      amountPaise: 1000000,
      transactionDate: today,
      accountId: primaryAcc.id,
      categoryId: salaryCat.id,
      description: 'Current month salary',
    })
    await txService.createTransaction({
      type: 'expense',
      amountPaise: 500000,
      transactionDate: today,
      accountId: primaryAcc.id,
      categoryId: foodCat.id,
      description: 'Current month expense',
    })

    render(<AnalyticsPage database={db} />)

    await waitFor(() => {
      // In comparison card, percentage delta should be formatted without NaN or Infinity
      const comparisonCard = screen.getByRole('region', { name: 'Period Comparison' })
      expect(comparisonCard).toBeInTheDocument()
      expect(comparisonCard.textContent).not.toContain('NaN')
      expect(comparisonCard.textContent).not.toContain('Infinity')
    })
  })

  it('switches analytics period correctly between This Month, Last Month, and This Week', async () => {
    const today = getLocalTodayDateString()
    const prevMonthFirst = getMonthStartLocalDateString(getPreviousMonthLocalDateString(today))

    // Previous month expense: ₹7,500
    await txService.createTransaction({
      type: 'expense',
      amountPaise: 750000,
      transactionDate: prevMonthFirst,
      accountId: primaryAcc.id,
      categoryId: foodCat.id,
      description: 'Prev month food',
    })

    render(<AnalyticsPage database={db} />)

    // Switch to Last Month
    const lastMonthBtn = screen.getByRole('tab', { name: 'Last Month' })
    fireEvent.click(lastMonthBtn)

    await waitFor(() => {
      expect(lastMonthBtn).toHaveAttribute('aria-selected', 'true')
      expect(screen.getByText(/Last Month.*vs.*2 Months Ago/)).toBeInTheDocument()
      expect(screen.getAllByText('₹7,500.00').length).toBeGreaterThanOrEqual(1)
    })
  })
})
