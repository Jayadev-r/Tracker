import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { PaisaTrackDatabase } from '../../src/db/database'
import { initializeDatabase } from '../../src/db/init'
import { AccountService } from '../../src/services/accountService'
import { TransactionService } from '../../src/services/transactionService'
import { ValidationError, NotFoundError } from '../../src/utils/errors'
import { getLocalTodayDateString } from '../../src/utils/dates'

describe('AccountService (Phase 6)', () => {
  let db: PaisaTrackDatabase
  let accountService: AccountService
  let txService: TransactionService
  let dbName: string

  beforeEach(async () => {
    dbName = `test-acc-service-${Date.now()}-${Math.random().toString(36).slice(2)}`
    db = new PaisaTrackDatabase(dbName)
    await initializeDatabase(db)
    accountService = new AccountService(db)
    txService = new TransactionService(db)
  })

  afterEach(async () => {
    await db.delete()
  })

  it('lists accounts and filters archived by default', async () => {
    const initial = await accountService.listAccounts()
    expect(initial.length).toBeGreaterThanOrEqual(1)

    const newAcc = await accountService.createAccount({
      name: 'Savings Bank',
      type: 'bank',
      openingBalancePaise: 10000000,
    })

    const accounts = await accountService.listAccounts()
    expect(accounts.some((a) => a.id === newAcc.id)).toBe(true)

    // Archive
    await accountService.archiveAccount(newAcc.id)
    const activeAccounts = await accountService.listAccounts()
    expect(activeAccounts.some((a) => a.id === newAcc.id)).toBe(false)

    const allAccounts = await accountService.listAccounts({ includeArchived: true })
    expect(allAccounts.some((a) => a.id === newAcc.id)).toBe(true)
  })

  it('prevents duplicate active account names (case-insensitive)', async () => {
    await accountService.createAccount({
      name: 'Credit Card HDFC',
      type: 'credit_card',
    })

    await expect(
      accountService.createAccount({
        name: 'credit card hdfc',
        type: 'credit_card',
      })
    ).rejects.toThrow(ValidationError)
  })

  it('updates account name, type, and opening balance', async () => {
    const acc = await accountService.createAccount({
      name: 'Old Wallet',
      type: 'cash',
      openingBalancePaise: 50000,
    })

    const updated = await accountService.updateAccount(acc.id, {
      name: 'Digital Wallet',
      type: 'other',
      openingBalancePaise: 75000,
    })

    expect(updated.name).toBe('Digital Wallet')
    expect(updated.type).toBe('other')
    expect(updated.openingBalancePaise).toBe(75000)
  })

  it('prevents archiving the default account', async () => {
    const settings = await db.settings.get('app-settings')
    const defaultAccId = settings!.defaultAccountId!

    await expect(accountService.archiveAccount(defaultAccId)).rejects.toThrow(
      ValidationError
    )
  })

  it('prevents archiving the only active account', async () => {
    const active = await accountService.listAccounts()
    expect(active.length).toBe(1) // Default seed has 1 account ("Cash")

    await expect(accountService.archiveAccount(active[0].id)).rejects.toThrow(
      ValidationError
    )
  })

  it('prevents deleting an account referenced by historical transactions', async () => {
    const acc = await accountService.createAccount({
      name: 'Salary Account',
      type: 'bank',
    })
    const cats = await db.categories.toArray()
    const salaryCat = cats.find((c) => c.type === 'income')!

    await txService.createTransaction({
      type: 'income',
      amountPaise: 5000000,
      transactionDate: getLocalTodayDateString(),
      accountId: acc.id,
      categoryId: salaryCat.id,
      description: 'Monthly pay',
    })

    await expect(accountService.deleteAccount(acc.id)).rejects.toThrow(ValidationError)
  })

  it('safely deletes an unreferenced account', async () => {
    const acc = await accountService.createAccount({
      name: 'Temporary Account',
      type: 'bank',
    })

    await accountService.deleteAccount(acc.id)
    const loaded = await accountService.getAccountById(acc.id)
    expect(loaded).toBeUndefined()
  })
})
