import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { PaisaTrackDatabase } from '../../src/db/database'
import { initializeDatabase } from '../../src/db/init'
import { BackupService, type PaisaTrackBackupData } from '../../src/services/backupService'
import { TransactionService } from '../../src/services/transactionService'
import { CategoryService } from '../../src/services/categoryService'
import { AccountService } from '../../src/services/accountService'
import { BudgetService } from '../../src/services/budgetService'
import { generateUuid } from '../../src/utils/ids'

describe('BackupService (Phase 6)', () => {
  let db: PaisaTrackDatabase
  let backupService: BackupService
  let txService: TransactionService
  let catService: CategoryService
  let accService: AccountService
  let budgetService: BudgetService
  let dbName: string

  beforeEach(async () => {
    dbName = `test-backup-service-${Date.now()}-${Math.random().toString(36).slice(2)}`
    db = new PaisaTrackDatabase(dbName)
    await initializeDatabase(db)
    backupService = new BackupService(db)
    txService = new TransactionService(db)
    catService = new CategoryService(db)
    accService = new AccountService(db)
    budgetService = new BudgetService(db)
  })

  afterEach(async () => {
    await db.delete()
  })

  it('exports valid JSON backup and updates lastBackupAt in settings', async () => {
    const rawJson = await backupService.exportJsonBackup()
    const parsed = JSON.parse(rawJson)

    expect(parsed.format).toBe('PaisaTrackBackup')
    expect(parsed.version).toBe(1)
    expect(parsed.schemaVersion).toBe(2)
    expect(parsed.exportedAt).toBeDefined()
    expect(Array.isArray(parsed.categories)).toBe(true)
    expect(Array.isArray(parsed.accounts)).toBe(true)
    expect(Array.isArray(parsed.transactions)).toBe(true)
    expect(Array.isArray(parsed.budgets)).toBe(true)

    // Verify lastBackupAt was updated in settings
    const settings = await db.settings.get('app-settings')
    expect(settings?.lastBackupAt).toBeDefined()
  })

  it('exports valid CSV with proper headers and escaping', async () => {
    const cats = await catService.listCategories()
    const accs = await accService.listAccounts()

    await txService.createTransaction({
      type: 'expense',
      amountPaise: 15000,
      transactionDate: '2026-10-24',
      accountId: accs[0].id,
      categoryId: cats[0].id,
      description: 'Coffee, with comma and "quotes"',
    })

    const csv = await backupService.exportCsvTransactions()
    expect(csv).toContain('Transaction ID,Date,Type,Amount (INR),Category,Account,Description')
    expect(csv).toContain('"Coffee, with comma and ""quotes"""')
    expect(csv).toContain('150.00')
  })

  it('rejects malformed JSON or invalid format', () => {
    const r1 = backupService.validateBackup('{ invalid json ')
    expect(r1.isValid).toBe(false)
    expect(r1.errors[0]).toContain('Malformed JSON')

    const r2 = backupService.validateBackup(JSON.stringify({ format: 'WrongFormat', version: 1 }))
    expect(r2.isValid).toBe(false)
    expect(r2.errors[0]).toContain('Unsupported backup format')

    const r3 = backupService.validateBackup(JSON.stringify({ format: 'PaisaTrackBackup', version: 99 }))
    expect(r3.isValid).toBe(false)
    expect(r3.errors.some((e) => e.includes('Unsupported backup version'))).toBe(true)
  })

  it('rejects backups with duplicate IDs or broken foreign references', async () => {
    const rawJson = await backupService.exportJsonBackup()
    const data: PaisaTrackBackupData = JSON.parse(rawJson)

    // Introduce duplicate category ID
    const duplicateCats = [...data.categories, { ...data.categories[0] }]
    const invalidData1 = { ...data, categories: duplicateCats }
    const r1 = backupService.validateBackup(invalidData1)
    expect(r1.isValid).toBe(false)
    expect(r1.errors.some((e) => e.includes('Duplicate category ID'))).toBe(true)

    // Introduce broken category reference in transaction
    const brokenTx = {
      id: generateUuid(),
      type: 'expense' as const,
      amountPaise: 10000,
      categoryId: generateUuid(), // Does not exist
      accountId: data.accounts[0].id,
      description: 'Broken reference',
      transactionDate: '2026-10-24',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      source: 'form' as const,
      transferGroupId: null,
      refundOfId: null,
    }
    const invalidData2 = { ...data, transactions: [brokenTx] }
    const r2 = backupService.validateBackup(invalidData2)
    expect(r2.isValid).toBe(false)
    expect(r2.errors.some((e) => e.includes('references non-existent category'))).toBe(true)
  })

  it('rejects broken transfer pairs and broken refund references', async () => {
    const rawJson = await backupService.exportJsonBackup()
    const data: PaisaTrackBackupData = JSON.parse(rawJson)

    const groupId = generateUuid()
    // Lone transfer transaction without partner
    const loneTransfer = {
      id: generateUuid(),
      type: 'transfer' as const,
      amountPaise: 50000,
      categoryId: null,
      accountId: data.accounts[0].id,
      description: 'Transfer lone',
      transactionDate: '2026-10-24',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      source: 'form' as const,
      transferGroupId: groupId,
      transferRole: 'source' as const,
      refundOfId: null,
    }
    const r1 = backupService.validateBackup({ ...data, transactions: [loneTransfer] })
    expect(r1.isValid).toBe(false)
    expect(r1.errors.some((e) => e.includes('expected exactly 2'))).toBe(true)

    // Broken refund pointing to non-existent ID
    const brokenRefund = {
      id: generateUuid(),
      type: 'refund' as const,
      amountPaise: 50000,
      categoryId: data.categories[0].id,
      accountId: data.accounts[0].id,
      description: 'Refund ghost',
      transactionDate: '2026-10-24',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      source: 'form' as const,
      transferGroupId: null,
      refundOfId: generateUuid(), // Ghost
    }
    const r2 = backupService.validateBackup({ ...data, transactions: [brokenRefund] })
    expect(r2.isValid).toBe(false)
    expect(r2.errors.some((e) => e.includes('references non-existent original expense'))).toBe(true)
  })

  it('performs full round-trip export and atomic replace restore', async () => {
    const cats = await catService.listCategories()
    const accs = await accService.listAccounts()

    // Create a transaction and a budget
    const createdTx = await txService.createTransaction({
      type: 'expense',
      amountPaise: 450000,
      transactionDate: '2026-10-24',
      accountId: accs[0].id,
      categoryId: cats[0].id,
      description: 'Round-trip expense',
    })

    const createdBudget = await budgetService.createBudget({
      categoryId: cats[0].id,
      period: 'monthly',
      periodStart: '2026-10-01',
      limitPaise: 1000000,
    })

    // Export
    const exportedJson = await backupService.exportJsonBackup()
    const validation = backupService.validateBackup(exportedJson)
    expect(validation.isValid).toBe(true)

    // Clear all database records
    await db.transactions.clear()
    await db.budgets.clear()
    expect(await db.transactions.count()).toBe(0)
    expect(await db.budgets.count()).toBe(0)

    // Atomic Restore
    const restoreResult = await backupService.restoreBackup(validation.data!, 'replace')
    expect(restoreResult.transactionsCount).toBeGreaterThanOrEqual(1)
    expect(restoreResult.budgetsCount).toBe(1)

    // Verify restored records
    const restoredTx = await db.transactions.get(createdTx.id)
    expect(restoredTx).toBeDefined()
    expect(restoredTx?.amountPaise).toBe(450000)
    expect(restoredTx?.description).toBe('Round-trip expense')

    const restoredBudget = await db.budgets.get(createdBudget.id)
    expect(restoredBudget).toBeDefined()
    expect(restoredBudget?.limitPaise).toBe(1000000)
  })

  it('clears all data and restores default seeded state', async () => {
    const cats = await catService.listCategories()
    const accs = await accService.listAccounts()

    await txService.createTransaction({
      type: 'expense',
      amountPaise: 100000,
      transactionDate: '2026-10-24',
      accountId: accs[0].id,
      categoryId: cats[0].id,
      description: 'Will be cleared',
    })

    expect(await db.transactions.count()).toBe(1)

    // Clear all data
    await backupService.clearAllData()

    // Transactions should be 0
    expect(await db.transactions.count()).toBe(0)
    // Default seeded settings and categories should be re-established
    expect(await db.settings.get('app-settings')).toBeDefined()
    expect((await db.categories.count())).toBeGreaterThan(0)
    expect((await db.accounts.count())).toBeGreaterThanOrEqual(1)
  })
})
