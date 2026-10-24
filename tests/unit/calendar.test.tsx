import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PaisaTrackDatabase } from '../../src/db/database'
import { initializeDatabase } from '../../src/db/init'
import { TransactionService } from '../../src/services/transactionService'
import { CalendarPage } from '../../src/features/calendar/CalendarPage'
import type { Category, Account } from '../../src/types'

describe('Calendar Feature', () => {
  let db: PaisaTrackDatabase
  let txService: TransactionService
  let dbName: string
  let testCategories: Category[]
  let testAccounts: Account[]

  beforeEach(async () => {
    dbName = `test-calendar-${Date.now()}-${Math.random().toString(36).slice(2)}`
    db = new PaisaTrackDatabase(dbName)
    await initializeDatabase(db)
    txService = new TransactionService(db)

    testCategories = await db.categories.toArray()
    testAccounts = await db.accounts.toArray()
  })

  afterEach(async () => {
    await db.delete()
  })

  it('renders with the initial selected date and displays empty state when no transactions exist', async () => {
    render(<CalendarPage database={db} initialSelectedDate="2026-10-15" />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: 'October 2026' })).toBeInTheDocument()
      expect(screen.getByRole('heading', { level: 3, name: 'Summary for 2026-10-15' })).toBeInTheDocument()
      expect(screen.getByText('No transactions recorded on this date.')).toBeInTheDocument()
    })
  })

  it('navigates previous and next months correctly across December and January', async () => {
    render(<CalendarPage database={db} initialSelectedDate="2026-12-15" />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: 'December 2026' })).toBeInTheDocument()
    })

    // Click Next month -> Rollover to January 2027
    const nextBtn = screen.getByRole('button', { name: 'Next month' })
    fireEvent.click(nextBtn)

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: 'January 2027' })).toBeInTheDocument()
      expect(screen.getByRole('heading', { level: 3, name: 'Summary for 2027-01-01' })).toBeInTheDocument()
    })

    // Click Previous month -> Back to December 2026
    const prevBtn = screen.getByRole('button', { name: 'Previous month' })
    fireEvent.click(prevBtn)

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: 'December 2026' })).toBeInTheDocument()
    })

    // Click Previous month again -> November 2026
    fireEvent.click(prevBtn)

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: 'November 2026' })).toBeInTheDocument()
    })
  })

  it('handles leap-year February (29 days in 2024 vs 28 days in 2025)', async () => {
    // 2024 is a leap year -> 29 days
    const { unmount } = render(<CalendarPage database={db} initialSelectedDate="2024-02-10" />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: 'February 2024' })).toBeInTheDocument()
      // Day 29 exists in 2024
      expect(screen.getByRole('button', { name: /2024-02-29/i })).toBeInTheDocument()
    })

    unmount()

    // 2025 is not a leap year -> 28 days
    render(<CalendarPage database={db} initialSelectedDate="2025-02-10" />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: 'February 2025' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /2025-02-28/i })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /2025-02-29/i })).not.toBeInTheDocument()
    })
  })

  it('displays transaction indicators and computes daily summary for selected date', async () => {
    const foodCat = testCategories.find((c) => c.name === 'Food')!
    const salaryCat = testCategories.find((c) => c.name === 'Salary')!
    const account = testAccounts[0]!

    // Add transactions on 2026-10-20
    const expense = await txService.createTransaction({
      type: 'expense',
      amountPaise: 40000, // ₹400.00
      categoryId: foodCat.id,
      accountId: account.id,
      description: 'Groceries',
      transactionDate: '2026-10-20',
    })

    await txService.createRefund({
      amountPaise: 5000, // ₹50.00
      categoryId: foodCat.id,
      accountId: account.id,
      description: 'Groceries coupon cashback',
      transactionDate: '2026-10-20',
      refundOfId: expense.id,
    })

    await txService.createTransaction({
      type: 'income',
      amountPaise: 100000, // ₹1,000.00
      categoryId: salaryCat.id,
      accountId: account.id,
      description: 'Consulting bonus',
      transactionDate: '2026-10-20',
    })

    render(<CalendarPage database={db} initialSelectedDate="2026-10-20" />)

    await waitFor(() => {
      // Heading
      expect(screen.getByRole('heading', { level: 3, name: 'Summary for 2026-10-20' })).toBeInTheDocument()

      // Daily summary metrics:
      // Income: ₹1,000.00
      // Gross Expenses: ₹400.00
      // Refunds: ₹50.00
      // Net Expenses: ₹350.00
      expect(screen.getByText('₹1,000.00')).toBeInTheDocument()
      expect(screen.getByText('₹400.00')).toBeInTheDocument()
      expect(screen.getByText('₹50.00')).toBeInTheDocument()
      expect(screen.getByText('₹350.00')).toBeInTheDocument()

      // Transaction list items
      expect(screen.getByText('Groceries')).toBeInTheDocument()
      expect(screen.getByText('Groceries coupon cashback')).toBeInTheDocument()
      expect(screen.getByText('Consulting bonus')).toBeInTheDocument()
    })
  })

  it('allows selecting a different date and updates daily summary and list', async () => {
    const foodCat = testCategories.find((c) => c.name === 'Food')!
    const account = testAccounts[0]!

    await txService.createTransaction({
      type: 'expense',
      amountPaise: 15000,
      categoryId: foodCat.id,
      accountId: account.id,
      description: 'Coffee on 12th',
      transactionDate: '2026-10-12',
    })

    render(<CalendarPage database={db} initialSelectedDate="2026-10-05" />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 3, name: 'Summary for 2026-10-05' })).toBeInTheDocument()
      expect(screen.getByText('No transactions recorded on this date.')).toBeInTheDocument()
    })

    // Click on Day 12
    const day12Btn = screen.getByRole('button', { name: /2026-10-12/i })
    fireEvent.click(day12Btn)

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 3, name: 'Summary for 2026-10-12' })).toBeInTheDocument()
      expect(screen.getByText('Coffee on 12th')).toBeInTheDocument()
      expect(screen.getByText('- ₹150.00')).toBeInTheDocument()
    })
  })

  it('allows adding a transaction for the selected date and preserves the selected date', async () => {
    render(<CalendarPage database={db} initialSelectedDate="2026-10-18" />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 3, name: 'Summary for 2026-10-18' })).toBeInTheDocument()
    })

    // Open quick add for selected date
    const openAddBtn = screen.getByRole('button', { name: 'Add transaction for 2026-10-18' })
    fireEvent.click(openAddBtn)

    // Type text with no explicit date specified (should inherit 2026-10-18)
    const input = screen.getByRole('textbox', { name: 'Enter transaction text for 2026-10-18' })
    fireEvent.change(input, { target: { value: '250 food' } })

    const parseBtn = screen.getByRole('button', { name: 'Parse entry' })
    fireEvent.click(parseBtn)

    // Review draft card appears
    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Transaction Review Card' })).toBeInTheDocument()
      // Date input should be 2026-10-18
      const dateField = screen.getByLabelText('Transaction Date') as HTMLInputElement
      expect(dateField.value).toBe('2026-10-18')
    })

    // Save transaction
    const saveBtn = screen.getByRole('button', { name: 'Confirm & Save' })
    fireEvent.click(saveBtn)

    // Draft closes and day list refreshes with new transaction
    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Transaction Review Card' })).not.toBeInTheDocument()
      expect(screen.getByText('Food')).toBeInTheDocument()
      expect(screen.getByText('- ₹250.00')).toBeInTheDocument()
    })

    // Verify in IndexedDB
    const txs = await db.transactions.where('transactionDate').equals('2026-10-18').toArray()
    expect(txs.length).toBe(1)
    expect(txs[0]!.amountPaise).toBe(25000)
    expect(txs[0]!.transactionDate).toBe('2026-10-18')
  })

  it('refreshes the calendar when a transaction is edited or deleted from the daily list', async () => {
    const foodCat = testCategories.find((c) => c.name === 'Food')!
    const account = testAccounts[0]!

    await txService.createTransaction({
      type: 'expense',
      amountPaise: 30000,
      categoryId: foodCat.id,
      accountId: account.id,
      description: 'Item to delete',
      transactionDate: '2026-10-25',
    })

    render(<CalendarPage database={db} initialSelectedDate="2026-10-25" />)

    await waitFor(() => {
      expect(screen.getByText('Item to delete')).toBeInTheDocument()
    })

    // Click item in calendar
    fireEvent.click(screen.getByRole('button', { name: /expense of ₹300.00/i }))

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Transaction Details and Editing' })).toBeInTheDocument()
    })

    // Delete
    fireEvent.click(screen.getByRole('button', { name: 'Delete Transaction' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Permanent Deletion' }))

    // Calendar day list refreshes to empty
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.queryByText('Item to delete')).not.toBeInTheDocument()
      expect(screen.getByText('No transactions recorded on this date.')).toBeInTheDocument()
    })
  })
})
