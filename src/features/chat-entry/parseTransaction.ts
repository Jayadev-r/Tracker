import type { Category, Account, TransactionType, TransactionSource } from '../../types'
import { parseRupeesToPaise } from '../../utils/money'
import {
  getLocalTodayDateString,
  getLocalYesterdayDateString,
  isValidLocalDateString,
} from '../../utils/dates'
import { ValidationError } from '../../utils/errors'

export interface ParseContext {
  categories: readonly Category[]
  accounts: readonly Account[]
  defaultAccountId?: string | null
  referenceDate?: Date
  defaultDate?: string
}

export interface TransactionDraft {
  type: TransactionType
  amountPaise: number
  categoryId: string | null
  accountId: string | null
  description: string
  transactionDate: string
  source: TransactionSource
  transferToAccountId?: string | null
  refundOfId?: string | null
  originalText: string
}

export type ParseResult =
  | {
      status: 'success'
      draft: TransactionDraft
      notes: string[]
    }
  | {
      status: 'needs_clarification'
      draft: Partial<TransactionDraft> & { originalText: string }
      questions: string[]
    }
  | {
      status: 'invalid'
      message: string
    }

/**
 * Deterministic local parser for chat-based transaction entries.
 * Pure function: No IndexedDB, no network calls, no LLMs, zero side-effects.
 */
export function parseTransaction(text: string, context: ParseContext): ParseResult {
  const originalText = text
  const trimmed = text.trim()

  if (!trimmed) {
    return { status: 'invalid', message: 'Please enter a transaction.' }
  }

  if (trimmed.length > 300) {
    return { status: 'invalid', message: 'Input is too long (maximum 300 characters).' }
  }

  // 1. Check for standalone leading negative number (e.g. "-200 food")
  // Note: we distinguish "shopping - 2000" where '-' is a separator
  if (/^-\s*\d/.test(trimmed)) {
    return {
      status: 'invalid',
      message: 'Negative transaction amounts are not supported. Please enter a positive amount.',
    }
  }

  // Normalize separator minus sign: "shopping - 2000" -> "shopping 2000"
  let workingText = trimmed.replace(/(\b[a-zA-Z]+)\s*-\s*(\d)/g, '$1 $2')

  // 2. Identify all potential monetary amount tokens
  // Patterns like ₹150.50, 150.50 INR, 1,50,000, 150
  const amountRegex = /(?:₹|INR\s*)?(\d+(?:,\d+)*(?:\.\d+)?)(?:\s*(?:₹|INR))?/gi
  const amountMatches: Array<{ raw: string; valueStr: string; index: number }> = []

  let match: RegExpExecArray | null
  while ((match = amountRegex.exec(workingText)) !== null) {
    const raw = match[0].trim()
    const valueStr = match[1] ?? ''
    if (valueStr.length > 0) {
      amountMatches.push({ raw, valueStr, index: match.index })
    }
  }

  // Detect multiple distinct amounts (e.g. "150 food 200 fuel")
  if (amountMatches.length > 1) {
    return {
      status: 'invalid',
      message: `Multiple amounts detected (${amountMatches.map((m) => m.raw).join(' and ')}). PaisaTrack requires one transaction per entry.`,
    }
  }

  // Check if amount is missing
  if (amountMatches.length === 0) {
    return {
      status: 'needs_clarification',
      draft: { originalText },
      questions: ['How much was spent or received? (Amount is missing)'],
    }
  }

  const primaryAmountMatch = amountMatches[0]!

  // Validate the amount using parseRupeesToPaise
  let amountPaise = 0
  try {
    amountPaise = parseRupeesToPaise(primaryAmountMatch.raw)
  } catch (err) {
    const message = err instanceof ValidationError ? err.message : 'Invalid monetary amount.'
    return { status: 'invalid', message }
  }

  // Remove the amount token from working text for remaining token extraction
  workingText =
    workingText.slice(0, primaryAmountMatch.index) +
    ' ' +
    workingText.slice(primaryAmountMatch.index + primaryAmountMatch.raw.length)
  workingText = workingText.replace(/\s+/g, ' ').trim()

  // 3. Extract Date Token (today, yesterday, or YYYY-MM-DD)
  const refDate = context.referenceDate ?? new Date()
  let transactionDate =
    context.defaultDate && isValidLocalDateString(context.defaultDate)
      ? context.defaultDate
      : getLocalTodayDateString(refDate)
  let dateFound = false

  const words = workingText.split(/\s+/).filter(Boolean)
  const remainingWords: string[] = []

  for (const word of words) {
    const lower = word.toLowerCase()
    if (lower === 'yesterday') {
      transactionDate = getLocalYesterdayDateString(refDate)
      dateFound = true
    } else if (lower === 'today') {
      transactionDate = getLocalTodayDateString(refDate)
      dateFound = true
    } else if (lower === 'tomorrow') {
      return {
        status: 'needs_clarification',
        draft: { amountPaise, originalText },
        questions: ['Future date "tomorrow" detected. PaisaTrack records actual transactions up to today.'],
      }
    } else if (isValidLocalDateString(lower)) {
      transactionDate = lower
      dateFound = true
    } else {
      remainingWords.push(word)
    }
  }

  workingText = remainingWords.join(' ')

  // 4. Identify Transaction Type Keywords
  // Explicit signals
  let detectedType: TransactionType | null = null
  const lowerRemaining = workingText.toLowerCase()

  const isTransfer = /\b(transfer|moved)\b/i.test(lowerRemaining)
  const isRefund = /\b(refund|refunded)\b/i.test(lowerRemaining)
  const isIncome = /\b(salary|payroll|received|earned|income|freelance|bonus|credited)\b/i.test(
    lowerRemaining
  )
  const isExpense = /\b(spent|paid|bought|expense|debited)\b/i.test(lowerRemaining)

  if (isTransfer) {
    detectedType = 'transfer'
  } else if (isRefund) {
    detectedType = 'refund'
  } else if (isIncome) {
    detectedType = 'income'
  } else if (isExpense) {
    detectedType = 'expense'
  }

  // Remove noise keywords (for, on, from, to, spent, received, etc.)
  let tokens = remainingWords.filter((w) => {
    const lw = w.toLowerCase()
    return !['for', 'on', 'spent', 'paid', 'bought', 'received', 'earned'].includes(lw)
  })

  // 5. Handle Transfer Logic
  if (detectedType === 'transfer') {
    // Pattern: transfer <amount> from <source> to <destination> OR to <destination> from <source>
    const fromMatch = lowerRemaining.match(/from\s+([a-zA-Z0-9_-]+)/i)
    const toMatch = lowerRemaining.match(/to\s+([a-zA-Z0-9_-]+)/i)

    let sourceAccount: Account | undefined
    let destAccount: Account | undefined

    if (fromMatch && fromMatch[1]) {
      const fromName = fromMatch[1].toLowerCase()
      sourceAccount = context.accounts.find(
        (a) => !a.isArchived && a.name.toLowerCase() === fromName
      )
    }
    if (toMatch && toMatch[1]) {
      const toName = toMatch[1].toLowerCase()
      destAccount = context.accounts.find(
        (a) => !a.isArchived && a.name.toLowerCase() === toName
      )
    }

    if (!sourceAccount || !destAccount) {
      return {
        status: 'needs_clarification',
        draft: {
          type: 'transfer',
          amountPaise,
          transactionDate,
          source: 'chat',
          originalText,
          accountId: sourceAccount?.id ?? null,
          transferToAccountId: destAccount?.id ?? null,
        },
        questions: [
          'Please specify both the source (from) and destination (to) accounts for this transfer.',
        ],
      }
    }

    if (sourceAccount.id === destAccount.id) {
      return {
        status: 'invalid',
        message: 'Source and destination accounts must be different for a transfer.',
      }
    }

    return {
      status: 'success',
      draft: {
        type: 'transfer',
        amountPaise,
        categoryId: null,
        accountId: sourceAccount.id,
        transferToAccountId: destAccount.id,
        description: `Transfer from ${sourceAccount.name} to ${destAccount.name}`,
        transactionDate,
        source: 'chat',
        originalText,
      },
      notes: [`Transfer of ₹${amountPaise / 100} from ${sourceAccount.name} to ${destAccount.name}`],
    }
  }

  // 6. Account Identification (optional for ordinary transactions)
  let matchedAccountId: string | null = null
  const accountTokens: string[] = []

  for (const token of tokens) {
    const ltoken = token.toLowerCase()
    const matched = context.accounts.find(
      (a) => !a.isArchived && a.name.toLowerCase() === ltoken
    )
    if (matched) {
      matchedAccountId = matched.id
      accountTokens.push(token)
    }
  }

  // Filter out matched account tokens
  if (accountTokens.length > 0) {
    tokens = tokens.filter((t) => !accountTokens.includes(t))
  }

  // Fallback to default account if not explicitly mentioned
  if (!matchedAccountId) {
    matchedAccountId =
      context.defaultAccountId ??
      context.accounts.find((a) => !a.isArchived)?.id ??
      null
  }

  // Filter out transfer/refund marker words from category search
  tokens = tokens.filter((t) => !['transfer', 'refund', 'refunded'].includes(t.toLowerCase()))

  // 7. Category and Alias Resolution
  const activeCategories = context.categories.filter((c) => !c.isArchived)
  const remainingPhrase = tokens.join(' ').toLowerCase().trim()

  let matchedCategory: Category | null = null
  const candidateCategories: Category[] = []

  // Check full remaining phrase against category names and aliases first
  if (remainingPhrase.length > 0) {
    for (const cat of activeCategories) {
      const nameMatch = cat.name.toLowerCase() === remainingPhrase
      const aliasMatch = cat.aliases.some((al) => al.toLowerCase() === remainingPhrase)
      if (nameMatch || aliasMatch) {
        candidateCategories.push(cat)
      }
    }
  }

  // If no full phrase match, check individual tokens
  if (candidateCategories.length === 0 && tokens.length > 0) {
    for (const token of tokens) {
      const ltoken = token.toLowerCase()
      for (const cat of activeCategories) {
        const nameMatch = cat.name.toLowerCase() === ltoken
        const aliasMatch = cat.aliases.some((al) => al.toLowerCase() === ltoken)
        if (nameMatch || aliasMatch) {
          if (!candidateCategories.includes(cat)) {
            candidateCategories.push(cat)
          }
        }
      }
    }
  }

  // Check alias ambiguity
  if (candidateCategories.length > 1) {
    // If ambiguous matches belong to different categories
    return {
      status: 'needs_clarification',
      draft: {
        amountPaise,
        transactionDate,
        originalText,
        accountId: matchedAccountId,
      },
      questions: [
        `Ambiguous category "${remainingPhrase}". Did you mean ${candidateCategories.map((c) => c.name).join(' or ')}?`,
      ],
    }
  }

  if (candidateCategories.length === 1) {
    matchedCategory = candidateCategories[0]!
  }

  // If type wasn't explicitly provided, infer it from category
  if (!detectedType) {
    if (matchedCategory) {
      detectedType = matchedCategory.type
    } else {
      // Default to expense for standard purchases if amount exists
      detectedType = 'expense'
    }
  }

  // 8. Missing Category Check
  if (!matchedCategory) {
    return {
      status: 'needs_clarification',
      draft: {
        type: detectedType,
        amountPaise,
        transactionDate,
        originalText,
        accountId: matchedAccountId,
        description: tokens.join(' ').trim() || (detectedType === 'income' ? 'Income' : 'Expense'),
      },
      questions: [
        `Category missing or unrecognized for "${tokens.join(' ') || primaryAmountMatch.raw}". Please choose a category.`,
      ],
    }
  }

  // 9. Category Type Compatibility Check
  if (matchedCategory && detectedType && detectedType !== 'refund') {
    if (matchedCategory.type !== detectedType) {
      return {
        status: 'invalid',
        message: `Category "${matchedCategory.name}" is an ${matchedCategory.type} category, but transaction type is ${detectedType}.`,
      }
    }
  }

  // 10. Generate Meaningful Description
  let description = tokens.join(' ').trim()
  if (!description || description.toLowerCase() === matchedCategory?.name.toLowerCase()) {
    description = matchedCategory?.name ?? (detectedType === 'income' ? 'Income' : 'Expense')
  }

  // Capitalize first letter of description
  description = description.charAt(0).toUpperCase() + description.slice(1)

  const draft: TransactionDraft = {
    type: detectedType,
    amountPaise,
    categoryId: matchedCategory?.id ?? null,
    accountId: matchedAccountId,
    description,
    transactionDate,
    source: 'chat',
    originalText,
    refundOfId: null,
  }

  const notes: string[] = []
  if (dateFound && transactionDate !== getLocalTodayDateString(refDate)) {
    notes.push(`Date set to ${transactionDate}`)
  }

  return {
    status: 'success',
    draft,
    notes,
  }
}
