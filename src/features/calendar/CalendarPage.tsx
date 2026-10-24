import { useState, useEffect, useMemo, useCallback } from 'react'
import type { PaisaTrackDatabase } from '../../db/database'
import { db as defaultDb } from '../../db/database'
import { TransactionService } from '../../services/transactionService'
import { calculatePeriodSummary, type PeriodSummary } from '../../services/reportingService'
import type { Category, Account, Transaction, AppSettings } from '../../types'
import {
  getLocalTodayDateString,
  getDaysInMonth,
  getMonthStartLocalDateString,
  getMonthEndLocalDateString,
  getPreviousMonthLocalDateString,
  getNextMonthLocalDateString,
  isValidLocalDateString,
} from '../../utils/dates'
import { formatPaise } from '../../utils/money'
import {
  type DisplayTransactionItem,
  groupTransactionsForDisplay,
} from '../transactions/types'
import { TransactionItem } from '../transactions/TransactionItem'
import { TransactionDetailModal } from '../transactions/TransactionDetailModal'
import { parseTransaction, type TransactionDraft, type ParseResult } from '../chat-entry/parseTransaction'
import { TransactionDraftCard } from '../chat-entry/TransactionDraftCard'
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  AlertCircle,
} from 'lucide-react'
import './calendar.css'

interface CalendarPageProps {
  database?: PaisaTrackDatabase
  initialSelectedDate?: string
  refreshTrigger?: number
  onTransactionMutated?: () => void
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

export function CalendarPage({
  database = defaultDb,
  initialSelectedDate,
  refreshTrigger = 0,
  onTransactionMutated,
}: CalendarPageProps) {
  const txService = useMemo(() => new TransactionService(database), [database])

  const today = useMemo(() => getLocalTodayDateString(), [])

  // Initial selected date defaults to today or passed valid date
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    if (initialSelectedDate && isValidLocalDateString(initialSelectedDate)) {
      return initialSelectedDate
    }
    return today
  })

  // Current month being viewed in the calendar grid (YYYY-MM-01)
  const [currentMonthDate, setCurrentMonthDate] = useState<string>(() => {
    return getMonthStartLocalDateString(selectedDate)
  })

  // Metadata
  const [categories, setCategories] = useState<Category[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [isLoadingMetadata, setIsLoadingMetadata] = useState<boolean>(true)

  // Month transactions (for indicators in the grid)
  const [monthTransactions, setMonthTransactions] = useState<Transaction[]>([])

  // Selected date transactions and summary
  const [dayTransactions, setDayTransactions] = useState<Transaction[]>([])
  const [daySummary, setDaySummary] = useState<PeriodSummary>({
    incomePaise: 0,
    grossExpensesPaise: 0,
    refundsPaise: 0,
    netExpensesPaise: 0,
    remainingFromRecordedIncomePaise: 0,
    savingsRatePercentage: null,
    transactionCount: 0,
    transferCount: 0,
  })

  // Transaction detail modal state
  const [selectedModalItem, setSelectedModalItem] = useState<DisplayTransactionItem | null>(null)
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false)

  // Quick Add for selected date state
  const [isQuickAddOpen, setIsQuickAddOpen] = useState<boolean>(false)
  const [quickAddInput, setQuickAddInput] = useState<string>('')
  const [quickAddDraft, setQuickAddDraft] = useState<TransactionDraft | null>(null)
  const [quickAddError, setQuickAddError] = useState<string | null>(null)
  const [isSavingDraft, setIsSavingDraft] = useState<boolean>(false)

  // Load metadata
  useEffect(() => {
    let isMounted = true
    const loadMetadata = async () => {
      try {
        const [cats, accs, sets] = await Promise.all([
          database.categories.toArray(),
          database.accounts.toArray(),
          database.settings.get('app-settings'),
        ])
        if (isMounted) {
          setCategories(cats)
          setAccounts(accs)
          setSettings(sets ?? null)
          setIsLoadingMetadata(false)
        }
      } catch (err) {
        console.error('Failed to load metadata in CalendarPage', err)
        if (isMounted) setIsLoadingMetadata(false)
      }
    }
    loadMetadata()
    return () => {
      isMounted = false
    }
  }, [database])

  // Load all transactions for the visible month
  const loadMonthData = useCallback(async () => {
    try {
      const monthStart = getMonthStartLocalDateString(currentMonthDate)
      const monthEnd = getMonthEndLocalDateString(currentMonthDate)
      const results = await txService.listTransactions({
        startDate: monthStart,
        endDate: monthEnd,
      })
      setMonthTransactions(results)
    } catch (err) {
      console.error('Failed to load month transactions', err)
    }
  }, [currentMonthDate, txService])

  // Load transactions and calculate summary for the selected date
  const loadDayData = useCallback(async () => {
    try {
      const dayTxs = await txService.listTransactions({
        startDate: selectedDate,
        endDate: selectedDate,
      })
      setDayTransactions(dayTxs)
      setDaySummary(calculatePeriodSummary(dayTxs))
    } catch (err) {
      console.error('Failed to load day transactions', err)
    }
  }, [selectedDate, txService])

  // Refetch when month, selectedDate, or refreshTrigger changes
  useEffect(() => {
    loadMonthData()
  }, [loadMonthData, refreshTrigger])

  useEffect(() => {
    loadDayData()
  }, [loadDayData, refreshTrigger])

  // Month navigation
  const handlePrevMonth = () => {
    const prevMonth = getPreviousMonthLocalDateString(currentMonthDate)
    setCurrentMonthDate(prevMonth)
    // Select the first day of the previous month
    setSelectedDate(prevMonth)
  }

  const handleNextMonth = () => {
    const nextMonth = getNextMonthLocalDateString(currentMonthDate)
    setCurrentMonthDate(nextMonth)
    // Select the first day of the next month
    setSelectedDate(nextMonth)
  }

  // Parse Month and Year for title
  const parts = currentMonthDate.split('-')
  const yearNum = Number(parts[0])
  const monthNum = Number(parts[1])
  const monthTitle = `${MONTH_NAMES[monthNum - 1] ?? ''} ${yearNum}`

  // Compute days in month and day indicators
  const totalDaysInMonth = getDaysInMonth(yearNum, monthNum)

  // Map of date -> transactions
  const monthDateMap = useMemo(() => {
    const map = new Map<string, Transaction[]>()
    for (const tx of monthTransactions) {
      const list = map.get(tx.transactionDate) ?? []
      list.push(tx)
      map.set(tx.transactionDate, list)
    }
    return map
  }, [monthTransactions])

  // Weekday layout
  const weekStartsOn = settings?.weekStartsOn ?? 1 // 1 = Monday, 0 = Sunday
  const weekdayLabels =
    weekStartsOn === 1
      ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
      : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  // Leading blank cells
  // new Date(year, monthIndex, 1).getDay(): 0 is Sunday, 1 is Monday ...
  const firstDayWeekday = new Date(yearNum, monthNum - 1, 1).getDay()
  const leadingBlankCount =
    weekStartsOn === 1
      ? (firstDayWeekday + 6) % 7
      : firstDayWeekday

  // Display items for selected day
  const dayDisplayItems = useMemo(() => {
    return groupTransactionsForDisplay(dayTransactions, accounts, categories)
  }, [dayTransactions, accounts, categories])

  // Handle Quick Add submission for selected date
  const handleQuickAddSubmit = () => {
    if (!quickAddInput.trim() || isSavingDraft) return
    setQuickAddError(null)

    const result: ParseResult = parseTransaction(quickAddInput.trim(), {
      categories,
      accounts,
      defaultAccountId: settings?.defaultAccountId ?? null,
      defaultDate: selectedDate, // Preserves the selected calendar date!
    })

    if (result.status === 'invalid') {
      setQuickAddError(result.message)
    } else if (result.status === 'needs_clarification') {
      if (result.draft.amountPaise) {
        setQuickAddDraft({
          type: result.draft.type ?? 'expense',
          amountPaise: result.draft.amountPaise,
          categoryId: result.draft.categoryId ?? null,
          accountId: result.draft.accountId ?? settings?.defaultAccountId ?? accounts[0]?.id ?? null,
          transferToAccountId: result.draft.transferToAccountId ?? null,
          description: result.draft.description ?? quickAddInput.trim(),
          transactionDate: selectedDate,
          source: 'form',
          originalText: quickAddInput.trim(),
          refundOfId: null,
        })
      } else {
        setQuickAddError(result.questions[0] ?? 'Could not parse transaction amount.')
      }
    } else if (result.status === 'success') {
      // Ensure date is retained
      setQuickAddDraft({
        ...result.draft,
        transactionDate: result.draft.transactionDate || selectedDate,
      })
    }
  }

  // Save the draft created for the selected date
  const handleSaveDraft = async (draft: TransactionDraft) => {
    setIsSavingDraft(true)
    setQuickAddError(null)
    try {
      if (draft.type === 'transfer') {
        if (!draft.accountId || !draft.transferToAccountId) {
          throw new Error('Please select both source and destination accounts.')
        }
        await txService.createTransfer({
          sourceAccountId: draft.accountId,
          destinationAccountId: draft.transferToAccountId,
          amountPaise: draft.amountPaise,
          transactionDate: draft.transactionDate,
          description: draft.description,
          source: 'form',
        })
      } else if (draft.type === 'refund') {
        if (!draft.accountId) {
          throw new Error('Please select an account.')
        }
        await txService.createRefund({
          amountPaise: draft.amountPaise,
          accountId: draft.accountId,
          categoryId: draft.categoryId,
          description: draft.description,
          transactionDate: draft.transactionDate,
          refundOfId: draft.refundOfId,
          source: 'form',
        })
      } else {
        if (!draft.accountId) {
          throw new Error('Please select an account.')
        }
        await txService.createTransaction({
          type: draft.type,
          amountPaise: draft.amountPaise,
          categoryId: draft.categoryId,
          accountId: draft.accountId,
          description: draft.description,
          transactionDate: draft.transactionDate,
          source: 'form',
        })
      }

      // Reset Quick Add state
      setQuickAddDraft(null)
      setQuickAddInput('')
      setIsQuickAddOpen(false)

      // Refresh Month data, Day data, and notify parent
      loadMonthData()
      loadDayData()
      onTransactionMutated?.()
    } catch (err) {
      setQuickAddError(err instanceof Error ? err.message : 'Failed to save transaction.')
    } finally {
      setIsSavingDraft(false)
    }
  }

  // Handle detail modal callbacks
  const handleModalUpdated = () => {
    loadMonthData()
    loadDayData()
    onTransactionMutated?.()
  }

  const handleModalDeleted = () => {
    loadMonthData()
    loadDayData()
    onTransactionMutated?.()
  }

  if (isLoadingMetadata) {
    return (
      <div className="calendar-container" style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--color-text-secondary)' }}>
        Loading calendar...
      </div>
    )
  }

  return (
    <div className="calendar-container">
      {/* Month Navigation Header */}
      <div className="calendar-header">
        <h2 className="calendar-month-title">{monthTitle}</h2>
        <div className="calendar-nav-controls">
          <button
            type="button"
            className="calendar-nav-btn"
            onClick={handlePrevMonth}
            aria-label="Previous month"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            type="button"
            className="calendar-nav-btn"
            onClick={handleNextMonth}
            aria-label="Next month"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      {/* Month Calendar Grid */}
      <div className="calendar-month-card">
        {/* Weekday headers */}
        <div className="calendar-weekdays-row" role="row">
          {weekdayLabels.map((lbl) => (
            <div key={lbl} className="calendar-weekday-cell" role="columnheader">
              {lbl}
            </div>
          ))}
        </div>

        {/* Days grid */}
        <div className="calendar-days-grid" role="grid" aria-label={`Calendar grid for ${monthTitle}`}>
          {/* Leading blank days */}
          {Array.from({ length: leadingBlankCount }).map((_, i) => (
            <div key={`blank-${i}`} className="calendar-day-cell-empty" aria-hidden="true" />
          ))}

          {/* Month days */}
          {Array.from({ length: totalDaysInMonth }).map((_, i) => {
            const dayNum = i + 1
            const dayDateStr = `${yearNum}-${String(monthNum).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`
            const isToday = dayDateStr === today
            const isSelected = dayDateStr === selectedDate
            const txsOnDay = monthDateMap.get(dayDateStr) ?? []
            const hasTxs = txsOnDay.length > 0
            const hasIncome = txsOnDay.some((t) => t.type === 'income')
            const hasExpense = txsOnDay.some((t) => t.type === 'expense' || t.type === 'refund')
            const hasTransfer = txsOnDay.some((t) => t.type === 'transfer')

            const classNames = [
              'calendar-day-btn',
              isToday ? 'calendar-day-today' : '',
              isSelected ? 'calendar-day-selected' : '',
            ]
              .filter(Boolean)
              .join(' ')

            return (
              <button
                key={dayDateStr}
                type="button"
                className={classNames}
                onClick={() => setSelectedDate(dayDateStr)}
                aria-label={`${dayDateStr}${isToday ? ' (today)' : ''}${isSelected ? ' (selected)' : ''}, ${txsOnDay.length} transactions`}
                aria-pressed={isSelected}
              >
                <span className="calendar-day-number">{dayNum}</span>
                {hasTxs && (
                  <div className="calendar-day-dots" aria-hidden="true">
                    {hasIncome && <span className="calendar-dot dot-income" />}
                    {hasExpense && <span className="calendar-dot dot-expense" />}
                    {hasTransfer && <span className="calendar-dot dot-transfer" />}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Daily Section for Selected Date */}
      <div className="calendar-daily-section">
        {/* Daily Summary Card */}
        <div className="daily-summary-card">
          <div className="daily-summary-header">
            <h3 className="daily-summary-title">Summary for {selectedDate}</h3>
            <span className="daily-summary-badge">
              {dayTransactions.length} {dayTransactions.length === 1 ? 'transaction' : 'transactions'}
            </span>
          </div>

          <div className="daily-summary-grid">
            <div className="daily-stat-box">
              <span className="daily-stat-label">Income</span>
              <span className="daily-stat-val" style={{ color: 'var(--color-income)' }}>
                {formatPaise(daySummary.incomePaise)}
              </span>
            </div>

            <div className="daily-stat-box">
              <span className="daily-stat-label">Net Expenses</span>
              <span className="daily-stat-val" style={{ color: 'var(--color-expense)' }}>
                {formatPaise(daySummary.netExpensesPaise)}
              </span>
            </div>

            <div className="daily-stat-box">
              <span className="daily-stat-label">Gross Expenses</span>
              <span className="daily-stat-val" style={{ color: 'var(--color-text-primary)' }}>
                {formatPaise(daySummary.grossExpensesPaise)}
              </span>
            </div>

            <div className="daily-stat-box">
              <span className="daily-stat-label">Refunds</span>
              <span className="daily-stat-val" style={{ color: 'var(--color-refund)' }}>
                {formatPaise(daySummary.refundsPaise)}
              </span>
            </div>
          </div>
        </div>

        {/* Quick Add for Selected Date */}
        <div className="calendar-add-section">
          {!isQuickAddOpen ? (
            <button
              type="button"
              className="calendar-add-toggle-btn"
              onClick={() => setIsQuickAddOpen(true)}
              aria-label={`Add transaction for ${selectedDate}`}
            >
              <Plus size={18} />
              <span>Add entry for {selectedDate}</span>
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
              <div style={{ display: 'flex', gap: 'var(--space-2xs)' }}>
                <input
                  type="text"
                  className="chat-input-field"
                  placeholder={`e.g. 150 coffee on ${selectedDate}`}
                  value={quickAddInput}
                  onChange={(e) => setQuickAddInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleQuickAddSubmit()
                    }
                  }}
                  disabled={isSavingDraft}
                  aria-label={`Enter transaction text for ${selectedDate}`}
                />
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleQuickAddSubmit}
                  disabled={!quickAddInput.trim() || isSavingDraft}
                  style={{ minWidth: '44px', padding: '0 var(--space-sm)' }}
                  aria-label="Parse entry"
                >
                  Add
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setIsQuickAddOpen(false)
                    setQuickAddDraft(null)
                    setQuickAddError(null)
                  }}
                  disabled={isSavingDraft}
                  style={{ minWidth: '44px', padding: '0 var(--space-xs)' }}
                  aria-label="Cancel adding transaction"
                >
                  Cancel
                </button>
              </div>

              {quickAddError && (
                <div
                  style={{
                    background: 'var(--color-expense-bg)',
                    color: 'var(--color-expense)',
                    padding: 'var(--space-xs) var(--space-sm)',
                    borderRadius: 'var(--radius-md)',
                    fontSize: 'var(--font-size-xs)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-2xs)',
                  }}
                  role="alert"
                >
                  <AlertCircle size={14} />
                  <span>{quickAddError}</span>
                </div>
              )}

              {/* Draft card preview when parser succeeds */}
              {quickAddDraft && (
                <TransactionDraftCard
                  draft={quickAddDraft}
                  categories={categories}
                  accounts={accounts}
                  isSaving={isSavingDraft}
                  onConfirm={handleSaveDraft}
                  onCancel={() => setQuickAddDraft(null)}
                />
              )}
            </div>
          )}
        </div>

        {/* Selected Day's Transactions */}
        <h4 className="calendar-tx-heading">Transactions on {selectedDate}</h4>
        {dayDisplayItems.length === 0 ? (
          <div className="calendar-empty-day">
            No transactions recorded on this date.
          </div>
        ) : (
          <div className="tx-items-list" role="feed" aria-label={`Transactions on ${selectedDate}`}>
            {dayDisplayItems.map((item) => {
              const key =
                item.kind === 'standard'
                  ? item.transaction.id
                  : item.transferGroupId
              return (
                <TransactionItem
                  key={key}
                  item={item}
                  onClick={(clickedItem) => {
                    if (clickedItem.kind === 'malformed_transfer') return
                    setSelectedModalItem(clickedItem)
                    setIsModalOpen(true)
                  }}
                />
              )
            })}
          </div>
        )}
      </div>

      {/* Transaction Detail & Edit Modal */}
      <TransactionDetailModal
        item={selectedModalItem}
        categories={categories}
        accounts={accounts}
        isOpen={isModalOpen}
        txService={txService}
        onClose={() => {
          setIsModalOpen(false)
          setSelectedModalItem(null)
        }}
        onUpdated={handleModalUpdated}
        onDeleted={handleModalDeleted}
      />
    </div>
  )
}
