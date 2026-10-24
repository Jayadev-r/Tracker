export type TransactionType = 'income' | 'expense' | 'refund' | 'transfer'
export type TransactionSource = 'chat' | 'form' | 'import'
export type AccountType = 'cash' | 'bank' | 'credit_card' | 'other'
export type CategoryType = 'income' | 'expense'
export type BudgetPeriod = 'weekly' | 'monthly'
export type ThemePreference = 'system' | 'light' | 'dark'
export type WeekStartDay = 0 | 1 // 0 = Sunday, 1 = Monday

export interface Transaction {
  id: string // UUID
  type: TransactionType
  amountPaise: number // Positive safe integer, e.g. 15000 for ₹150.00
  categoryId: string | null
  accountId: string | null
  description: string
  transactionDate: string // YYYY-MM-DD in device-local calendar semantics
  createdAt: string // ISO 8601 timestamp
  updatedAt: string // ISO 8601 timestamp
  source: TransactionSource
  transferGroupId: string | null
  refundOfId: string | null
  deletedAt?: string | null
}

export interface Category {
  id: string // UUID
  name: string
  type: CategoryType
  icon: string
  color: string
  aliases: string[]
  isArchived: boolean
  createdAt: string
  updatedAt: string
}

export interface Account {
  id: string // UUID
  name: string
  type: AccountType
  openingBalancePaise: number // Safe integer
  openingBalanceDate: string // YYYY-MM-DD
  isArchived: boolean
  createdAt: string
  updatedAt: string
}

export interface Budget {
  id: string // UUID
  categoryId: string
  period: BudgetPeriod
  periodStart: string // YYYY-MM-DD
  limitPaise: number // Positive safe integer
  createdAt: string
  updatedAt: string
}

export interface AppSettings {
  id: 'app-settings'
  currency: 'INR'
  locale: 'en-IN'
  theme: ThemePreference
  weekStartsOn: WeekStartDay
  defaultAccountId: string | null
  schemaVersion: number
  backupReminderEnabled: boolean
  lastBackupAt: string | null
  createdAt: string
  updatedAt: string
}
