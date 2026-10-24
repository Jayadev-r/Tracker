import Dexie, { type EntityTable } from 'dexie'
import type { Transaction, Category, Account, Budget, AppSettings } from '../types'

/**
 * PaisaTrack Dexie Database Class
 * Local-first IndexedDB storage engine for personal financial ledger.
 */
export class PaisaTrackDatabase extends Dexie {
  transactions!: EntityTable<Transaction, 'id'>
  categories!: EntityTable<Category, 'id'>
  accounts!: EntityTable<Account, 'id'>
  budgets!: EntityTable<Budget, 'id'>
  settings!: EntityTable<AppSettings, 'id'>

  constructor(databaseName = 'paisatrack') {
    super(databaseName)

    // Version 1: Initial schema release
    this.version(1).stores({
      transactions: 'id, transactionDate, type, categoryId, accountId, createdAt, transferGroupId, refundOfId',
      categories: 'id, name, type, isArchived, *aliases',
      accounts: 'id, name, type, isArchived',
      budgets: 'id, categoryId, period, periodStart, [categoryId+period+periodStart]',
      settings: 'id',
    })

    // Version 2: Explicit transferRole indexing for unambiguous transfer movement tracking
    this.version(2).stores({
      transactions: 'id, transactionDate, type, categoryId, accountId, createdAt, transferGroupId, refundOfId, transferRole',
    })
  }
}

/**
 * Singleton database instance for the application runtime.
 */
export const db = new PaisaTrackDatabase()
