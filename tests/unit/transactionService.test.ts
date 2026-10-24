import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { PaisaTrackDatabase } from '../../src/db/database'
import { initializeDatabase } from '../../src/db/init'
import { TransactionService } from '../../src/services/transactionService'
import { generateUuid } from '../../src/utils/ids'
import {
  ValidationError,
  NotFoundError,
  ConflictError,
  RefundExceededError,
} from '../../src/utils/errors'

describe('Transaction Service (Phase 2)', () => {
  let testDb: PaisaTrackDatabase
  let service: TransactionService
  let cashAccountId: string
  let bankAccountId: string
  let foodCategoryId: string
  let salaryCategoryId: string

  beforeEach(async () => {
    const dbName = `test_tx_service_${generateUuid()}`
    testDb = new PaisaTrackDatabase(dbName)
    await initializeDatabase(testDb)
    service = new TransactionService(testDb)

    // Retrieve default cash account
    const accounts = await testDb.accounts.toArray()
    cashAccountId = accounts[0]!.id

    // Create a second account for transfer tests
    bankAccountId = generateUuid()
    await testDb.accounts.add({
      id: bankAccountId,
      name: 'Bank Account',
      type: 'bank',
      openingBalancePaise: 1000000,
      openingBalanceDate: '2026-10-24',
      isArchived: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })

    // Retrieve food and salary categories
    const foodCat = await testDb.categories.where('name').equals('Food').first()
    foodCategoryId = foodCat!.id
    const salaryCat = await testDb.categories.where('name').equals('Salary').first()
    salaryCategoryId = salaryCat!.id
  })

  afterEach(async () => {
    if (testDb.isOpen()) {
      await testDb.delete()
      testDb.close()
    }
  })

  describe('Basic Transaction Creation and Retrieval', () => {
    it('creates an expense transaction with validated fields and timestamps', async () => {
      const created = await service.createTransaction({
        type: 'expense',
        amountPaise: 15000, // ₹150.00
        categoryId: foodCategoryId,
        accountId: cashAccountId,
        description: 'Lunch at cafe',
        transactionDate: '2026-10-24',
      })

      expect(created.id).toBeDefined()
      expect(created.amountPaise).toBe(15000)
      expect(created.type).toBe('expense')
      expect(created.categoryId).toBe(foodCategoryId)
      expect(created.accountId).toBe(cashAccountId)
      expect(created.createdAt).toBeDefined()
      expect(created.updatedAt).toBeDefined()

      const retrieved = await service.getTransactionOrThrow(created.id)
      expect(retrieved.id).toBe(created.id)
      expect(retrieved.description).toBe('Lunch at cafe')
    })

    it('creates an income transaction with salary category', async () => {
      const created = await service.createTransaction({
        type: 'income',
        amountPaise: 3600000, // ₹36,000.00
        categoryId: salaryCategoryId,
        accountId: bankAccountId,
        description: 'October Salary',
        transactionDate: '2026-10-24',
      })

      expect(created.type).toBe('income')
      expect(created.amountPaise).toBe(3600000)
    })

    it('rejects category type incompatibility (income category for expense)', async () => {
      await expect(
        service.createTransaction({
          type: 'expense',
          amountPaise: 5000,
          categoryId: salaryCategoryId, // Income category!
          accountId: cashAccountId,
          transactionDate: '2026-10-24',
        })
      ).rejects.toThrow(ValidationError)
    })

    it('rejects archived accounts or categories', async () => {
      // Archive cash account
      await testDb.accounts.update(cashAccountId, { isArchived: true })

      await expect(
        service.createTransaction({
          type: 'expense',
          amountPaise: 5000,
          categoryId: foodCategoryId,
          accountId: cashAccountId,
          transactionDate: '2026-10-24',
        })
      ).rejects.toThrow(/archived account/)
    })

    it('throws NotFoundError when transaction does not exist', async () => {
      await expect(service.getTransactionOrThrow(generateUuid())).rejects.toThrow(NotFoundError)
    })
  })

  describe('Transaction Updates and Deletion', () => {
    it('updates transaction amount and preserves createdAt while updating updatedAt', async () => {
      const created = await service.createTransaction({
        type: 'expense',
        amountPaise: 10000,
        categoryId: foodCategoryId,
        accountId: cashAccountId,
        description: 'Initial',
        transactionDate: '2026-10-20',
      })

      // Small delay to ensure timestamp diff
      await new Promise((res) => setTimeout(res, 10))

      const updated = await service.updateTransaction(created.id, {
        amountPaise: 12000,
        description: 'Updated lunch',
      })

      expect(updated.amountPaise).toBe(12000)
      expect(updated.description).toBe('Updated lunch')
      expect(updated.createdAt).toBe(created.createdAt)
      expect(new Date(updated.updatedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(created.updatedAt).getTime()
      )
    })

    it('deletes transaction via explicit hard delete', async () => {
      const created = await service.createTransaction({
        type: 'expense',
        amountPaise: 5000,
        categoryId: foodCategoryId,
        accountId: cashAccountId,
        transactionDate: '2026-10-24',
      })

      await service.deleteTransaction(created.id)
      const found = await service.getTransactionById(created.id)
      expect(found).toBeNull()
    })
  })

  describe('Refund Validation & Cumulative Limits (Part E)', () => {
    it('creates a linked refund that reduces remaining refundable balance', async () => {
      const expense = await service.createTransaction({
        type: 'expense',
        amountPaise: 10000, // ₹100.00
        categoryId: foodCategoryId,
        accountId: cashAccountId,
        transactionDate: '2026-10-20',
      })

      // First partial refund ₹30.00
      const refund1 = await service.createRefund({
        amountPaise: 3000,
        accountId: cashAccountId,
        transactionDate: '2026-10-21',
        refundOfId: expense.id,
      })

      expect(refund1.amountPaise).toBe(3000)
      expect(refund1.type).toBe('refund')
      expect(refund1.categoryId).toBe(foodCategoryId) // Inherited

      // Second partial refund ₹70.00 (remaining ₹70.00)
      const refund2 = await service.createRefund({
        amountPaise: 7000,
        accountId: cashAccountId,
        transactionDate: '2026-10-22',
        refundOfId: expense.id,
      })
      expect(refund2.amountPaise).toBe(7000)

      // Third refund should be rejected because 3000 + 7000 = 10000 (0 remaining)
      await expect(
        service.createRefund({
          amountPaise: 100, // 1 rupee extra
          accountId: cashAccountId,
          transactionDate: '2026-10-23',
          refundOfId: expense.id,
        })
      ).rejects.toThrow(RefundExceededError)
    })

    it('prevents deleting an original expense while linked refunds exist', async () => {
      const expense = await service.createTransaction({
        type: 'expense',
        amountPaise: 10000,
        categoryId: foodCategoryId,
        accountId: cashAccountId,
        transactionDate: '2026-10-20',
      })

      await service.createRefund({
        amountPaise: 2000,
        accountId: cashAccountId,
        transactionDate: '2026-10-21',
        refundOfId: expense.id,
      })

      await expect(service.deleteTransaction(expense.id)).rejects.toThrow(ConflictError)
    })

    it('prevents reducing expense amount below already issued refunds', async () => {
      const expense = await service.createTransaction({
        type: 'expense',
        amountPaise: 10000, // ₹100
        categoryId: foodCategoryId,
        accountId: cashAccountId,
        transactionDate: '2026-10-20',
      })

      await service.createRefund({
        amountPaise: 4000, // ₹40
        accountId: cashAccountId,
        transactionDate: '2026-10-21',
        refundOfId: expense.id,
      })

      // Attempt to reduce expense to ₹30 (< ₹40 already refunded)
      await expect(
        service.updateTransaction(expense.id, {
          amountPaise: 3000,
        })
      ).rejects.toThrow(ConflictError)
    })
  })

  describe('Atomic Transfers (Part F)', () => {
    it('creates both source and destination records atomically sharing transferGroupId', async () => {
      const transfer = await service.createTransfer({
        sourceAccountId: bankAccountId,
        destinationAccountId: cashAccountId,
        amountPaise: 50000, // ₹500.00
        transactionDate: '2026-10-24',
        description: 'ATM Cash Withdrawal',
      })

      expect(transfer.sourceTransaction.transferGroupId).toBe(
        transfer.destinationTransaction.transferGroupId
      )
      expect(transfer.sourceTransaction.transferRole).toBe('source')
      expect(transfer.destinationTransaction.transferRole).toBe('destination')

      expect(transfer.sourceTransaction.accountId).toBe(bankAccountId)
      expect(transfer.destinationTransaction.accountId).toBe(cashAccountId)
      expect(transfer.sourceTransaction.amountPaise).toBe(50000)
      expect(transfer.destinationTransaction.amountPaise).toBe(50000)
    })

    it('rejects transfer where source and destination accounts are identical', async () => {
      await expect(
        service.createTransfer({
          sourceAccountId: cashAccountId,
          destinationAccountId: cashAccountId,
          amountPaise: 10000,
          transactionDate: '2026-10-24',
        })
      ).rejects.toThrow(/Source and destination accounts must be different/)
    })

    it('deletes both transfer sides atomically when either side or transferGroupId is deleted', async () => {
      const transfer = await service.createTransfer({
        sourceAccountId: bankAccountId,
        destinationAccountId: cashAccountId,
        amountPaise: 25000,
        transactionDate: '2026-10-24',
      })

      const groupId = transfer.sourceTransaction.transferGroupId!
      expect(await testDb.transactions.where('transferGroupId').equals(groupId).count()).toBe(2)

      // Deleting via transaction id
      await service.deleteTransaction(transfer.sourceTransaction.id)

      // Both sides must be removed
      expect(await testDb.transactions.where('transferGroupId').equals(groupId).count()).toBe(0)
    })

    it('updates both transfer sides atomically via updateTransfer', async () => {
      const transfer = await service.createTransfer({
        sourceAccountId: bankAccountId,
        destinationAccountId: cashAccountId,
        amountPaise: 20000,
        transactionDate: '2026-10-24',
      })

      const groupId = transfer.sourceTransaction.transferGroupId!

      const updated = await service.updateTransfer(groupId, {
        amountPaise: 30000,
        description: 'Adjusted transfer',
      })

      expect(updated.sourceTransaction.amountPaise).toBe(30000)
      expect(updated.destinationTransaction.amountPaise).toBe(30000)
      expect(updated.sourceTransaction.description).toBe('Adjusted transfer')
      expect(updated.destinationTransaction.description).toBe('Adjusted transfer')
    })
  })
})
