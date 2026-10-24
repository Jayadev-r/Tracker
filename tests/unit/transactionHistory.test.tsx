import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { PaisaTrackDatabase } from '../../src/db/database'
import { initializeDatabase } from '../../src/db/init'
import { TransactionService } from '../../src/services/transactionService'
import { TransactionListPage } from '../../src/features/transactions/TransactionListPage'
import { groupTransactionsForDisplay } from '../../src/features/transactions/types'
import { generateUuid } from '../../src/utils/ids'
import type { Category, Account, Transaction } from '../../src/types'

describe('Transaction History & Management Feature', () => {
  let db: PaisaTrackDatabase
  let txService: TransactionService
  let dbName: string
  let testCategories: Category[]
  let testAccounts: Account[]

  beforeEach(async () => {
    dbName = `test-txhistory-${Date.now()}-${Math.random().toString(36).slice(2)}`
    db = new PaisaTrackDatabase(dbName)
    await initializeDatabase(db)
    txService = new TransactionService(db)

    testCategories = await db.categories.toArray()
    testAccounts = await db.accounts.toArray()
  })

  afterEach(async () => {
    await db.delete()
  })

  it('displays empty state when database has no transactions', async () => {
    render(<TransactionListPage database={db} />)

    await waitFor(() => {
      expect(screen.getByText('No transactions recorded yet')).toBeInTheDocument()
      expect(screen.getByText(/0 entries/i)).toBeInTheDocument()
    })
  })

  it('loads and formats income, expense, and refund transactions correctly', async () => {
    const foodCat = testCategories.find((c) => c.name === 'Food')!
    const salaryCat = testCategories.find((c) => c.name === 'Salary')!
    const account = testAccounts[0]!

    // Create expense
    const expense = await txService.createTransaction({
      type: 'expense',
      amountPaise: 25000, // ₹250.00
      categoryId: foodCat.id,
      accountId: account.id,
      description: 'Dinner with colleagues',
      transactionDate: '2026-10-15',
    })

    // Create income
    await txService.createTransaction({
      type: 'income',
      amountPaise: 5000000, // ₹50,000.00
      categoryId: salaryCat.id,
      accountId: account.id,
      description: 'Monthly Salary',
      transactionDate: '2026-10-01',
    })

    // Create refund
    await txService.createRefund({
      amountPaise: 5000, // ₹50.00
      categoryId: foodCat.id,
      accountId: account.id,
      description: 'Dinner cashback refund',
      transactionDate: '2026-10-16',
      refundOfId: expense.id,
    })

    render(<TransactionListPage database={db} />)

    await waitFor(() => {
      expect(screen.getByText('Dinner with colleagues')).toBeInTheDocument()
      expect(screen.getByText('- ₹250.00')).toBeInTheDocument()

      expect(screen.getByText('Monthly Salary')).toBeInTheDocument()
      expect(screen.getByText('+ ₹50,000.00')).toBeInTheDocument()

      expect(screen.getByText('Dinner cashback refund')).toBeInTheDocument()
      expect(screen.getByText('+ ₹50.00')).toBeInTheDocument()

      expect(screen.getByText(/3 entries/i)).toBeInTheDocument()
    })
  })

  it('groups transfer sides into a single logical entry and does not count as income or expense', async () => {
    // Add second account
    const secondAccountId = generateUuid()
    await db.accounts.add({
      id: secondAccountId,
      name: 'HDFC Bank',
      type: 'bank',
      openingBalancePaise: 100000,
      openingBalanceDate: '2026-01-01',
      isArchived: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })

    const cashAccount = testAccounts[0]!

    // Create transfer
    await txService.createTransfer({
      sourceAccountId: secondAccountId,
      destinationAccountId: cashAccount.id,
      amountPaise: 200000, // ₹2,000.00
      transactionDate: '2026-10-20',
      description: 'ATM Cash Withdrawal',
    })

    // Verify Dexie has 2 records
    const rawTxs = await db.transactions.toArray()
    expect(rawTxs.length).toBe(2)

    render(<TransactionListPage database={db} />)

    await waitFor(() => {
      // Should show as 1 logical entry in UI
      expect(screen.getByText('ATM Cash Withdrawal')).toBeInTheDocument()
      expect(screen.getByText('HDFC Bank → Cash')).toBeInTheDocument()
      expect(screen.getByText('₹2,000.00')).toBeInTheDocument()
      expect(screen.getByText(/1 entry/i)).toBeInTheDocument()
    })
  })

  it('handles malformed or incomplete transfer records safely', () => {
    const cashAccount = testAccounts[0]!
    const malformedTx: Transaction = {
      id: 'tx-orphan',
      type: 'transfer',
      amountPaise: 50000,
      categoryId: null,
      accountId: cashAccount.id,
      description: 'Orphan transfer side',
      transactionDate: '2026-10-22',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      source: 'form',
      transferGroupId: 'group-incomplete',
      transferRole: 'source',
      refundOfId: null,
    }

    const items = groupTransactionsForDisplay([malformedTx], testAccounts, testCategories)
    expect(items.length).toBe(1)
    expect(items[0]!.kind).toBe('malformed_transfer')
  })

  it('filters transactions by search text, type, category, account, and date range', async () => {
    const foodCat = testCategories.find((c) => c.name === 'Food')!
    const fuelCat = testCategories.find((c) => c.name === 'Fuel')!
    const account = testAccounts[0]!

    await txService.createTransaction({
      type: 'expense',
      amountPaise: 15000,
      categoryId: foodCat.id,
      accountId: account.id,
      description: 'Pizza lunch',
      transactionDate: '2026-10-10',
    })

    await txService.createTransaction({
      type: 'expense',
      amountPaise: 50000,
      categoryId: fuelCat.id,
      accountId: account.id,
      description: 'Petrol pump refill',
      transactionDate: '2026-10-20',
    })

    render(<TransactionListPage database={db} />)

    await waitFor(() => {
      expect(screen.getByText('Pizza lunch')).toBeInTheDocument()
      expect(screen.getByText('Petrol pump refill')).toBeInTheDocument()
    })

    // 1. Search text filter
    const searchInput = screen.getByRole('textbox', { name: 'Search description' })
    fireEvent.change(searchInput, { target: { value: 'pizza' } })

    await waitFor(() => {
      expect(screen.getByText('Pizza lunch')).toBeInTheDocument()
      expect(screen.queryByText('Petrol pump refill')).not.toBeInTheDocument()
      expect(screen.getByText(/1 entry/i)).toBeInTheDocument()
    })

    // Reset search
    fireEvent.change(searchInput, { target: { value: '' } })
    await waitFor(() => {
      expect(screen.getByText('Petrol pump refill')).toBeInTheDocument()
    })

    // 2. Open advanced filters
    const filterBtn = screen.getByRole('button', { name: 'Toggle advanced filters' })
    fireEvent.click(filterBtn)

    // Filter by Category = Fuel
    const categorySelect = screen.getByRole('combobox', { name: 'Filter by category' })
    fireEvent.change(categorySelect, { target: { value: fuelCat.id } })

    await waitFor(() => {
      expect(screen.queryByText('Pizza lunch')).not.toBeInTheDocument()
      expect(screen.getByText('Petrol pump refill')).toBeInTheDocument()
    })

    // 3. Clear all filters
    const resetBtn = screen.getByRole('button', { name: 'Reset all filters' })
    fireEvent.click(resetBtn)

    await waitFor(() => {
      expect(screen.getByText('Pizza lunch')).toBeInTheDocument()
      expect(screen.getByText('Petrol pump refill')).toBeInTheDocument()
      expect(screen.getByText(/2 entries/i)).toBeInTheDocument()
    })
  })

  it('shows empty filter state when no transactions match criteria and allows clearing filters', async () => {
    const foodCat = testCategories.find((c) => c.name === 'Food')!
    const account = testAccounts[0]!

    await txService.createTransaction({
      type: 'expense',
      amountPaise: 15000,
      categoryId: foodCat.id,
      accountId: account.id,
      description: 'Breakfast',
      transactionDate: '2026-10-10',
    })

    render(<TransactionListPage database={db} />)

    await waitFor(() => {
      expect(screen.getByText('Breakfast')).toBeInTheDocument()
    })

    const searchInput = screen.getByRole('textbox', { name: 'Search description' })
    fireEvent.change(searchInput, { target: { value: 'nonexistent match' } })

    await waitFor(() => {
      expect(screen.getByText('No transactions match your filters')).toBeInTheDocument()
    })

    // Click clear all filters button
    const clearBtn = screen.getByRole('button', { name: 'Clear all filters' })
    fireEvent.click(clearBtn)

    await waitFor(() => {
      expect(screen.getByText('Breakfast')).toBeInTheDocument()
    })
  })

  it('supports editing a transaction and updates database while preserving createdAt', async () => {
    const foodCat = testCategories.find((c) => c.name === 'Food')!
    const shoppingCat = testCategories.find((c) => c.name === 'Shopping')!
    const account = testAccounts[0]!

    const created = await txService.createTransaction({
      type: 'expense',
      amountPaise: 20000, // ₹200
      categoryId: foodCat.id,
      accountId: account.id,
      description: 'Grocery items',
      transactionDate: '2026-10-10',
    })

    render(<TransactionListPage database={db} />)

    await waitFor(() => {
      expect(screen.getByText('Grocery items')).toBeInTheDocument()
    })

    // Click item to open modal
    const itemBtn = screen.getByRole('button', { name: /expense of ₹200.00/i })
    fireEvent.click(itemBtn)

    // Modal opens
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Transaction Details and Editing' })).toBeInTheDocument()
    })

    // Edit amount to 350, description to "Weekly groceries", and category to Shopping
    const amountInput = screen.getByRole('spinbutton', { name: 'Amount in rupees' })
    fireEvent.change(amountInput, { target: { value: '350' } })

    const descInput = screen.getByRole('textbox', { name: 'Description' })
    fireEvent.change(descInput, { target: { value: 'Weekly groceries' } })

    const catSelect = screen.getByRole('combobox', { name: 'Category' })
    fireEvent.change(catSelect, { target: { value: shoppingCat.id } })

    // Save
    const saveBtn = screen.getByRole('button', { name: 'Save changes' })
    fireEvent.click(saveBtn)

    // Modal closes and list reflects changes
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.getByText('Weekly groceries')).toBeInTheDocument()
      expect(screen.getByText('- ₹350.00')).toBeInTheDocument()
    })

    // Check database record
    const updated = await db.transactions.get(created.id)
    expect(updated?.amountPaise).toBe(35000)
    expect(updated?.description).toBe('Weekly groceries')
    expect(updated?.categoryId).toBe(shoppingCat.id)
    expect(updated?.createdAt).toBe(created.createdAt) // Preserved
    expect(new Date(updated!.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(created.updatedAt).getTime())
  })

  it('keeps edit form open and preserves entered changes if validation fails', async () => {
    const foodCat = testCategories.find((c) => c.name === 'Food')!
    const account = testAccounts[0]!

    await txService.createTransaction({
      type: 'expense',
      amountPaise: 20000,
      categoryId: foodCat.id,
      accountId: account.id,
      description: 'Coffee',
      transactionDate: '2026-10-10',
    })

    render(<TransactionListPage database={db} />)

    await waitFor(() => {
      expect(screen.getByText('Coffee')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /expense of ₹200.00/i }))

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    // Put negative amount
    const amountInput = screen.getByRole('spinbutton', { name: 'Amount in rupees' })
    fireEvent.change(amountInput, { target: { value: '-50' } })

    const descInput = screen.getByRole('textbox', { name: 'Description' })
    fireEvent.change(descInput, { target: { value: 'Modified Coffee' } })

    const saveBtn = screen.getByRole('button', { name: 'Save changes' })
    fireEvent.click(saveBtn)

    // Should stay open and show error
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
      expect(screen.getByText(/valid positive rupee amount/i)).toBeInTheDocument()
      // Preserved values
      expect((screen.getByRole('textbox', { name: 'Description' }) as HTMLInputElement).value).toBe('Modified Coffee')
    })
  })

  it('requires two-step explicit confirmation before deleting a transaction', async () => {
    const foodCat = testCategories.find((c) => c.name === 'Food')!
    const account = testAccounts[0]!

    const created = await txService.createTransaction({
      type: 'expense',
      amountPaise: 10000,
      categoryId: foodCat.id,
      accountId: account.id,
      description: 'To delete',
      transactionDate: '2026-10-10',
    })

    render(<TransactionListPage database={db} />)

    await waitFor(() => {
      expect(screen.getByText('To delete')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /expense of ₹100.00/i }))

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    // First click: prompts for confirmation
    const deleteBtn = screen.getByRole('button', { name: 'Delete Transaction' })
    fireEvent.click(deleteBtn)

    // Confirm prompt appears
    expect(screen.getByRole('button', { name: 'Confirm Permanent Deletion' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel Deletion' })).toBeInTheDocument()

    // Second click: executes deletion
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Permanent Deletion' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.queryByText('To delete')).not.toBeInTheDocument()
    })

    const inDb = await db.transactions.get(created.id)
    expect(inDb).toBeUndefined()
  })

  it('prevents deleting an original expense when linked refunds exist and displays error reason', async () => {
    const foodCat = testCategories.find((c) => c.name === 'Food')!
    const account = testAccounts[0]!

    const originalExpense = await txService.createTransaction({
      type: 'expense',
      amountPaise: 50000,
      categoryId: foodCat.id,
      accountId: account.id,
      description: 'Original Flight Ticket',
      transactionDate: '2026-10-10',
    })

    // Link a refund
    await txService.createRefund({
      amountPaise: 20000,
      categoryId: foodCat.id,
      accountId: account.id,
      description: 'Partial flight cancellation refund',
      transactionDate: '2026-10-12',
      refundOfId: originalExpense.id,
    })

    render(<TransactionListPage database={db} />)

    await waitFor(() => {
      expect(screen.getByText('Original Flight Ticket')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /expense of ₹500.00/i }))

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    // Confirm deletion
    fireEvent.click(screen.getByRole('button', { name: 'Delete Transaction' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Permanent Deletion' }))

    // Conflict error should display in UI
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
      expect(screen.getByText(/Cannot delete expense.*linked refund/i)).toBeInTheDocument()
    })

    // Expense is still in DB
    const stillInDb = await db.transactions.get(originalExpense.id)
    expect(stillInDb).toBeDefined()
  })

  it('deleting a transfer removes both source and destination records atomically', async () => {
    const secondAccountId = generateUuid()
    await db.accounts.add({
      id: secondAccountId,
      name: 'Axis Bank',
      type: 'bank',
      openingBalancePaise: 100000,
      openingBalanceDate: '2026-01-01',
      isArchived: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })

    const transfer = await txService.createTransfer({
      sourceAccountId: secondAccountId,
      destinationAccountId: testAccounts[0]!.id,
      amountPaise: 75000,
      transactionDate: '2026-10-18',
      description: 'Rent transfer',
    })

    render(<TransactionListPage database={db} />)

    await waitFor(() => {
      expect(screen.getByText('Rent transfer')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /transfer of ₹750.00/i }))

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByText('Transfer Details')).toBeInTheDocument()
    })

    // Confirm delete
    fireEvent.click(screen.getByRole('button', { name: 'Delete Transaction' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Permanent Deletion' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.queryByText('Rent transfer')).not.toBeInTheDocument()
    })

    // Verify both sides deleted from IndexedDB
    const sides = await db.transactions.where('transferGroupId').equals(transfer.sourceTransaction.transferGroupId!).toArray()
    expect(sides.length).toBe(0)
  })
})
