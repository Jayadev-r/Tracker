import type { PaisaTrackDatabase } from './database'
import type { Category, Account, AppSettings } from '../types'
import { generateUuid } from '../utils/ids'
import { getLocalTodayDateString } from '../utils/dates'
import { categorySchema, accountSchema, settingsSchema } from './schema'

interface CategorySeedDef {
  name: string
  type: 'income' | 'expense'
  icon: string
  color: string
  aliases: string[]
}

export const DEFAULT_CATEGORY_DEFS: readonly CategorySeedDef[] = [
  // Expense Categories
  { name: 'Food', type: 'expense', icon: 'Utensils', color: '#f97316', aliases: ['food', 'meal', 'lunch', 'dinner', 'snack'] },
  { name: 'Groceries', type: 'expense', icon: 'ShoppingBag', color: '#10b981', aliases: ['grocery', 'groceries', 'supermarket', 'provisions'] },
  { name: 'Rent', type: 'expense', icon: 'Home', color: '#6366f1', aliases: ['rent', 'house rent'] },
  { name: 'Fuel', type: 'expense', icon: 'Fuel', color: '#eab308', aliases: ['fuel', 'petrol', 'diesel'] },
  { name: 'Transport', type: 'expense', icon: 'Car', color: '#06b6d4', aliases: ['transport', 'bus', 'taxi', 'auto', 'metro', 'cab', 'uber', 'ola'] },
  { name: 'Shopping', type: 'expense', icon: 'Tag', color: '#ec4899', aliases: ['shopping', 'clothes', 'electronics'] },
  { name: 'Bills & Utilities', type: 'expense', icon: 'Zap', color: '#f59e0b', aliases: ['bills', 'electricity', 'water', 'internet', 'wifi', 'utility'] },
  { name: 'Phone & EMI', type: 'expense', icon: 'Smartphone', color: '#8b5cf6', aliases: ['phone emi', 'mobile emi', 'emi', 'mobile recharge', 'phone bill'] },
  { name: 'Health', type: 'expense', icon: 'HeartPulse', color: '#ef4444', aliases: ['health', 'doctor', 'medicine', 'pharmacy', 'hospital'] },
  { name: 'Fitness', type: 'expense', icon: 'Dumbbell', color: '#14b8a6', aliases: ['fitness', 'gym', 'workout'] },
  { name: 'Entertainment', type: 'expense', icon: 'Film', color: '#a855f7', aliases: ['entertainment', 'movies', 'cinema', 'ott', 'netflix'] },
  { name: 'Travel', type: 'expense', icon: 'Plane', color: '#3b82f6', aliases: ['travel', 'trip', 'flight', 'hotel'] },
  { name: 'Education', type: 'expense', icon: 'GraduationCap', color: '#3b82f6', aliases: ['education', 'course', 'books', 'tuition'] },
  { name: 'Personal Care', type: 'expense', icon: 'Sparkles', color: '#d946ef', aliases: ['salon', 'grooming', 'haircut', 'personal care'] },
  { name: 'Gifts', type: 'expense', icon: 'Gift', color: '#f43f5e', aliases: ['gift', 'present', 'donation'] },
  { name: 'Miscellaneous', type: 'expense', icon: 'MoreHorizontal', color: '#64748b', aliases: ['miscellaneous', 'misc', 'other expense'] },

  // Income Categories
  { name: 'Salary', type: 'income', icon: 'Briefcase', color: '#10b981', aliases: ['salary', 'payroll', 'wages'] },
  { name: 'Freelance', type: 'income', icon: 'Laptop', color: '#3b82f6', aliases: ['freelance', 'side income', 'consulting'] },
  { name: 'Business', type: 'income', icon: 'TrendingUp', color: '#06b6d4', aliases: ['business', 'sales'] },
  { name: 'Interest', type: 'income', icon: 'Percent', color: '#8b5cf6', aliases: ['interest', 'dividend', 'fd return'] },
  { name: 'Gift Received', type: 'income', icon: 'Gift', color: '#ec4899', aliases: ['gift received'] },
  { name: 'Other Income', type: 'income', icon: 'Wallet', color: '#64748b', aliases: ['other income', 'cashback', 'bonus'] },
]

/**
 * Seeds default categories, account, and application settings exactly once.
 * Idempotency is guaranteed by inspecting the 'app-settings' record.
 * If settings already exist, this function immediately returns false without modifying existing records.
 */
export async function seedInitialData(database: PaisaTrackDatabase): Promise<boolean> {
  const existingSettings = await database.settings.get('app-settings')
  if (existingSettings) {
    // Database has already been initialized and seeded. Never overwrite or re-seed.
    return false
  }

  const now = new Date().toISOString()
  const today = getLocalTodayDateString()

  // 1. Prepare default categories
  const categoriesToSeed: Category[] = DEFAULT_CATEGORY_DEFS.map((def) => {
    const category: Category = {
      id: generateUuid(),
      name: def.name,
      type: def.type,
      icon: def.icon,
      color: def.color,
      aliases: [...def.aliases],
      isArchived: false,
      createdAt: now,
      updatedAt: now,
    }
    // Runtime validation
    return categorySchema.parse(category)
  })

  // 2. Prepare default primary account
  const defaultAccountId = generateUuid()
  const defaultAccount: Account = accountSchema.parse({
    id: defaultAccountId,
    name: 'Cash',
    type: 'cash',
    openingBalancePaise: 0,
    openingBalanceDate: today,
    isArchived: false,
    createdAt: now,
    updatedAt: now,
  })

  // 3. Prepare initial application settings
  const defaultSettings: AppSettings = settingsSchema.parse({
    id: 'app-settings',
    currency: 'INR',
    locale: 'en-IN',
    theme: 'system',
    weekStartsOn: 1, // Monday
    defaultAccountId,
    schemaVersion: 1,
    backupReminderEnabled: false,
    lastBackupAt: null,
    createdAt: now,
    updatedAt: now,
  })

  // Execute atomically in a single database transaction
  await database.transaction('rw', [database.categories, database.accounts, database.settings], async () => {
    await database.categories.bulkAdd(categoriesToSeed)
    await database.accounts.add(defaultAccount)
    await database.settings.add(defaultSettings)
  })

  return true
}
