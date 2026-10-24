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
import { AddTransactionModal } from '../transactions/AddTransactionModal'
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Check,
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

  // Initial selected date defaults to today or passed valid date (cannot be in the future)
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    if (initialSelectedDate && isValidLocalDateString(initialSelectedDate) && initialSelectedDate <= today) {
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

  // Shared Add Transaction modal state & toast
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

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

  // Month navigation: prevent navigating to future months
  const currentMonthStart = useMemo(() => getMonthStartLocalDateString(today), [today])
  const isNextMonthDisabled = currentMonthDate >= currentMonthStart

  const handlePrevMonth = () => {
    const prevMonth = getPreviousMonthLocalDateString(currentMonthDate)
    setCurrentMonthDate(prevMonth)
    setSelectedDate(prevMonth)
  }

  const handleNextMonth = () => {
    if (isNextMonthDisabled) return
    const nextMonth = getNextMonthLocalDateString(currentMonthDate)
    setCurrentMonthDate(nextMonth)
    setSelectedDate(nextMonth > today ? today : nextMonth)
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
  const firstDayWeekday = new Date(yearNum, monthNum - 1, 1).getDay()
  const leadingBlankCount =
    weekStartsOn === 1
      ? (firstDayWeekday + 6) % 7
      : firstDayWeekday

  // Display items for selected day
  const dayDisplayItems = useMemo(() => {
    return groupTransactionsForDisplay(dayTransactions, accounts, categories)
  }, [dayTransactions, accounts, categories])

  // Handle Add Transaction Success
  const handleAddTransactionSuccess = (savedTx: Transaction) => {
    loadMonthData()
    loadDayData()
    onTransactionMutated?.()
    setToastMessage(`Transaction of ₹${(savedTx.amountPaise / 100).toFixed(2)} added successfully!`)
    setTimeout(() => {
      setToastMessage(null)
    }, 3000)
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
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="toast-banner" role="status" aria-live="polite">
          <Check size={16} />
          <span>{toastMessage}</span>
        </div>
      )}

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
            disabled={isNextMonthDisabled}
            aria-label="Next month"
            title={isNextMonthDisabled ? 'Future months unavailable' : 'Next month'}
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
            const isFuture = dayDateStr > today
            const txsOnDay = monthDateMap.get(dayDateStr) ?? []
            const hasTxs = txsOnDay.length > 0
            const hasIncome = txsOnDay.some((t) => t.type === 'income')
            const hasExpense = txsOnDay.some((t) => t.type === 'expense' || t.type === 'refund')
            const hasTransfer = txsOnDay.some((t) => t.type === 'transfer')

            const classNames = [
              'calendar-day-btn',
              isToday ? 'calendar-day-today' : '',
              isSelected ? 'calendar-day-selected' : '',
              isFuture ? 'calendar-day-future' : '',
            ]
              .filter(Boolean)
              .join(' ')

            return (
              <button
                key={dayDateStr}
                type="button"
                className={classNames}
                onClick={() => {
                  if (!isFuture) {
                    setSelectedDate(dayDateStr)
                  }
                }}
                disabled={isFuture}
                aria-disabled={isFuture}
                aria-label={`${dayDateStr}${isToday ? ' (today)' : ''}${isSelected ? ' (selected)' : ''}${isFuture ? ' (future date - unavailable)' : ''}, ${txsOnDay.length} transactions`}
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
            <div>
              <h3 className="daily-summary-title">Summary for {selectedDate === today ? `Today (${selectedDate})` : selectedDate}</h3>
              <span className="daily-summary-badge">
                {dayTransactions.length} {dayTransactions.length === 1 ? 'transaction' : 'transactions'}
              </span>
            </div>
            <button
              type="button"
              className="btn-primary"
              onClick={() => setIsAddModalOpen(true)}
              disabled={selectedDate > today}
              style={{ minHeight: '36px', padding: '0.4rem 0.85rem', fontSize: 'var(--font-size-xs)' }}
              aria-label={`Add transaction for ${selectedDate}`}
            >
              <Plus size={14} />
              <span>Add Transaction</span>
            </button>
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

        {/* Add Transaction Section for Selected Date */}
        <div className="calendar-add-section">
          <button
            type="button"
            className="calendar-add-toggle-btn"
            onClick={() => setIsAddModalOpen(true)}
            disabled={selectedDate > today}
            aria-label={`Add transaction for ${selectedDate}`}
          >
            <Plus size={18} />
            <span>Add transaction for {selectedDate === today ? 'Today' : selectedDate}</span>
          </button>
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

      {/* Shared Add Transaction Modal */}
      <AddTransactionModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={handleAddTransactionSuccess}
        categories={categories}
        accounts={accounts}
        defaultAccountId={settings?.defaultAccountId}
        initialDate={selectedDate}
        txService={txService}
      />

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
