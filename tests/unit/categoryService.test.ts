import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { PaisaTrackDatabase } from '../../src/db/database'
import { initializeDatabase } from '../../src/db/init'
import { CategoryService } from '../../src/services/categoryService'
import { TransactionService } from '../../src/services/transactionService'
import { BudgetService } from '../../src/services/budgetService'
import { ValidationError, NotFoundError } from '../../src/utils/errors'
import { getLocalTodayDateString } from '../../src/utils/dates'

describe('CategoryService (Phase 6)', () => {
  let db: PaisaTrackDatabase
  let catService: CategoryService
  let txService: TransactionService
  let budgetService: BudgetService
  let dbName: string

  beforeEach(async () => {
    dbName = `test-cat-service-${Date.now()}-${Math.random().toString(36).slice(2)}`
    db = new PaisaTrackDatabase(dbName)
    await initializeDatabase(db)
    catService = new CategoryService(db)
    txService = new TransactionService(db)
    budgetService = new BudgetService(db)
  })

  afterEach(async () => {
    await db.delete()
  })

  it('lists active categories sorted by name and can include archived', async () => {
    const active = await catService.listCategories()
    expect(active.length).toBeGreaterThan(0)
    // Check alphabetical order
    for (let i = 0; i < active.length - 1; i++) {
      expect(active[i].name.localeCompare(active[i + 1].name)).toBeLessThanOrEqual(0)
    }

    // Archive one category
    await catService.archiveCategory(active[0].id)

    const activeAfter = await catService.listCategories()
    expect(activeAfter.length).toBe(active.length - 1)
    expect(activeAfter.some((c) => c.id === active[0].id)).toBe(false)

    const all = await catService.listCategories({ includeArchived: true })
    expect(all.length).toBe(active.length)
    expect(all.some((c) => c.id === active[0].id)).toBe(true)
  })

  it('creates custom category and normalizes aliases', async () => {
    const created = await catService.createCategory({
      name: 'Pet Care',
      type: 'expense',
      icon: 'Dog',
      color: '#f59e0b',
      aliases: ['pet', 'vet', 'dog food', 'pet'], // Duplicate 'pet' should be deduplicated
    })

    expect(created.id).toBeDefined()
    expect(created.name).toBe('Pet Care')
    expect(created.type).toBe('expense')
    expect(created.isArchived).toBe(false)
    expect(created.aliases).toEqual(['pet', 'vet', 'dog food'])
  })

  it('prevents duplicate active category names for the same type (case-insensitive)', async () => {
    await catService.createCategory({
      name: 'Software',
      type: 'expense',
    })

    await expect(
      catService.createCategory({
        name: 'software', // same name, lower-case
        type: 'expense',
      })
    ).rejects.toThrow(ValidationError)

    // Allowed for different type (income vs expense)
    const incomeSoftware = await catService.createCategory({
      name: 'Software',
      type: 'income',
    })
    expect(incomeSoftware.type).toBe('income')
  })

  it('prevents alias conflicts with other active categories', async () => {
    await catService.createCategory({
      name: 'Gadgets',
      type: 'expense',
      aliases: ['tech', 'device'],
    })

    // Another category trying to use 'tech'
    await expect(
      catService.createCategory({
        name: 'Electronics',
        type: 'expense',
        aliases: ['tech'],
      })
    ).rejects.toThrow(ValidationError)
  })

  it('updates category name, color, and aliases safely', async () => {
    const cat = await catService.createCategory({
      name: 'Book Club',
      type: 'expense',
      color: '#3b82f6',
      aliases: ['fiction'],
    })

    const updated = await catService.updateCategory(cat.id, {
      name: 'Literature & Books',
      color: '#10b981',
      aliases: ['fiction', 'novels'],
    })

    expect(updated.name).toBe('Literature & Books')
    expect(updated.color).toBe('#10b981')
    expect(updated.aliases).toEqual(['fiction', 'novels'])
  })

  it('archives and restores category safely with duplicate check', async () => {
    const cat = await catService.createCategory({
      name: 'Gym',
      type: 'expense',
    })

    const archived = await catService.archiveCategory(cat.id)
    expect(archived.isArchived).toBe(true)

    // Creating another active category with the same name while archived is allowed
    const newGym = await catService.createCategory({
      name: 'Gym',
      type: 'expense',
    })
    expect(newGym.id).not.toBe(cat.id)

    // Restoring the original category now fails because an active 'Gym' exists
    await expect(catService.restoreCategory(cat.id)).rejects.toThrow(ValidationError)

    // Archive the new one, then restore the old one
    await catService.archiveCategory(newGym.id)
    const restored = await catService.restoreCategory(cat.id)
    expect(restored.isArchived).toBe(false)
  })

  it('prevents deleting a category referenced by historical transactions', async () => {
    const cat = await catService.createCategory({
      name: 'Dental',
      type: 'expense',
    })
    const accounts = await db.accounts.toArray()

    await txService.createTransaction({
      type: 'expense',
      amountPaise: 250000,
      transactionDate: getLocalTodayDateString(),
      accountId: accounts[0].id,
      categoryId: cat.id,
      description: 'Teeth cleaning',
    })

    await expect(catService.deleteCategory(cat.id)).rejects.toThrow(ValidationError)

    // Category remains intact
    const loaded = await catService.getCategoryById(cat.id)
    expect(loaded).toBeDefined()
  })

  it('prevents deleting a category referenced by budgets', async () => {
    const cat = await catService.createCategory({
      name: 'Holidays',
      type: 'expense',
    })

    await budgetService.createBudget({
      categoryId: cat.id,
      period: 'monthly',
      periodStart: '2026-10-01',
      limitPaise: 5000000,
    })

    await expect(catService.deleteCategory(cat.id)).rejects.toThrow(ValidationError)
  })

  it('safely deletes unreferenced custom category', async () => {
    const cat = await catService.createCategory({
      name: 'Temporary Cat',
      type: 'expense',
    })

    await catService.deleteCategory(cat.id)
    const loaded = await catService.getCategoryById(cat.id)
    expect(loaded).toBeUndefined()
  })
})
