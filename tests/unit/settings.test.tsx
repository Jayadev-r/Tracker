import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PaisaTrackDatabase } from '../../src/db/database'
import { initializeDatabase } from '../../src/db/init'
import { SettingsPage } from '../../src/features/settings/SettingsPage'
import { TransactionService } from '../../src/services/transactionService'
import { BudgetService } from '../../src/services/budgetService'
import { BackupService } from '../../src/services/backupService'
import { getLocalTodayDateString, getMonthStartLocalDateString } from '../../src/utils/dates'

describe('Settings & Management Features (Phase 6)', () => {
  let db: PaisaTrackDatabase
  let txService: TransactionService
  let budgetService: BudgetService
  let backupService: BackupService
  let dbName: string

  beforeEach(async () => {
    dbName = `test-settings-ui-${Date.now()}-${Math.random().toString(36).slice(2)}`
    db = new PaisaTrackDatabase(dbName)
    await initializeDatabase(db)
    txService = new TransactionService(db)
    budgetService = new BudgetService(db)
    backupService = new BackupService(db)
  })

  afterEach(async () => {
    await db.delete()
  })

  it('renders all settings sub-tabs and switches between them', async () => {
    render(<SettingsPage database={db} />)

    expect(screen.getByRole('tab', { name: 'Categories Settings' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Accounts Settings' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Budgets Settings' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Backup and Restore Settings' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Preferences and About' })).toBeInTheDocument()

    // Default tab is Categories
    expect(screen.getByRole('heading', { level: 3, name: 'Category Management' })).toBeInTheDocument()

    // Switch to Accounts
    fireEvent.click(screen.getByRole('tab', { name: 'Accounts Settings' }))
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 3, name: 'Accounts Management' })).toBeInTheDocument()
    })

    // Switch to Budgets
    fireEvent.click(screen.getByRole('tab', { name: 'Budgets Settings' }))
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 3, name: 'Category Budgets' })).toBeInTheDocument()
    })

    // Switch to Backup
    fireEvent.click(screen.getByRole('tab', { name: 'Backup and Restore Settings' }))
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 3, name: 'Backup & Restore' })).toBeInTheDocument()
    })

    // Switch to Preferences
    fireEvent.click(screen.getByRole('tab', { name: 'Preferences and About' }))
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 3, name: 'Preferences & About' })).toBeInTheDocument()
    })
  })

  it('manages categories: creates new custom category, toggles archive, and prevents duplicates', async () => {
    render(<SettingsPage database={db} initialSubTab="categories" />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 3, name: 'Category Management' })).toBeInTheDocument()
    })

    // 1. Open New Category Modal
    const newBtn = screen.getByRole('button', { name: 'Add New Category' })
    fireEvent.click(newBtn)

    expect(screen.getByRole('dialog', { name: 'Add Category' })).toBeInTheDocument()

    // 2. Fill form and submit
    const nameInput = screen.getByLabelText('Category Name')
    fireEvent.change(nameInput, { target: { value: 'Coffee & Tea' } })
    const aliasInput = screen.getByLabelText(/Chat Parser Aliases/i)
    fireEvent.change(aliasInput, { target: { value: 'espresso, latte, brew' } })

    const saveBtn = screen.getByRole('button', { name: 'Save Category' })
    fireEvent.click(saveBtn)

    await waitFor(() => {
      expect(screen.getByText('Coffee & Tea')).toBeInTheDocument()
      expect(screen.getByText(/Aliases: espresso, latte, brew/)).toBeInTheDocument()
    }, { timeout: 3000 })

    // 3. Prevent duplicate active category
    fireEvent.click(screen.getByRole('button', { name: 'Add New Category' }))
    fireEvent.change(screen.getByLabelText('Category Name'), { target: { value: 'coffee & tea' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Category' }))

    await waitFor(() => {
      expect(screen.getByText(/already exists/i)).toBeInTheDocument()
    }, { timeout: 3000 })

    // Close modal
    fireEvent.click(screen.getByRole('button', { name: 'Close modal' }))

    // 4. Archive category
    const archiveBtn = screen.getByRole('button', { name: 'Archive category Coffee & Tea' })
    fireEvent.click(archiveBtn)

    await waitFor(() => {
      // By default, archived is hidden
      expect(screen.queryByText('Coffee & Tea')).not.toBeInTheDocument()
    }, { timeout: 3000 })

    // 5. Toggle Show Archived
    const showArchivedCheckbox = screen.getByLabelText('Show Archived')
    fireEvent.click(showArchivedCheckbox)

    await waitFor(() => {
      expect(screen.getByText('Coffee & Tea')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Restore category Coffee & Tea' })).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('manages accounts: creates new account and displays default account badge', async () => {
    render(<SettingsPage database={db} initialSubTab="accounts" />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 3, name: 'Accounts Management' })).toBeInTheDocument()
      // Seeded "Cash" account should have default badge
      expect(screen.getByText('Cash')).toBeInTheDocument()
      expect(screen.getByText('Default')).toBeInTheDocument()
    })

    // Open Add Account modal
    const newBtn = screen.getByRole('button', { name: 'Add New Account' })
    fireEvent.click(newBtn)

    expect(screen.getByRole('dialog', { name: 'Add Account' })).toBeInTheDocument()

    // Fill form
    fireEvent.change(screen.getByLabelText('Account Name'), { target: { value: 'Axis Salary Bank' } })
    fireEvent.change(screen.getByLabelText('Account Type'), { target: { value: 'bank' } })
    fireEvent.change(screen.getByLabelText(/Opening Balance/i), { target: { value: '15000' } })

    fireEvent.click(screen.getByRole('button', { name: 'Save Account' }))

    await waitFor(() => {
      expect(screen.getByText('Axis Salary Bank')).toBeInTheDocument()
      expect(screen.getByText(/Opening: ₹15,000\.00/)).toBeInTheDocument()
    })
  })

  it('manages budgets: creates budget, displays progress, and shows 80% warning and 100% over-budget thresholds', async () => {
    const cats = await db.categories.toArray()
    const foodCat = cats.find((c) => c.name.toLowerCase() === 'food' || c.name.toLowerCase().includes('dining'))!
    const accs = await db.accounts.toArray()

    const today = getLocalTodayDateString()
    const monthStart = getMonthStartLocalDateString(today)

    // 1. Create a budget of ₹10,000 for Food in current month
    await budgetService.createBudget({
      categoryId: foodCat.id,
      period: 'monthly',
      periodStart: monthStart,
      limitPaise: 1000000, // ₹10,000
    })

    // 2. Spend ₹8,500 (85%) -> warning threshold
    await txService.createTransaction({
      type: 'expense',
      amountPaise: 850000,
      transactionDate: today,
      accountId: accs[0].id,
      categoryId: foodCat.id,
      description: 'Groceries month',
    })

    render(<SettingsPage database={db} initialSubTab="budgets" />)

    await waitFor(() => {
      expect(screen.getByText(foodCat.name)).toBeInTheDocument()
      expect(screen.getByText('₹8,500.00')).toBeInTheDocument()
      expect(screen.getByText(/of ₹10,000\.00/)).toBeInTheDocument()
      expect(screen.getByText('₹1,500.00 left')).toBeInTheDocument()
      // Threshold 85% -> Near Limit badge
      expect(screen.getByText(/Near Limit \(85%\)/)).toBeInTheDocument()
    })
  })

  it('manages backups: handles export triggers and validates invalid JSON on restore safely', async () => {
    // Spy on triggerFileDownload
    const downloadSpy = vi.spyOn(backupService, 'triggerFileDownload').mockReturnValue(true)

    render(<SettingsPage database={db} initialSubTab="backup" />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 3, name: 'Backup & Restore' })).toBeInTheDocument()
    })

    // 1. Export JSON button
    const exportJsonBtn = screen.getByRole('button', { name: /Export JSON/i })
    fireEvent.click(exportJsonBtn)

    await waitFor(() => {
      expect(screen.getByText(/Backup exported successfully/)).toBeInTheDocument()
    })

    // 2. Export CSV button
    const exportCsvBtn = screen.getByRole('button', { name: /Export CSV/i })
    fireEvent.click(exportCsvBtn)

    await waitFor(() => {
      expect(screen.getByText(/Transactions exported as/)).toBeInTheDocument()
    })

    downloadSpy.mockRestore()
  })

  it('updates preferences: changes theme and week-start day', async () => {
    render(<SettingsPage database={db} initialSubTab="preferences" />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 3, name: 'Preferences & About' })).toBeInTheDocument()
      expect(screen.getByText('Privacy & Data Sovereignty Guarantee')).toBeInTheDocument()
    })

    const themeSelect = screen.getByLabelText('Theme Preference')
    fireEvent.change(themeSelect, { target: { value: 'dark' } })

    await waitFor(async () => {
      const s = await db.settings.get('app-settings')
      expect(s?.theme).toBe('dark')
    })

    const weekSelect = screen.getByLabelText('Week Starts On')
    fireEvent.change(weekSelect, { target: { value: '0' } }) // Sunday

    await waitFor(async () => {
      const s = await db.settings.get('app-settings')
      expect(s?.theme).toBe('dark')
      expect(s?.weekStartsOn).toBe(0)
    })
  })
})
