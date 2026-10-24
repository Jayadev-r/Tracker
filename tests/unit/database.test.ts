import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { PaisaTrackDatabase } from '../../src/db/database'
import { initializeDatabase } from '../../src/db/init'
import { seedInitialData, DEFAULT_CATEGORY_DEFS } from '../../src/db/seed'
import { generateUuid } from '../../src/utils/ids'
import type { Transaction } from '../../src/types'

describe('Database and Seeding Engine (Phase 1)', () => {
  let testDb: PaisaTrackDatabase
  let dbName: string

  beforeEach(() => {
    dbName = `test_paisatrack_${generateUuid()}`
    testDb = new PaisaTrackDatabase(dbName)
  })

  afterEach(async () => {
    if (testDb.isOpen()) {
      await testDb.delete()
      testDb.close()
    }
  })

  it('initializes the database and seeds default categories, account, and settings', async () => {
    await initializeDatabase(testDb)

    const categories = await testDb.categories.toArray()
    const accounts = await testDb.accounts.toArray()
    const settings = await testDb.settings.get('app-settings')

    // 16 expense + 6 income categories = 22 total
    expect(categories).toHaveLength(22)
    expect(DEFAULT_CATEGORY_DEFS).toHaveLength(22)

    const expenseCategories = categories.filter((c) => c.type === 'expense')
    const incomeCategories = categories.filter((c) => c.type === 'income')
    expect(expenseCategories).toHaveLength(16)
    expect(incomeCategories).toHaveLength(6)

    // Verify all categories have non-empty aliases and valid fields
    for (const cat of categories) {
      expect(cat.id).toBeDefined()
      expect(cat.name.trim().length).toBeGreaterThan(0)
      expect(cat.aliases.length).toBeGreaterThan(0)
      expect(cat.isArchived).toBe(false)
    }

    // Default Cash account
    expect(accounts).toHaveLength(1)
    const cashAccount = accounts[0]
    expect(cashAccount?.name).toBe('Cash')
    expect(cashAccount?.type).toBe('cash')
    expect(cashAccount?.openingBalancePaise).toBe(0)
    expect(cashAccount?.isArchived).toBe(false)

    // Default Settings
    expect(settings).toBeDefined()
    expect(settings?.currency).toBe('INR')
    expect(settings?.locale).toBe('en-IN')
    expect(settings?.schemaVersion).toBe(1)
    expect(settings?.defaultAccountId).toBe(cashAccount?.id)
  })

  it('guarantees idempotent initialization without duplicate records', async () => {
    // First initialization
    const firstResult = await seedInitialData(testDb)
    expect(firstResult).toBe(true)

    const initialCategories = await testDb.categories.count()
    const initialAccounts = await testDb.accounts.count()
    const initialSettings = await testDb.settings.count()

    expect(initialCategories).toBe(22)
    expect(initialAccounts).toBe(1)
    expect(initialSettings).toBe(1)

    // Second initialization attempt (simulates app reopen or subsequent mount)
    const secondResult = await seedInitialData(testDb)
    expect(secondResult).toBe(false) // No seeding performed

    const categoriesAfter = await testDb.categories.count()
    const accountsAfter = await testDb.accounts.count()
    const settingsAfter = await testDb.settings.count()

    expect(categoriesAfter).toBe(22)
    expect(accountsAfter).toBe(1)
    expect(settingsAfter).toBe(1)
  })

  it('does NOT recreate user-deleted or archived categories on subsequent app initializations', async () => {
    await initializeDatabase(testDb)

    // User archives a category
    const foodCategory = await testDb.categories.where('name').equals('Food').first()
    expect(foodCategory).toBeDefined()
    if (foodCategory) {
      await testDb.categories.update(foodCategory.id, { isArchived: true })
    }

    // User deletes a category (e.g. Miscellaneous)
    const miscCategory = await testDb.categories.where('name').equals('Miscellaneous').first()
    expect(miscCategory).toBeDefined()
    if (miscCategory) {
      await testDb.categories.delete(miscCategory.id)
    }

    expect(await testDb.categories.count()).toBe(21)

    // Simulate subsequent app initialization
    await initializeDatabase(testDb)

    // Verify deleted category was NOT resurrected and archived status was NOT overwritten
    expect(await testDb.categories.count()).toBe(21)
    const checkedFood = await testDb.categories.where('name').equals('Food').first()
    expect(checkedFood?.isArchived).toBe(true)
    const checkedMisc = await testDb.categories.where('name').equals('Miscellaneous').first()
    expect(checkedMisc).toBeUndefined()
  })

  it('persists transaction records across simulated database reload', async () => {
    await initializeDatabase(testDb)

    const accounts = await testDb.accounts.toArray()
    const accountId = accounts[0]?.id ?? generateUuid()
    const categories = await testDb.categories.toArray()
    const categoryId = categories[0]?.id ?? generateUuid()

    const now = new Date().toISOString()
    const sampleTransaction: Transaction = {
      id: generateUuid(),
      type: 'expense',
      amountPaise: 25000, // ₹250.00
      categoryId,
      accountId,
      description: 'Dinner at cafe',
      transactionDate: '2026-10-24',
      createdAt: now,
      updatedAt: now,
      source: 'form',
      transferGroupId: null,
      refundOfId: null,
    }

    await testDb.transactions.add(sampleTransaction)

    // Close current connection
    testDb.close()

    // Reopen database with a new Dexie instance using the exact same DB name
    const reopenedDb = new PaisaTrackDatabase(dbName)
    await initializeDatabase(reopenedDb)

    const retrievedTransaction = await reopenedDb.transactions.get(sampleTransaction.id)
    expect(retrievedTransaction).toBeDefined()
    expect(retrievedTransaction?.amountPaise).toBe(25000)
    expect(retrievedTransaction?.description).toBe('Dinner at cafe')
    expect(retrievedTransaction?.transactionDate).toBe('2026-10-24')

    reopenedDb.close()
  })

  it('supports alias index lookup for fast deterministic parsing', async () => {
    await initializeDatabase(testDb)

    // Using the multi-entry index on *aliases
    const lunchCategory = await testDb.categories.where('aliases').equals('lunch').first()
    expect(lunchCategory).toBeDefined()
    expect(lunchCategory?.name).toBe('Food')

    const petrolCategory = await testDb.categories.where('aliases').equals('petrol').first()
    expect(petrolCategory).toBeDefined()
    expect(petrolCategory?.name).toBe('Fuel')
  })
})
