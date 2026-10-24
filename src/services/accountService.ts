import type { PaisaTrackDatabase } from '../db/database'
import { db as defaultDb } from '../db/database'
import type { Account, AccountType } from '../types'
import { accountSchema } from '../db/schema'
import { generateUuid } from '../utils/ids'
import { getLocalTodayDateString, isValidLocalDateString } from '../utils/dates'
import { ValidationError, NotFoundError } from '../utils/errors'

export interface CreateAccountInput {
  name: string
  type: AccountType
  openingBalancePaise?: number
  openingBalanceDate?: string
}

export interface UpdateAccountInput {
  name?: string
  type?: AccountType
  openingBalancePaise?: number
  openingBalanceDate?: string
}

export class AccountService {
  private readonly db: PaisaTrackDatabase

  constructor(database: PaisaTrackDatabase = defaultDb) {
    this.db = database
  }

  /**
   * Lists all accounts, optionally including archived accounts.
   */
  async listAccounts(options?: { includeArchived?: boolean }): Promise<Account[]> {
    const all = await this.db.accounts.toArray()

    let filtered = all
    if (!options?.includeArchived) {
      filtered = filtered.filter((a) => !a.isArchived)
    }

    return filtered.sort((a, b) => a.name.localeCompare(b.name))
  }

  /**
   * Retrieves an account by ID.
   */
  async getAccountById(id: string): Promise<Account | undefined> {
    return this.db.accounts.get(id)
  }

  /**
   * Creates a new account with validation.
   */
  async createAccount(input: CreateAccountInput): Promise<Account> {
    const trimmedName = input.name.trim()
    if (!trimmedName) {
      throw new ValidationError('Account name cannot be empty.')
    }
    if (trimmedName.length > 50) {
      throw new ValidationError('Account name must not exceed 50 characters.')
    }

    // Check duplicate active name
    const existing = await this.db.accounts
      .filter((a) => !a.isArchived && a.name.toLowerCase() === trimmedName.toLowerCase())
      .first()

    if (existing) {
      throw new ValidationError(`An active account named "${trimmedName}" already exists.`)
    }

    const openingBalance = input.openingBalancePaise ?? 0
    if (!Number.isSafeInteger(openingBalance)) {
      throw new ValidationError('Opening balance must be a safe integer in paise.')
    }

    const openingDate = input.openingBalanceDate ?? getLocalTodayDateString()
    if (!isValidLocalDateString(openingDate)) {
      throw new ValidationError(`Invalid opening balance date "${openingDate}". Must be YYYY-MM-DD.`)
    }

    const now = new Date().toISOString()
    const account: Account = {
      id: generateUuid(),
      name: trimmedName,
      type: input.type,
      openingBalancePaise: openingBalance,
      openingBalanceDate: openingDate,
      isArchived: false,
      createdAt: now,
      updatedAt: now,
    }

    const validated = accountSchema.parse(account)
    await this.db.accounts.add(validated)
    return validated
  }

  /**
   * Updates an existing account.
   */
  async updateAccount(id: string, updates: UpdateAccountInput): Promise<Account> {
    const account = await this.getAccountById(id)
    if (!account) {
      throw new NotFoundError('Account', id)
    }

    let updatedName = account.name
    if (updates.name !== undefined) {
      const trimmed = updates.name.trim()
      if (!trimmed) {
        throw new ValidationError('Account name cannot be empty.')
      }
      if (trimmed.length > 50) {
        throw new ValidationError('Account name must not exceed 50 characters.')
      }

      if (trimmed.toLowerCase() !== account.name.toLowerCase()) {
        const existing = await this.db.accounts
          .filter(
            (a) =>
              a.id !== id &&
              !a.isArchived &&
              a.name.toLowerCase() === trimmed.toLowerCase()
          )
          .first()
        if (existing) {
          throw new ValidationError(
            `Another account named "${trimmed}" already exists.`
          )
        }
      }
      updatedName = trimmed
    }

    let updatedBalance = account.openingBalancePaise
    if (updates.openingBalancePaise !== undefined) {
      if (!Number.isSafeInteger(updates.openingBalancePaise)) {
        throw new ValidationError('Opening balance must be a safe integer in paise.')
      }
      updatedBalance = updates.openingBalancePaise
    }

    let updatedDate = account.openingBalanceDate
    if (updates.openingBalanceDate !== undefined) {
      if (!isValidLocalDateString(updates.openingBalanceDate)) {
        throw new ValidationError('Invalid opening balance date format. Must be YYYY-MM-DD.')
      }
      updatedDate = updates.openingBalanceDate
    }

    const now = new Date().toISOString()
    const updatedAccount: Account = {
      ...account,
      name: updatedName,
      type: updates.type ?? account.type,
      openingBalancePaise: updatedBalance,
      openingBalanceDate: updatedDate,
      updatedAt: now,
    }

    const validated = accountSchema.parse(updatedAccount)
    await this.db.accounts.put(validated)
    return validated
  }

  /**
   * Archives an account.
   */
  async archiveAccount(id: string): Promise<Account> {
    const account = await this.getAccountById(id)
    if (!account) {
      throw new NotFoundError('Account', id)
    }

    if (account.isArchived) {
      return account
    }

    // Check if this is the default account
    const settings = await this.db.settings.get('app-settings')
    if (settings && settings.defaultAccountId === id) {
      throw new ValidationError(
        'Cannot archive the default account. Please set a different default account in Settings first.'
      )
    }

    // Ensure at least one active account remains
    const activeCount = await this.db.accounts.filter((a) => !a.isArchived).count()
    if (activeCount <= 1) {
      throw new ValidationError('Cannot archive the only active account.')
    }

    const now = new Date().toISOString()
    const updated: Account = {
      ...account,
      isArchived: true,
      updatedAt: now,
    }

    await this.db.accounts.put(updated)
    return updated
  }

  /**
   * Restores an archived account.
   */
  async restoreAccount(id: string): Promise<Account> {
    const account = await this.getAccountById(id)
    if (!account) {
      throw new NotFoundError('Account', id)
    }

    if (!account.isArchived) {
      return account
    }

    // Check if an active account with the same name exists
    const conflicting = await this.db.accounts
      .filter((a) => !a.isArchived && a.name.toLowerCase() === account.name.toLowerCase())
      .first()

    if (conflicting) {
      throw new ValidationError(
        `Cannot restore account: an active account named "${account.name}" already exists.`
      )
    }

    const now = new Date().toISOString()
    const updated: Account = {
      ...account,
      isArchived: false,
      updatedAt: now,
    }

    await this.db.accounts.put(updated)
    return updated
  }

  /**
   * Deletes an account only if no transactions reference it.
   */
  async deleteAccount(id: string): Promise<void> {
    const account = await this.getAccountById(id)
    if (!account) {
      throw new NotFoundError('Account', id)
    }

    const txCount = await this.db.transactions.where('accountId').equals(id).count()
    if (txCount > 0) {
      throw new ValidationError(
        `Cannot delete account "${account.name}": it is referenced by ${txCount} historical transaction(s). Archive it instead.`
      )
    }

    const settings = await this.db.settings.get('app-settings')
    if (settings && settings.defaultAccountId === id) {
      throw new ValidationError('Cannot delete the default account. Change default account first.')
    }

    const totalCount = await this.db.accounts.count()
    if (totalCount <= 1) {
      throw new ValidationError('Cannot delete the only account.')
    }

    await this.db.accounts.delete(id)
  }
}

export const accountService = new AccountService()
