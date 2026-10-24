import { describe, it, expect, afterEach } from 'vitest'
import Dexie from 'dexie'
import { PaisaTrackDatabase } from '../../src/db/database'
import { generateUuid } from '../../src/utils/ids'

describe('Database Schema Migration V1 -> V2 (Phase 2)', () => {
  let dbName: string
  let currentDb: Dexie | null = null

  afterEach(async () => {
    if (currentDb && currentDb.isOpen()) {
      await currentDb.delete()
      currentDb.close()
    }
  })

  it('safely upgrades Dexie schema from V1 to V2 preserving existing records', async () => {
    dbName = `test_migration_${generateUuid()}`

    // 1. Create a pure Version 1 database and insert a record
    const v1Db = new Dexie(dbName)
    currentDb = v1Db
    v1Db.version(1).stores({
      transactions: 'id, transactionDate, type, categoryId, accountId, createdAt, transferGroupId, refundOfId',
      categories: 'id, name, type, isArchived, *aliases',
      accounts: 'id, name, type, isArchived',
      budgets: 'id, categoryId, period, periodStart, [categoryId+period+periodStart]',
      settings: 'id',
    })
    await v1Db.open()

    const v1Record = {
      id: generateUuid(),
      type: 'expense' as const,
      amountPaise: 5000,
      categoryId: null,
      accountId: generateUuid(),
      description: 'Pre-migration expense',
      transactionDate: '2026-10-24',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      source: 'form' as const,
      transferGroupId: null,
      refundOfId: null,
    }

    await v1Db.table('transactions').add(v1Record)
    expect(await v1Db.table('transactions').count()).toBe(1)
    v1Db.close()

    // 2. Open with PaisaTrackDatabase which has Version 2 schema
    const v2Db = new PaisaTrackDatabase(dbName)
    currentDb = v2Db
    await v2Db.open()

    // Verify database upgraded to version 2
    expect(v2Db.verno).toBe(2)

    // Verify existing record is preserved intact
    const fetched = await v2Db.transactions.get(v1Record.id)
    expect(fetched).toBeDefined()
    expect(fetched?.amountPaise).toBe(5000)
    expect(fetched?.description).toBe('Pre-migration expense')

    // Add a record with transferRole in version 2
    const transferRecord = {
      id: generateUuid(),
      type: 'transfer' as const,
      amountPaise: 10000,
      categoryId: null,
      accountId: generateUuid(),
      description: 'Transfer record',
      transactionDate: '2026-10-24',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      source: 'form' as const,
      transferGroupId: generateUuid(),
      transferRole: 'source' as const,
      refundOfId: null,
    }

    await v2Db.transactions.add(transferRecord)

    // Verify indexed query on transferRole works
    const sourceRecords = await v2Db.transactions.where('transferRole').equals('source').toArray()
    expect(sourceRecords).toHaveLength(1)
    expect(sourceRecords[0]?.id).toBe(transferRecord.id)
  })
})
