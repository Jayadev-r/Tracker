import type { PaisaTrackDatabase } from '../db/database'
import { db as defaultDb } from '../db/database'
import type { Transaction, TransactionType, TransactionSource, TransferRole } from '../types'
import { transactionSchema } from '../db/schema'
import { generateUuid } from '../utils/ids'
import { isValidLocalDateString } from '../utils/dates'
import { isPositivePaise } from '../utils/money'
import {
  ValidationError,
  NotFoundError,
  ConflictError,
  RefundExceededError,
} from '../utils/errors'

export interface CreateTransactionInput {
  type: TransactionType
  amountPaise: number
  categoryId?: string | null
  accountId: string
  description?: string
  transactionDate: string
  source?: TransactionSource
  transferGroupId?: string | null
  transferRole?: TransferRole | null
  refundOfId?: string | null
}

export interface UpdateTransactionInput {
  amountPaise?: number
  categoryId?: string | null
  accountId?: string
  description?: string
  transactionDate?: string
}

export interface CreateRefundInput {
  amountPaise: number
  accountId: string
  categoryId?: string | null
  description?: string
  transactionDate: string
  refundOfId?: string | null
  source?: TransactionSource
}

export interface CreateTransferInput {
  sourceAccountId: string
  destinationAccountId: string
  amountPaise: number
  transactionDate: string
  description?: string
  source?: TransactionSource
}

export interface UpdateTransferInput {
  amountPaise?: number
  transactionDate?: string
  description?: string
}

export interface TransactionFilter {
  startDate?: string
  endDate?: string
  type?: TransactionType
  categoryId?: string
  accountId?: string
  transferGroupId?: string
  refundOfId?: string
  sortBy?: 'transactionDate' | 'createdAt' | 'amountPaise'
  order?: 'asc' | 'desc'
}

export class TransactionService {
  private db: PaisaTrackDatabase

  constructor(database: PaisaTrackDatabase = defaultDb) {
    this.db = database
  }

  /**
   * Creates an ordinary transaction (income or expense).
   * For transfers, use createTransfer(). For refunds, use createRefund().
   */
  async createTransaction(input: CreateTransactionInput): Promise<Transaction> {
    if (input.type === 'transfer') {
      throw new ValidationError(
        'Transfers must be created using transactionService.createTransfer() to ensure atomic movement.'
      )
    }

    if (input.type === 'refund') {
      return this.createRefund({
        amountPaise: input.amountPaise,
        accountId: input.accountId,
        categoryId: input.categoryId,
        description: input.description,
        transactionDate: input.transactionDate,
        refundOfId: input.refundOfId,
        source: input.source,
      })
    }

    // 1. Validate Account
    const account = await this.db.accounts.get(input.accountId)
    if (!account) {
      throw new NotFoundError('Account', input.accountId)
    }
    if (account.isArchived) {
      throw new ValidationError(`Cannot create transaction on archived account: "${account.name}".`)
    }

    // 2. Validate Category
    let resolvedCategoryId: string | null = null
    if (input.categoryId) {
      const category = await this.db.categories.get(input.categoryId)
      if (!category) {
        throw new NotFoundError('Category', input.categoryId)
      }
      if (category.isArchived) {
        throw new ValidationError(`Cannot assign archived category: "${category.name}".`)
      }
      if (category.type !== input.type) {
        throw new ValidationError(
          `Incompatible category type: Category "${category.name}" is an ${category.type} category, but transaction is an ${input.type}.`
        )
      }
      resolvedCategoryId = category.id
    }

    const now = new Date().toISOString()
    const candidate: Transaction = {
      id: generateUuid(),
      type: input.type,
      amountPaise: input.amountPaise,
      categoryId: resolvedCategoryId,
      accountId: input.accountId,
      description: (input.description ?? '').trim(),
      transactionDate: input.transactionDate,
      createdAt: now,
      updatedAt: now,
      source: input.source ?? 'form',
      transferGroupId: null,
      transferRole: null,
      refundOfId: null,
    }

    // Validate using Zod schema
    const validated = transactionSchema.parse(candidate)
    await this.db.transactions.add(validated)
    return validated
  }

  /**
   * Retrieves a single transaction by its unique ID. Returns null if not found.
   */
  async getTransactionById(id: string): Promise<Transaction | null> {
    const record = await this.db.transactions.get(id)
    return record ?? null
  }

  /**
   * Retrieves a single transaction by ID or throws NotFoundError.
   */
  async getTransactionOrThrow(id: string): Promise<Transaction> {
    const record = await this.getTransactionById(id)
    if (!record) {
      throw new NotFoundError('Transaction', id)
    }
    return record
  }

  /**
   * Lists transactions matching optional filters, sorted predictably.
   */
  async listTransactions(filter: TransactionFilter = {}): Promise<Transaction[]> {
    let collection = this.db.transactions.toCollection()

    // Filter by type if specified
    if (filter.type) {
      collection = this.db.transactions.where('type').equals(filter.type)
    }

    let results = await collection.toArray()

    // In-memory filtering for composite constraints
    if (filter.startDate) {
      results = results.filter((t) => t.transactionDate >= filter.startDate!)
    }
    if (filter.endDate) {
      results = results.filter((t) => t.transactionDate <= filter.endDate!)
    }
    if (filter.categoryId) {
      results = results.filter((t) => t.categoryId === filter.categoryId)
    }
    if (filter.accountId) {
      results = results.filter((t) => t.accountId === filter.accountId)
    }
    if (filter.transferGroupId) {
      results = results.filter((t) => t.transferGroupId === filter.transferGroupId)
    }
    if (filter.refundOfId) {
      results = results.filter((t) => t.refundOfId === filter.refundOfId)
    }

    // Sort results
    const sortBy = filter.sortBy ?? 'transactionDate'
    const order = filter.order ?? 'desc'

    results.sort((a, b) => {
      let comparison = 0
      if (sortBy === 'transactionDate') {
        comparison = a.transactionDate.localeCompare(b.transactionDate)
        if (comparison === 0) {
          comparison = a.createdAt.localeCompare(b.createdAt)
        }
      } else if (sortBy === 'createdAt') {
        comparison = a.createdAt.localeCompare(b.createdAt)
      } else if (sortBy === 'amountPaise') {
        comparison = a.amountPaise - b.amountPaise
      }
      return order === 'asc' ? comparison : -comparison
    })

    return results
  }

  /**
   * Updates an existing ordinary transaction or refund.
   * Transfers must be updated via updateTransfer().
   */
  async updateTransaction(id: string, updates: UpdateTransactionInput): Promise<Transaction> {
    return this.db.transaction('rw', [this.db.transactions, this.db.categories, this.db.accounts], async () => {
      const existing = await this.getTransactionOrThrow(id)

      if (existing.type === 'transfer') {
        throw new ValidationError(
          'Transfer transactions must be updated via transactionService.updateTransfer() to ensure both sides remain consistent.'
        )
      }

      // Check account update
      let targetAccountId = existing.accountId
      if (updates.accountId && updates.accountId !== existing.accountId) {
        const account = await this.db.accounts.get(updates.accountId)
        if (!account) throw new NotFoundError('Account', updates.accountId)
        if (account.isArchived) throw new ValidationError('Cannot move transaction to an archived account.')
        targetAccountId = account.id
      }

      // Check category update
      let targetCategoryId = existing.categoryId
      if (updates.categoryId !== undefined) {
        if (updates.categoryId === null) {
          targetCategoryId = null
        } else {
          const category = await this.db.categories.get(updates.categoryId)
          if (!category) throw new NotFoundError('Category', updates.categoryId)
          if (category.isArchived) throw new ValidationError('Cannot assign an archived category.')
          if (existing.type !== 'refund' && category.type !== existing.type) {
            throw new ValidationError(
              `Incompatible category type: ${category.type} category cannot be used for ${existing.type} transaction.`
            )
          }
          targetCategoryId = category.id
        }
      }

      const targetAmountPaise = updates.amountPaise !== undefined ? updates.amountPaise : existing.amountPaise
      if (!isPositivePaise(targetAmountPaise)) {
        throw new ValidationError('Updated amount must be a positive safe integer in paise.')
      }

      const targetDate = updates.transactionDate ?? existing.transactionDate
      if (!isValidLocalDateString(targetDate)) {
        throw new ValidationError(`Invalid transaction date: "${targetDate}"`)
      }

      // If updating an original expense: ensure new amount is not less than total refunds already given
      if (existing.type === 'expense') {
        const linkedRefunds = await this.db.transactions.where('refundOfId').equals(id).toArray()
        const totalRefunded = linkedRefunds.reduce((sum, r) => sum + r.amountPaise, 0)
        if (targetAmountPaise < totalRefunded) {
          throw new ConflictError(
            `Cannot reduce expense amount to ${targetAmountPaise} paise because ${totalRefunded} paise in linked refunds have already been issued.`
          )
        }
      }

      // If updating a linked refund: ensure other refunds + new amount <= original expense
      if (existing.type === 'refund' && existing.refundOfId) {
        const originalExpense = await this.db.transactions.get(existing.refundOfId)
        if (!originalExpense) {
          throw new NotFoundError('Original Expense', existing.refundOfId)
        }
        const siblingRefunds = await this.db.transactions.where('refundOfId').equals(existing.refundOfId).toArray()
        const otherRefundsTotal = siblingRefunds
          .filter((r) => r.id !== id)
          .reduce((sum, r) => sum + r.amountPaise, 0)

        const remainingRefundable = originalExpense.amountPaise - otherRefundsTotal
        if (targetAmountPaise > remainingRefundable) {
          throw new RefundExceededError(targetAmountPaise, remainingRefundable)
        }
      }

      const updatedRecord: Transaction = {
        ...existing,
        amountPaise: targetAmountPaise,
        categoryId: targetCategoryId,
        accountId: targetAccountId,
        description: updates.description !== undefined ? updates.description.trim() : existing.description,
        transactionDate: targetDate,
        createdAt: existing.createdAt, // Preserved
        updatedAt: new Date().toISOString(), // Modified
      }

      const validated = transactionSchema.parse(updatedRecord)
      await this.db.transactions.put(validated)
      return validated
    })
  }

  /**
   * Deletes a transaction by ID.
   * Hard delete is explicit; callers are responsible for obtaining user confirmation.
   * If deleting an original expense with linked refunds, throws ConflictError.
   * If deleting a transfer side, deletes both sides atomically.
   */
  async deleteTransaction(id: string): Promise<void> {
    await this.db.transaction('rw', [this.db.transactions], async () => {
      const existing = await this.getTransactionOrThrow(id)

      // Prevent deleting an expense that has linked refunds
      if (existing.type === 'expense') {
        const linkedRefundCount = await this.db.transactions.where('refundOfId').equals(id).count()
        if (linkedRefundCount > 0) {
          throw new ConflictError(
            `Cannot delete expense '${id}' because it has ${linkedRefundCount} linked refund(s). Delete or unlink the refunds first.`
          )
        }
      }

      // If this is a transfer, atomically delete both transfer sides
      if (existing.type === 'transfer' && existing.transferGroupId) {
        await this.deleteTransfer(existing.transferGroupId)
        return
      }

      await this.db.transactions.delete(id)
    })
  }

  /**
   * Creates a refund transaction with cumulative refund validation.
   */
  async createRefund(input: CreateRefundInput): Promise<Transaction> {
    if (!isPositivePaise(input.amountPaise)) {
      throw new ValidationError('Refund amount must be a positive safe integer in paise.')
    }
    if (!isValidLocalDateString(input.transactionDate)) {
      throw new ValidationError(`Invalid transaction date: "${input.transactionDate}"`)
    }

    return this.db.transaction('rw', [this.db.transactions, this.db.categories, this.db.accounts], async () => {
      // Validate Account
      const account = await this.db.accounts.get(input.accountId)
      if (!account) throw new NotFoundError('Account', input.accountId)
      if (account.isArchived) throw new ValidationError('Cannot issue refund to an archived account.')

      let resolvedCategoryId: string | null = input.categoryId ?? null

      // Validate Linked Refund against original expense
      if (input.refundOfId) {
        const originalExpense = await this.db.transactions.get(input.refundOfId)
        if (!originalExpense) {
          throw new NotFoundError('Original Expense', input.refundOfId)
        }
        if (originalExpense.type !== 'expense') {
          throw new ValidationError(
            `Cannot link refund to a transaction of type "${originalExpense.type}". Only expenses can be refunded.`
          )
        }

        // Query all existing linked refunds for this original expense
        const existingRefunds = await this.db.transactions.where('refundOfId').equals(input.refundOfId).toArray()
        const totalRefundedPaise = existingRefunds.reduce((sum, r) => sum + r.amountPaise, 0)
        const remainingRefundablePaise = originalExpense.amountPaise - totalRefundedPaise

        if (input.amountPaise > remainingRefundablePaise) {
          throw new RefundExceededError(input.amountPaise, remainingRefundablePaise)
        }

        // Default to original expense's category if none provided
        if (!resolvedCategoryId) {
          resolvedCategoryId = originalExpense.categoryId
        }
      }

      if (resolvedCategoryId) {
        const cat = await this.db.categories.get(resolvedCategoryId)
        if (!cat) throw new NotFoundError('Category', resolvedCategoryId)
        if (cat.isArchived) throw new ValidationError('Cannot assign an archived category.')
      }

      const now = new Date().toISOString()
      const refundRecord: Transaction = {
        id: generateUuid(),
        type: 'refund',
        amountPaise: input.amountPaise,
        categoryId: resolvedCategoryId,
        accountId: input.accountId,
        description: (input.description ?? '').trim(),
        transactionDate: input.transactionDate,
        createdAt: now,
        updatedAt: now,
        source: input.source ?? 'form',
        transferGroupId: null,
        transferRole: null,
        refundOfId: input.refundOfId ?? null,
      }

      const validated = transactionSchema.parse(refundRecord)
      await this.db.transactions.add(validated)
      return validated
    })
  }

  /**
   * Creates an atomic transfer between two distinct accounts.
   * Produces two linked transactions: source (outflow/debit) and destination (inflow/credit).
   * Transfers are excluded from income and expense summaries.
   */
  async createTransfer(
    input: CreateTransferInput
  ): Promise<{ sourceTransaction: Transaction; destinationTransaction: Transaction }> {
    if (input.sourceAccountId === input.destinationAccountId) {
      throw new ValidationError('Source and destination accounts must be different.')
    }
    if (!isPositivePaise(input.amountPaise)) {
      throw new ValidationError('Transfer amount must be a positive safe integer in paise.')
    }
    if (!isValidLocalDateString(input.transactionDate)) {
      throw new ValidationError(`Invalid transaction date: "${input.transactionDate}"`)
    }

    return this.db.transaction('rw', [this.db.transactions, this.db.accounts], async () => {
      const sourceAccount = await this.db.accounts.get(input.sourceAccountId)
      if (!sourceAccount) throw new NotFoundError('Source Account', input.sourceAccountId)
      if (sourceAccount.isArchived) throw new ValidationError('Source account is archived.')

      const destAccount = await this.db.accounts.get(input.destinationAccountId)
      if (!destAccount) throw new NotFoundError('Destination Account', input.destinationAccountId)
      if (destAccount.isArchived) throw new ValidationError('Destination account is archived.')

      const transferGroupId = generateUuid()
      const now = new Date().toISOString()
      const baseDesc = input.description ? input.description.trim() : null

      const sourceTx: Transaction = {
        id: generateUuid(),
        type: 'transfer',
        amountPaise: input.amountPaise,
        categoryId: null, // Transfers never have expense or income categories
        accountId: sourceAccount.id,
        description: baseDesc ?? `Transfer to ${destAccount.name}`,
        transactionDate: input.transactionDate,
        createdAt: now,
        updatedAt: now,
        source: input.source ?? 'form',
        transferGroupId,
        transferRole: 'source',
        refundOfId: null,
      }

      const destTx: Transaction = {
        id: generateUuid(),
        type: 'transfer',
        amountPaise: input.amountPaise,
        categoryId: null,
        accountId: destAccount.id,
        description: baseDesc ?? `Transfer from ${sourceAccount.name}`,
        transactionDate: input.transactionDate,
        createdAt: now,
        updatedAt: now,
        source: input.source ?? 'form',
        transferGroupId,
        transferRole: 'destination',
        refundOfId: null,
      }

      const validatedSource = transactionSchema.parse(sourceTx)
      const validatedDest = transactionSchema.parse(destTx)

      // Atomically add both sides
      await this.db.transactions.bulkAdd([validatedSource, validatedDest])
      return {
        sourceTransaction: validatedSource,
        destinationTransaction: validatedDest,
      }
    })
  }

  /**
   * Updates both sides of an existing transfer atomically.
   */
  async updateTransfer(
    transferGroupId: string,
    updates: UpdateTransferInput
  ): Promise<{ sourceTransaction: Transaction; destinationTransaction: Transaction }> {
    return this.db.transaction('rw', [this.db.transactions], async () => {
      const sides = await this.db.transactions.where('transferGroupId').equals(transferGroupId).toArray()
      if (sides.length !== 2) {
        throw new ValidationError(`Transfer group '${transferGroupId}' is malformed or not found (found ${sides.length} sides).`)
      }

      const sourceTx = sides.find((t) => t.transferRole === 'source')
      const destTx = sides.find((t) => t.transferRole === 'destination')

      if (!sourceTx || !destTx) {
        throw new ValidationError(`Transfer group '${transferGroupId}' lacks proper source or destination sides.`)
      }

      const targetAmountPaise = updates.amountPaise !== undefined ? updates.amountPaise : sourceTx.amountPaise
      if (!isPositivePaise(targetAmountPaise)) {
        throw new ValidationError('Transfer amount must be a positive safe integer in paise.')
      }

      const targetDate = updates.transactionDate ?? sourceTx.transactionDate
      if (!isValidLocalDateString(targetDate)) {
        throw new ValidationError(`Invalid transaction date: "${targetDate}"`)
      }

      const now = new Date().toISOString()
      const updatedSource: Transaction = {
        ...sourceTx,
        amountPaise: targetAmountPaise,
        transactionDate: targetDate,
        description: updates.description !== undefined ? updates.description.trim() : sourceTx.description,
        updatedAt: now,
      }

      const updatedDest: Transaction = {
        ...destTx,
        amountPaise: targetAmountPaise,
        transactionDate: targetDate,
        description: updates.description !== undefined ? updates.description.trim() : destTx.description,
        updatedAt: now,
      }

      const validatedSource = transactionSchema.parse(updatedSource)
      const validatedDest = transactionSchema.parse(updatedDest)

      await this.db.transactions.bulkPut([validatedSource, validatedDest])
      return {
        sourceTransaction: validatedSource,
        destinationTransaction: validatedDest,
      }
    })
  }

  /**
   * Deletes both sides of an atomic transfer together.
   * Guarantees no partial transfer remains in the database.
   */
  async deleteTransfer(transferGroupId: string): Promise<void> {
    await this.db.transaction('rw', [this.db.transactions], async () => {
      const records = await this.db.transactions.where('transferGroupId').equals(transferGroupId).toArray()
      if (records.length === 0) {
        return
      }
      const ids = records.map((r) => r.id)
      await this.db.transactions.bulkDelete(ids)
    })
  }
}

export const transactionService = new TransactionService()
