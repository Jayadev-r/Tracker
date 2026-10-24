import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PaisaTrackDatabase } from '../../src/db/database'
import { initializeDatabase } from '../../src/db/init'
import { TransactionService } from '../../src/services/transactionService'
import { DashboardPage } from '../../src/features/dashboard/DashboardPage'
import type { Category, Account } from '../../src/types'
import {
  getLocalTodayDateString,
  getPreviousMonthLocalDateString,
  getMonthStartLocalDateString,
} from '../../src/utils/dates'
import { generateUuid } from '../../src/utils/ids'

describe('Dashboard Feature (Phase 5)', () => {
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
    dbName = `test-dashboard-${Date.now()}-${Math.random().toString(36).slice(2)}`
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

  it('renders empty database state cleanly with 0 metrics and empty recent list', async () => {
    render(<DashboardPage database={db} />)

    await waitFor(() => {
      // Period tabs should be visible
      expect(screen.getByRole('tab', { name: 'This Month' })).toHaveAttribute('aria-selected', 'true')
      // Today banner should show ₹0.00
      expect(screen.getByText("Today's Spending")).toBeInTheDocument()
      expect(screen.getByText('No transactions recorded yet.')).toBeInTheDocument()
    })

    // Remaining from recorded income should be ₹0.00
    expect(screen.getByText('Remaining from Recorded Income (This Month)')).toBeInTheDocument()
    const statCards = screen.getAllByText('₹0.00')
    expect(statCards.length).toBeGreaterThanOrEqual(4)
  })

  it('calculates correct summary metrics for income, gross expenses, refunds, net expenses, and remaining', async () => {
    const today = getLocalTodayDateString()

    // 1. Income: ₹50,000 (5,000,000 paise)
    await txService.createTransaction({
      type: 'income',
      amountPaise: 5000000,
      transactionDate: today,
      accountId: primaryAcc.id,
      categoryId: salaryCat.id,
      description: 'Monthly Salary',
    })

    // 2. Gross Expense 1: Food ₹3,000 (300,000 paise)
    const expenseFood = await txService.createTransaction({
      type: 'expense',
      amountPaise: 300000,
      transactionDate: today,
      accountId: primaryAcc.id,
      categoryId: foodCat.id,
      description: 'Groceries',
    })

    // 3. Gross Expense 2: Transit ₹1,000 (100,000 paise)
    await txService.createTransaction({
      type: 'expense',
      amountPaise: 100000,
      transactionDate: today,
      accountId: primaryAcc.id,
      categoryId: transportCat.id,
      description: 'Metro card',
    })

    // 4. Refund: ₹500 (50,000 paise) against expenseFood
    await txService.createTransaction({
      type: 'refund',
      amountPaise: 50000,
      transactionDate: today,
      accountId: primaryAcc.id,
      categoryId: foodCat.id,
      linkedExpenseTransactionId: expenseFood.id,
      description: 'Returned item',
    })

    render(<DashboardPage database={db} />)

    await waitFor(() => {
      // Income: + ₹50,000.00
      expect(screen.getAllByText('+ ₹50,000.00').length).toBeGreaterThanOrEqual(1)
      // Gross Expenses: ₹4,000.00
      expect(screen.getAllByText('₹4,000.00').length).toBeGreaterThanOrEqual(1)
      // Refunds: + ₹500.00
      expect(screen.getAllByText('+ ₹500.00').length).toBeGreaterThanOrEqual(1)
      // Net Expenses: ₹3,500.00
      expect(screen.getAllByText('₹3,500.00').length).toBeGreaterThanOrEqual(1)
      // Remaining: 50,000 - 3,500 = ₹46,500.00
      expect(screen.getAllByText('₹46,500.00').length).toBeGreaterThanOrEqual(1)
      // Savings rate: ((50000 - 3500) / 50000) * 100 = 93.0%
      expect(screen.getByText('93.0%')).toBeInTheDocument()
    })
  })

  it('displays negative remaining values without clamping when expenses exceed income', async () => {
    const today = getLocalTodayDateString()

    // Income: ₹2,000
    await txService.createTransaction({
      type: 'income',
      amountPaise: 200000,
      transactionDate: today,
      accountId: primaryAcc.id,
      categoryId: salaryCat.id,
      description: 'Freelance work',
    })

    // Expense: ₹5,000
    await txService.createTransaction({
      type: 'expense',
      amountPaise: 500000,
      transactionDate: today,
      accountId: primaryAcc.id,
      categoryId: foodCat.id,
      description: 'Fine dining',
    })

    render(<DashboardPage database={db} />)

    await waitFor(() => {
      // Net Expenses: ₹5,000.00
      expect(screen.getAllByText('₹5,000.00').length).toBeGreaterThanOrEqual(1)
      // Remaining: 2000 - 5000 = -3000 -> -₹3,000.00
      expect(screen.getByText('-₹3,000.00')).toBeInTheDocument()
      // Savings rate: ((2000 - 5000) / 2000) * 100 = -150.0%
      expect(screen.getByText('-150.0%')).toBeInTheDocument()
    })
  })

  it('displays today spending accurately in the header banner', async () => {
    const today = getLocalTodayDateString()
    const prevMonthFirst = getMonthStartLocalDateString(getPreviousMonthLocalDateString(today))

    // Today's expense: ₹1,250
    await txService.createTransaction({
      type: 'expense',
      amountPaise: 125000,
      transactionDate: today,
      accountId: primaryAcc.id,
      categoryId: foodCat.id,
      description: 'Lunch today',
    })

    // Previous month expense (should not appear in today's spending): ₹5,000
    await txService.createTransaction({
      type: 'expense',
      amountPaise: 500000,
      transactionDate: prevMonthFirst,
      accountId: primaryAcc.id,
      categoryId: foodCat.id,
      description: 'Past food',
    })

    render(<DashboardPage database={db} />)

    await waitFor(() => {
      // Today banner should show ₹1,250.00
      const banner = screen.getByText("Today's Spending").closest('.dashboard-today-banner')
      expect(banner).toHaveTextContent('₹1,250.00')
    })
  })

  it('switches between This Month, Last Month, and This Week reporting periods', async () => {
    const today = getLocalTodayDateString()
    const prevMonthFirst = getMonthStartLocalDateString(getPreviousMonthLocalDateString(today))

    // Current month expense: ₹1,500
    await txService.createTransaction({
      type: 'expense',
      amountPaise: 150000,
      transactionDate: today,
      accountId: primaryAcc.id,
      categoryId: foodCat.id,
      description: 'This month food',
    })

    // Last month expense: ₹4,800
    await txService.createTransaction({
      type: 'expense',
      amountPaise: 480000,
      transactionDate: prevMonthFirst,
      accountId: primaryAcc.id,
      categoryId: transportCat.id,
      description: 'Last month transit',
    })

    render(<DashboardPage database={db} />)

    // Initial: This Month
    await waitFor(() => {
      expect(screen.getByText('Remaining from Recorded Income (This Month)')).toBeInTheDocument()
      expect(screen.getAllByText('₹1,500.00').length).toBeGreaterThanOrEqual(1)
    })

    // Switch to Last Month
    const lastMonthBtn = screen.getByRole('tab', { name: 'Last Month' })
    fireEvent.click(lastMonthBtn)

    await waitFor(() => {
      expect(lastMonthBtn).toHaveAttribute('aria-selected', 'true')
      expect(screen.getByText('Remaining from Recorded Income (Last Month)')).toBeInTheDocument()
      expect(screen.getAllByText('₹4,800.00').length).toBeGreaterThanOrEqual(1)
    })

    // Switch to This Week
    const thisWeekBtn = screen.getByRole('tab', { name: 'This Week' })
    fireEvent.click(thisWeekBtn)

    await waitFor(() => {
      expect(thisWeekBtn).toHaveAttribute('aria-selected', 'true')
      expect(screen.getByText('Remaining from Recorded Income (This Week)')).toBeInTheDocument()
    })
  })

  it('unifies paired transfers into a single transfer in Recent Activity and excludes transfers from income/expense metrics', async () => {
    const today = getLocalTodayDateString()

    // Transfer between accounts: ₹10,000
    await txService.createTransfer({
      amountPaise: 1000000,
      transactionDate: today,
      sourceAccountId: primaryAcc.id,
      destinationAccountId: secondaryAcc.id,
      description: 'Monthly savings transfer',
    })

    render(<DashboardPage database={db} />)

    await waitFor(() => {
      // Income and Net Expenses should both remain ₹0.00
      expect(screen.getAllByText('+ ₹0.00').length).toBeGreaterThanOrEqual(1)
      // Transfer item should appear once in recent activity
      const transferItems = screen.getAllByText('Monthly savings transfer')
      expect(transferItems.length).toBe(1)
      expect(screen.getByText(/Cash.*→.*Bank Account/)).toBeInTheDocument()
    })
  })

  it('displays top spending categories with names, amounts, and percentages', async () => {
    const today = getLocalTodayDateString()

    // Food: ₹3,000 (75%)
    await txService.createTransaction({
      type: 'expense',
      amountPaise: 300000,
      transactionDate: today,
      accountId: primaryAcc.id,
      categoryId: foodCat.id,
      description: 'Food expenses',
    })

    // Transit: ₹1,000 (25%)
    await txService.createTransaction({
      type: 'expense',
      amountPaise: 100000,
      transactionDate: today,
      accountId: primaryAcc.id,
      categoryId: transportCat.id,
      description: 'Bus tickets',
    })

    render(<DashboardPage database={db} />)

    await waitFor(() => {
      expect(screen.getByText('Top Categories (This Month)')).toBeInTheDocument()
      expect(screen.getByText(foodCat.name)).toBeInTheDocument()
      expect(screen.getByText(transportCat.name)).toBeInTheDocument()
      expect(screen.getByText('(75%)')).toBeInTheDocument()
      expect(screen.getByText('(25%)')).toBeInTheDocument()
    })
  })

  it('navigates to full transaction history when "View All" is tapped', async () => {
    const onViewAll = vi.fn()
    render(<DashboardPage database={db} onViewAllTransactions={onViewAll} />)

    await waitFor(() => {
      const viewAllBtn = screen.getByRole('button', { name: 'View all transactions history' })
      expect(viewAllBtn).toBeInTheDocument()
      fireEvent.click(viewAllBtn)
      expect(onViewAll).toHaveBeenCalledTimes(1)
    })
  })

  it('refreshes metrics when refreshTrigger prop changes', async () => {
    const today = getLocalTodayDateString()

    const { rerender } = render(<DashboardPage database={db} refreshTrigger={0} />)

    await waitFor(() => {
      expect(screen.getByText('No transactions recorded yet.')).toBeInTheDocument()
    })

    // Mutate data outside
    await txService.createTransaction({
      type: 'expense',
      amountPaise: 250000,
      transactionDate: today,
      accountId: primaryAcc.id,
      categoryId: foodCat.id,
      description: 'After mount expense',
    })

    // Re-render with incremented refreshTrigger
    rerender(<DashboardPage database={db} refreshTrigger={1} />)

    await waitFor(() => {
      expect(screen.getAllByText('₹2,500.00').length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText('After mount expense')).toBeInTheDocument()
    })
  })
})
