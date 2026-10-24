import type { PaisaTrackDatabase } from '../db/database'
import { db as defaultDb } from '../db/database'
import type {
  Transaction,
  Category,
  Account,
  Budget,
  AppSettings,
} from '../types'
import {
  settingsSchema,
  categorySchema,
  accountSchema,
  transactionSchema,
  budgetSchema,
  isValidIsoTimestamp,
} from '../db/schema'
import { seedInitialData } from '../db/seed'

export interface PaisaTrackBackupData {
  format: 'PaisaTrackBackup'
  version: 1
  exportedAt: string
  schemaVersion: number
  settings: AppSettings
  categories: Category[]
  accounts: Account[]
  transactions: Transaction[]
  budgets: Budget[]
}

export interface BackupValidationResult {
  isValid: boolean
  errors: string[]
  data?: PaisaTrackBackupData
  summary?: {
    categoriesCount: number
    accountsCount: number
    transactionsCount: number
    budgetsCount: number
    exportedAt: string
  }
}

export interface RestoreResult {
  categoriesCount: number
  accountsCount: number
  transactionsCount: number
  budgetsCount: number
}

export class BackupService {
  private readonly db: PaisaTrackDatabase

  constructor(database: PaisaTrackDatabase = defaultDb) {
    this.db = database
  }

  /**
   * Generates a complete versioned JSON backup of all persistent tables.
   */
  async exportJsonBackup(): Promise<string> {
    const [settingsRecord, categories, accounts, transactions, budgets] =
      await Promise.all([
        this.db.settings.get('app-settings'),
        this.db.categories.toArray(),
        this.db.accounts.toArray(),
        this.db.transactions.toArray(),
        this.db.budgets.toArray(),
      ])

    const now = new Date().toISOString()

    const settings: AppSettings = settingsRecord ?? {
      id: 'app-settings',
      currency: 'INR',
      locale: 'en-IN',
      theme: 'system',
      weekStartsOn: 1,
      defaultAccountId: accounts[0]?.id ?? null,
      schemaVersion: 2,
      backupReminderEnabled: false,
      lastBackupAt: now,
      createdAt: now,
      updatedAt: now,
    }

    // Update lastBackupAt in persistent settings
    await this.db.settings.put({
      ...settings,
      lastBackupAt: now,
      updatedAt: now,
    })

    const backupData: PaisaTrackBackupData = {
      format: 'PaisaTrackBackup',
      version: 1,
      exportedAt: now,
      schemaVersion: 2,
      settings: {
        ...settings,
        lastBackupAt: now,
      },
      categories,
      accounts,
      transactions,
      budgets,
    }

    return JSON.stringify(backupData, null, 2)
  }

  /**
   * Generates a CSV export of transactions for spreadsheet analysis.
   */
  async exportCsvTransactions(): Promise<string> {
    const [transactions, categories, accounts] = await Promise.all([
      this.db.transactions.toArray(),
      this.db.categories.toArray(),
      this.db.accounts.toArray(),
    ])

    const catMap = new Map(categories.map((c) => [c.id, c.name]))
    const accMap = new Map(accounts.map((a) => [a.id, a.name]))

    const headers = [
      'Transaction ID',
      'Date',
      'Type',
      'Amount (INR)',
      'Category',
      'Account',
      'Description',
      'Source',
      'Transfer Group ID',
      'Transfer Role',
      'Refund Of ID',
      'Created At',
    ]

    const escapeCsv = (str: string | null | undefined): string => {
      if (str === null || str === undefined) return ''
      const s = String(str)
      if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
        return `"${s.replace(/"/g, '""')}"`
      }
      return s
    }

    const rows = transactions.map((t) => [
      escapeCsv(t.id),
      escapeCsv(t.transactionDate),
      escapeCsv(t.type),
      escapeCsv((t.amountPaise / 100).toFixed(2)),
      escapeCsv(t.categoryId ? catMap.get(t.categoryId) ?? 'Unknown' : ''),
      escapeCsv(t.accountId ? accMap.get(t.accountId) ?? 'Unknown' : ''),
      escapeCsv(t.description),
      escapeCsv(t.source),
      escapeCsv(t.transferGroupId),
      escapeCsv(t.transferRole),
      escapeCsv(t.refundOfId),
      escapeCsv(t.createdAt),
    ])

    return [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n')
  }

  /**
   * Validates a JSON backup file before any database writes take place.
   */
  validateBackup(rawJsonOrParsed: unknown): BackupValidationResult {
    const errors: string[] = []

    let parsed: unknown = rawJsonOrParsed
    if (typeof rawJsonOrParsed === 'string') {
      try {
        parsed = JSON.parse(rawJsonOrParsed)
      } catch (err) {
        return {
          isValid: false,
          errors: [`Malformed JSON: ${(err as Error).message}`],
        }
      }
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {
        isValid: false,
        errors: ['Invalid backup: Expected a JSON object at the root level.'],
      }
    }

    const data = parsed as Record<string, unknown>

    // 1. Format and version validation
    if (data.format !== 'PaisaTrackBackup') {
      errors.push(
        `Unsupported backup format "${String(data.format)}". Expected "PaisaTrackBackup".`
      )
    }

    if (data.version !== 1) {
      errors.push(
        `Unsupported backup version "${String(data.version)}". Only version 1 is supported.`
      )
    }

    if (!data.exportedAt || !isValidIsoTimestamp(String(data.exportedAt))) {
      errors.push('Missing or invalid "exportedAt" ISO timestamp.')
    }

    // 2. Validate Settings
    if (!data.settings || typeof data.settings !== 'object') {
      errors.push('Missing "settings" object in backup.')
    } else {
      const sResult = settingsSchema.safeParse(data.settings)
      if (!sResult.success) {
        errors.push(`Settings validation failed: ${sResult.error.issues.map((i) => i.message).join('; ')}`)
      }
    }

    // 3. Validate Categories
    if (!Array.isArray(data.categories)) {
      errors.push('Missing or non-array "categories" field.')
    } else {
      const catIds = new Set<string>()
      data.categories.forEach((c, idx) => {
        const cResult = categorySchema.safeParse(c)
        if (!cResult.success) {
          errors.push(`Category [${idx}] invalid: ${cResult.error.issues.map((i) => i.message).join('; ')}`)
        } else {
          if (catIds.has(cResult.data.id)) {
            errors.push(`Duplicate category ID found: "${cResult.data.id}".`)
          }
          catIds.add(cResult.data.id)
        }
      })
    }

    // 4. Validate Accounts
    if (!Array.isArray(data.accounts)) {
      errors.push('Missing or non-array "accounts" field.')
    } else {
      const accIds = new Set<string>()
      data.accounts.forEach((a, idx) => {
        const aResult = accountSchema.safeParse(a)
        if (!aResult.success) {
          errors.push(`Account [${idx}] invalid: ${aResult.error.issues.map((i) => i.message).join('; ')}`)
        } else {
          if (accIds.has(aResult.data.id)) {
            errors.push(`Duplicate account ID found: "${aResult.data.id}".`)
          }
          accIds.add(aResult.data.id)
        }
      })
    }

    // 5. Validate Budgets
    if (!Array.isArray(data.budgets)) {
      errors.push('Missing or non-array "budgets" field.')
    } else {
      const bIds = new Set<string>()
      data.budgets.forEach((b, idx) => {
        const bResult = budgetSchema.safeParse(b)
        if (!bResult.success) {
          errors.push(`Budget [${idx}] invalid: ${bResult.error.issues.map((i) => i.message).join('; ')}`)
        } else {
          if (bIds.has(bResult.data.id)) {
            errors.push(`Duplicate budget ID found: "${bResult.data.id}".`)
          }
          bIds.add(bResult.data.id)
        }
      })
    }

    // 6. Validate Transactions
    if (!Array.isArray(data.transactions)) {
      errors.push('Missing or non-array "transactions" field.')
    } else {
      const txIds = new Set<string>()
      data.transactions.forEach((t, idx) => {
        const tResult = transactionSchema.safeParse(t)
        if (!tResult.success) {
          errors.push(`Transaction [${idx}] invalid: ${tResult.error.issues.map((i) => i.message).join('; ')}`)
        } else {
          if (txIds.has(tResult.data.id)) {
            errors.push(`Duplicate transaction ID found: "${tResult.data.id}".`)
          }
          txIds.add(tResult.data.id)
        }
      })
    }

    // If schema validation failed, return early with errors
    if (errors.length > 0) {
      return { isValid: false, errors }
    }

    // 7. Referential and Relational Integrity Checks
    const typedBackup = data as unknown as PaisaTrackBackupData
    const validCatIds = new Set(typedBackup.categories.map((c) => c.id))
    const validAccIds = new Set(typedBackup.accounts.map((a) => a.id))
    const txMap = new Map(typedBackup.transactions.map((t) => [t.id, t]))

    // Check transactions foreign references
    for (const tx of typedBackup.transactions) {
      if (tx.categoryId && !validCatIds.has(tx.categoryId)) {
        errors.push(`Transaction "${tx.id}" references non-existent category "${tx.categoryId}".`)
      }
      if (tx.accountId && !validAccIds.has(tx.accountId)) {
        errors.push(`Transaction "${tx.id}" references non-existent account "${tx.accountId}".`)
      }
      if (tx.refundOfId) {
        const original = txMap.get(tx.refundOfId)
        if (!original) {
          errors.push(`Refund transaction "${tx.id}" references non-existent original expense "${tx.refundOfId}".`)
        } else if (original.type !== 'expense') {
          errors.push(`Refund transaction "${tx.id}" references transaction "${tx.refundOfId}" which is not an expense.`)
        }
      }
    }

    // Check budget foreign references
    for (const b of typedBackup.budgets) {
      if (!validCatIds.has(b.categoryId)) {
        errors.push(`Budget "${b.id}" references non-existent category "${b.categoryId}".`)
      }
    }

    // Check transfer pair integrity
    const transferGroups = new Map<string, Transaction[]>()
    for (const tx of typedBackup.transactions) {
      if (tx.transferGroupId) {
        const existing = transferGroups.get(tx.transferGroupId) ?? []
        existing.push(tx)
        transferGroups.set(tx.transferGroupId, existing)
      }
    }

    for (const [groupId, txs] of transferGroups.entries()) {
      if (txs.length !== 2) {
        errors.push(`Transfer group "${groupId}" has ${txs.length} transactions; expected exactly 2.`)
        continue
      }
      const t1 = txs[0]
      const t2 = txs[1]
      if (!t1 || !t2) continue

      if (t1.amountPaise !== t2.amountPaise) {
        errors.push(`Transfer group "${groupId}" has mismatched amounts (${t1.amountPaise} vs ${t2.amountPaise}).`)
      }
      if (t1.accountId === t2.accountId) {
        errors.push(`Transfer group "${groupId}" source and destination accounts must differ.`)
      }
      if (t1.transferRole && t2.transferRole && t1.transferRole === t2.transferRole) {
        errors.push(`Transfer group "${groupId}" transactions have identical roles (${t1.transferRole}).`)
      }
    }

    if (errors.length > 0) {
      return { isValid: false, errors }
    }

    return {
      isValid: true,
      errors: [],
      data: typedBackup,
      summary: {
        categoriesCount: typedBackup.categories.length,
        accountsCount: typedBackup.accounts.length,
        transactionsCount: typedBackup.transactions.length,
        budgetsCount: typedBackup.budgets.length,
        exportedAt: typedBackup.exportedAt,
      },
    }
  }

  /**
   * Restores data atomically inside a Dexie transaction.
   * If any step fails, the entire database transaction rolls back, preserving original data.
   */
  async restoreBackup(
    backupData: PaisaTrackBackupData,
    mode: 'replace' | 'merge' = 'replace'
  ): Promise<RestoreResult> {
    if (mode === 'replace') {
      await this.db.transaction(
        'rw',
        [
          this.db.settings,
          this.db.categories,
          this.db.accounts,
          this.db.budgets,
          this.db.transactions,
        ],
        async () => {
          await this.db.settings.clear()
          await this.db.categories.clear()
          await this.db.accounts.clear()
          await this.db.budgets.clear()
          await this.db.transactions.clear()

          await this.db.settings.put(backupData.settings)
          await this.db.categories.bulkAdd(backupData.categories)
          await this.db.accounts.bulkAdd(backupData.accounts)
          await this.db.budgets.bulkAdd(backupData.budgets)
          await this.db.transactions.bulkAdd(backupData.transactions)
        }
      )

      return {
        categoriesCount: backupData.categories.length,
        accountsCount: backupData.accounts.length,
        transactionsCount: backupData.transactions.length,
        budgetsCount: backupData.budgets.length,
      }
    } else {
      // Merge mode: deduplicate by stable ID without overwriting conflicting data
      await this.db.transaction(
        'rw',
        [
          this.db.settings,
          this.db.categories,
          this.db.accounts,
          this.db.budgets,
          this.db.transactions,
        ],
        async () => {
          for (const cat of backupData.categories) {
            const existing = await this.db.categories.get(cat.id)
            if (!existing) {
              await this.db.categories.add(cat)
            }
          }

          for (const acc of backupData.accounts) {
            const existing = await this.db.accounts.get(acc.id)
            if (!existing) {
              await this.db.accounts.add(acc)
            }
          }

          for (const bud of backupData.budgets) {
            const existing = await this.db.budgets.get(bud.id)
            if (!existing) {
              await this.db.budgets.add(bud)
            }
          }

          for (const tx of backupData.transactions) {
            const existing = await this.db.transactions.get(tx.id)
            if (!existing) {
              await this.db.transactions.add(tx)
            }
          }
        }
      )

      return {
        categoriesCount: backupData.categories.length,
        accountsCount: backupData.accounts.length,
        transactionsCount: backupData.transactions.length,
        budgetsCount: backupData.budgets.length,
      }
    }
  }

  /**
   * Clears all application data and resets to initial seeded state with confirmation.
   */
  async clearAllData(): Promise<void> {
    await this.db.transaction(
      'rw',
      [
        this.db.settings,
        this.db.categories,
        this.db.accounts,
        this.db.budgets,
        this.db.transactions,
      ],
      async () => {
        await this.db.settings.clear()
        await this.db.categories.clear()
        await this.db.accounts.clear()
        await this.db.budgets.clear()
        await this.db.transactions.clear()

        // Re-seed initial defaults
        await seedInitialData(this.db)
      }
    )
  }

  /**
   * Helper to trigger a local file download in mobile Safari and desktop browsers.
   */
  triggerFileDownload(
    content: string,
    filename: string,
    mimeType = 'application/json'
  ): boolean {
    try {
      const blob = new Blob([content], { type: `${mimeType};charset=utf-8` })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      link.setAttribute('aria-hidden', 'true')
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      return true
    } catch (err) {
      console.error('File download failed', err)
      return false
    }
  }
}

export const backupService = new BackupService()
