import { useState, useEffect, useMemo, useCallback } from 'react'
import type { PaisaTrackDatabase } from '../../db/database'
import { db as defaultDb } from '../../db/database'
import { ReportingService, type PeriodSummary, type CategorySummary } from '../../services/reportingService'
import { TransactionService } from '../../services/transactionService'
import type { Category, Account, Transaction, AppSettings } from '../../types'
import {
  getLocalTodayDateString,
  getMonthStartLocalDateString,
  getMonthEndLocalDateString,
  getPreviousMonthLocalDateString,
  getWeekStartLocalDateString,
  getWeekEndLocalDateString,
} from '../../utils/dates'
import { formatPaise } from '../../utils/money'
import { groupTransactionsForDisplay, type DisplayTransactionItem } from '../transactions/types'
import { TransactionItem } from '../transactions/TransactionItem'
import { TransactionDetailModal } from '../transactions/TransactionDetailModal'
import {
  ChevronRight,
  Percent,
  Clock,
  Inbox,
} from 'lucide-react'
import './dashboard.css'

export type DashboardPeriod = 'this-month' | 'last-month' | 'this-week'

interface DashboardPageProps {
  database?: PaisaTrackDatabase
  refreshTrigger?: number
  onTransactionMutated?: () => void
  onViewAllTransactions?: () => void
}

export function DashboardPage({
  database = defaultDb,
  refreshTrigger = 0,
  onTransactionMutated,
  onViewAllTransactions,
}: DashboardPageProps) {
  const reporting = useMemo(() => new ReportingService(database), [database])
  const txService = useMemo(() => new TransactionService(database), [database])

  const [period, setPeriod] = useState<DashboardPeriod>('this-month')
  const [categories, setCategories] = useState<Category[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [settings, setSettings] = useState<AppSettings | null>(null)

  const [summary, setSummary] = useState<PeriodSummary>({
    incomePaise: 0,
    grossExpensesPaise: 0,
    refundsPaise: 0,
    netExpensesPaise: 0,
    remainingFromRecordedIncomePaise: 0,
    savingsRatePercentage: null,
    transactionCount: 0,
    transferCount: 0,
  })

  const [todaySpendingPaise, setTodaySpendingPaise] = useState<number>(0)
  const [topCategories, setTopCategories] = useState<CategorySummary[]>([])
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([])
  const [totalTransactionCount, setTotalTransactionCount] = useState<number>(0)
  const [isLoading, setIsLoading] = useState<boolean>(true)

  // Transaction detail modal state
  const [selectedModalItem, setSelectedModalItem] = useState<DisplayTransactionItem | null>(null)
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false)

  const today = useMemo(() => getLocalTodayDateString(), [])

  // Calculate period boundaries based on selected period
  const { startDate, endDate, periodLabel } = useMemo(() => {
    const weekStartsOn = settings?.weekStartsOn ?? 1

    if (period === 'this-month') {
      const start = getMonthStartLocalDateString(today)
      const end = getMonthEndLocalDateString(today)
      return { startDate: start, endDate: end, periodLabel: 'This Month' }
    } else if (period === 'last-month') {
      const prevFirst = getPreviousMonthLocalDateString(today)
      const start = prevFirst
      const end = getMonthEndLocalDateString(prevFirst)
      return { startDate: start, endDate: end, periodLabel: 'Last Month' }
    } else {
      // this-week
      const start = getWeekStartLocalDateString(new Date(), weekStartsOn)
      const end = getWeekEndLocalDateString(new Date(), weekStartsOn)
      return { startDate: start, endDate: end, periodLabel: 'This Week' }
    }
  }, [period, today, settings])

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
        }
      } catch (err) {
        console.error('Failed to load metadata in DashboardPage', err)
      }
    }
    loadMetadata()
    return () => {
      isMounted = false
    }
  }, [database])

  // Fetch all dashboard data
  const loadDashboardData = useCallback(async () => {
    setIsLoading(true)
    try {
      const [
        periodSum,
        todaySum,
        catSums,
        allRecentTxs,
        totalCount,
      ] = await Promise.all([
        reporting.getPeriodSummary(startDate, endDate),
        reporting.getPeriodSummary(today, today),
        reporting.getCategorySummaries(startDate, endDate),
        txService.listTransactions({ sortBy: 'transactionDate', order: 'desc' }),
        database.transactions.count(),
      ])

      setSummary(periodSum)
      setTodaySpendingPaise(todaySum.netExpensesPaise)

      // Only expense categories with positive net amount, top 3
      const expenseCats = catSums
        .filter((c) => c.categoryType === 'expense' && c.netAmountPaise > 0)
        .slice(0, 3)
      setTopCategories(expenseCats)

      setRecentTransactions(allRecentTxs.slice(0, 6))
      setTotalTransactionCount(totalCount)
    } catch (err) {
      console.error('Failed to load dashboard metrics', err)
    } finally {
      setIsLoading(false)
    }
  }, [reporting, txService, database, startDate, endDate, today])

  useEffect(() => {
    loadDashboardData()
  }, [loadDashboardData, refreshTrigger])

  // Group recent transactions for display (unifies transfer records into single items)
  const recentDisplayItems = useMemo(() => {
    return groupTransactionsForDisplay(recentTransactions, accounts, categories).slice(0, 5)
  }, [recentTransactions, accounts, categories])

  const handleModalUpdated = () => {
    loadDashboardData()
    onTransactionMutated?.()
  }

  const handleModalDeleted = () => {
    loadDashboardData()
    onTransactionMutated?.()
  }

  const isPositiveRemaining = summary.remainingFromRecordedIncomePaise >= 0

  return (
    <div className="dashboard-container">
      {/* Period Selection Controls */}
      <div className="dashboard-period-selector" role="tablist" aria-label="Dashboard Period">
        <button
          type="button"
          className={`dashboard-period-btn ${period === 'this-month' ? 'active' : ''}`}
          onClick={() => setPeriod('this-month')}
          role="tab"
          aria-selected={period === 'this-month'}
        >
          This Month
        </button>
        <button
          type="button"
          className={`dashboard-period-btn ${period === 'last-month' ? 'active' : ''}`}
          onClick={() => setPeriod('last-month')}
          role="tab"
          aria-selected={period === 'last-month'}
        >
          Last Month
        </button>
        <button
          type="button"
          className={`dashboard-period-btn ${period === 'this-week' ? 'active' : ''}`}
          onClick={() => setPeriod('this-week')}
          role="tab"
          aria-selected={period === 'this-week'}
        >
          This Week
        </button>
      </div>

      {/* Today's Spending Banner */}
      <div className="dashboard-today-banner">
        <span className="dashboard-today-label">
          <Clock size={15} />
          <span>Today's Spending</span>
        </span>
        <span className="dashboard-today-val">
          {formatPaise(todaySpendingPaise)}
        </span>
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--color-text-secondary)' }}>
          Loading dashboard metrics...
        </div>
      ) : (
        <>
          {/* Hero Card: Remaining from Recorded Income */}
          <div className="dashboard-hero-card">
            <span className="dashboard-hero-label">
              Remaining from Recorded Income ({periodLabel})
            </span>
            <span
              className="dashboard-hero-val"
              style={{ color: isPositiveRemaining ? 'var(--color-income)' : 'var(--color-expense)' }}
            >
              {formatPaise(summary.remainingFromRecordedIncomePaise)}
            </span>
            <span className="dashboard-hero-sub">
              Calculated period metric (Income − Net Expenses). Does not reflect bank balance.
            </span>
          </div>

          {/* Detailed Financial Summary Cards */}
          <div className="dashboard-metrics-grid">
            {/* Income */}
            <div className="dashboard-stat-card">
              <span className="dashboard-stat-label">Income</span>
              <span className="dashboard-stat-amount stat-income">
                {`+ ${formatPaise(summary.incomePaise)}`}
              </span>
            </div>

            {/* Net Expenses */}
            <div className="dashboard-stat-card">
              <span className="dashboard-stat-label">Net Expenses</span>
              <span className="dashboard-stat-amount stat-expense">
                {formatPaise(summary.netExpensesPaise)}
              </span>
            </div>

            {/* Gross Expenses */}
            <div className="dashboard-stat-card">
              <span className="dashboard-stat-label">Gross Expenses</span>
              <span className="dashboard-stat-amount stat-neutral">
                {formatPaise(summary.grossExpensesPaise)}
              </span>
            </div>

            {/* Refunds */}
            <div className="dashboard-stat-card">
              <span className="dashboard-stat-label">Refunds</span>
              <span className="dashboard-stat-amount stat-refund">
                {`+ ${formatPaise(summary.refundsPaise)}`}
              </span>
            </div>

            {/* Savings Rate */}
            <div className="dashboard-stat-card full-width" style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
                <Percent size={16} color="var(--color-primary)" />
                <span className="dashboard-stat-label">Savings Rate</span>
              </div>
              <span className="dashboard-stat-amount" style={{ color: 'var(--color-primary)' }}>
                {summary.savingsRatePercentage !== null
                  ? `${summary.savingsRatePercentage.toFixed(1)}%`
                  : '—'}
              </span>
            </div>
          </div>

          {/* Highest-Spending Categories Highlights */}
          {topCategories.length > 0 && (
            <div className="dashboard-section">
              <div className="dashboard-section-header">
                <h3 className="dashboard-section-title">Top Categories ({periodLabel})</h3>
              </div>
              <div className="dashboard-top-cats-card">
                {topCategories.map((cat) => (
                  <div key={cat.categoryId} className="dashboard-top-cat-row">
                    <div className="dashboard-cat-info">
                      <span
                        className="dashboard-cat-dot"
                        style={{ backgroundColor: cat.color }}
                        aria-hidden="true"
                      />
                      <span className="dashboard-cat-name">{cat.categoryName}</span>
                    </div>
                    <div>
                      <span className="dashboard-cat-amount">{formatPaise(cat.netAmountPaise)}</span>
                      {cat.percentageOfTotal !== null && (
                        <span className="dashboard-cat-pct">({cat.percentageOfTotal.toFixed(0)}%)</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Activity Section */}
          <div className="dashboard-section">
            <div className="dashboard-section-header">
              <h3 className="dashboard-section-title">Recent Activity</h3>
              {onViewAllTransactions && (
                <button
                  type="button"
                  className="dashboard-section-link"
                  onClick={onViewAllTransactions}
                  aria-label="View all transactions history"
                >
                  <span>View All ({totalTransactionCount})</span>
                  <ChevronRight size={14} />
                </button>
              )}
            </div>

            {recentDisplayItems.length === 0 ? (
              <div
                style={{
                  background: 'var(--color-surface)',
                  border: '1px dashed var(--color-border)',
                  borderRadius: 'var(--radius-lg)',
                  padding: 'var(--space-lg)',
                  textAlign: 'center',
                  color: 'var(--color-text-secondary)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 'var(--space-xs)',
                }}
              >
                <Inbox size={28} />
                <span>No transactions recorded yet.</span>
              </div>
            ) : (
              <div className="tx-items-list" role="feed" aria-label="Recent transactions">
                {recentDisplayItems.map((item) => {
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
        </>
      )}

      {/* Transaction Details / Edit Modal */}
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
