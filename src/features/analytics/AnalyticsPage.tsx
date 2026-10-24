import { useState, useEffect, useMemo, useCallback } from 'react'
import type { PaisaTrackDatabase } from '../../db/database'
import { db as defaultDb } from '../../db/database'
import {
  ReportingService,
  type CategorySummary,
  type DailySummary,
  type PeriodSummary,
  type PeriodComparison,
} from '../../services/reportingService'
import type { AppSettings } from '../../types'
import {
  getLocalTodayDateString,
  getMonthStartLocalDateString,
  getMonthEndLocalDateString,
  getPreviousMonthLocalDateString,
  getWeekStartLocalDateString,
  getWeekEndLocalDateString,
  getPreviousWeekStartLocalDateString,
  getPreviousWeekEndLocalDateString,
} from '../../utils/dates'
import { formatPaise } from '../../utils/money'
import { CategoryDistributionChart } from './CategoryDistributionChart'
import { IncomeExpenseTrendChart } from './IncomeExpenseTrendChart'
import { PeriodComparisonCard } from './PeriodComparisonCard'
import { Percent } from 'lucide-react'
import './analytics.css'

export type AnalyticsPeriod = 'this-month' | 'last-month' | 'this-week'

interface AnalyticsPageProps {
  database?: PaisaTrackDatabase
  refreshTrigger?: number
}

export function AnalyticsPage({
  database = defaultDb,
  refreshTrigger = 0,
}: AnalyticsPageProps) {
  const reporting = useMemo(() => new ReportingService(database), [database])

  const [period, setPeriod] = useState<AnalyticsPeriod>('this-month')
  const [settings, setSettings] = useState<AppSettings | null>(null)

  const [periodSummary, setPeriodSummary] = useState<PeriodSummary>({
    incomePaise: 0,
    grossExpensesPaise: 0,
    refundsPaise: 0,
    netExpensesPaise: 0,
    remainingFromRecordedIncomePaise: 0,
    savingsRatePercentage: null,
    transactionCount: 0,
    transferCount: 0,
  })

  const [categories, setCategories] = useState<CategorySummary[]>([])
  const [dailySummaries, setDailySummaries] = useState<DailySummary[]>([])
  const [comparison, setComparison] = useState<PeriodComparison | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)

  const today = useMemo(() => getLocalTodayDateString(), [])

  // Calculate current and previous period boundaries
  const { startDate, endDate, prevStartDate, prevEndDate, periodLabel, prevPeriodLabel } = useMemo(() => {
    const weekStartsOn = settings?.weekStartsOn ?? 1

    if (period === 'this-month') {
      const curStart = getMonthStartLocalDateString(today)
      const curEnd = getMonthEndLocalDateString(today)

      const pStart = getPreviousMonthLocalDateString(today)
      const pEnd = getMonthEndLocalDateString(pStart)
      return {
        startDate: curStart,
        endDate: curEnd,
        prevStartDate: pStart,
        prevEndDate: pEnd,
        periodLabel: 'This Month',
        prevPeriodLabel: 'Last Month',
      }
    } else if (period === 'last-month') {
      const curStart = getPreviousMonthLocalDateString(today)
      const curEnd = getMonthEndLocalDateString(curStart)

      const pStart = getPreviousMonthLocalDateString(curStart)
      const pEnd = getMonthEndLocalDateString(pStart)
      return {
        startDate: curStart,
        endDate: curEnd,
        prevStartDate: pStart,
        prevEndDate: pEnd,
        periodLabel: 'Last Month',
        prevPeriodLabel: '2 Months Ago',
      }
    } else {
      // this-week
      const curStart = getWeekStartLocalDateString(new Date(), weekStartsOn)
      const curEnd = getWeekEndLocalDateString(new Date(), weekStartsOn)

      const pStart = getPreviousWeekStartLocalDateString(new Date(), weekStartsOn)
      const pEnd = getPreviousWeekEndLocalDateString(new Date(), weekStartsOn)
      return {
        startDate: curStart,
        endDate: curEnd,
        prevStartDate: pStart,
        prevEndDate: pEnd,
        periodLabel: 'This Week',
        prevPeriodLabel: 'Last Week',
      }
    }
  }, [period, today, settings])

  // Load settings
  useEffect(() => {
    let isMounted = true
    const loadSettings = async () => {
      try {
        const s = await database.settings.get('app-settings')
        if (isMounted) setSettings(s ?? null)
      } catch (err) {
        console.error('Failed to load settings in AnalyticsPage', err)
      }
    }
    loadSettings()
    return () => {
      isMounted = false
    }
  }, [database])

  // Load analytics data
  const loadAnalyticsData = useCallback(async () => {
    setIsLoading(true)
    try {
      const [pSum, catSums, dailySums, comp] = await Promise.all([
        reporting.getPeriodSummary(startDate, endDate),
        reporting.getCategorySummaries(startDate, endDate),
        reporting.getDailySummaries(startDate, endDate),
        reporting.getPeriodComparison(startDate, endDate, prevStartDate, prevEndDate),
      ])

      setPeriodSummary(pSum)
      setCategories(catSums)
      setDailySummaries(dailySums)
      setComparison(comp)
    } catch (err) {
      console.error('Failed to load analytics data', err)
    } finally {
      setIsLoading(false)
    }
  }, [reporting, startDate, endDate, prevStartDate, prevEndDate])

  useEffect(() => {
    loadAnalyticsData()
  }, [loadAnalyticsData, refreshTrigger])

  return (
    <div className="analytics-container">
      {/* Period Selector */}
      <div className="dashboard-period-selector" role="tablist" aria-label="Analytics Period">
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

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--color-text-secondary)' }}>
          Loading insights...
        </div>
      ) : (
        <>
          {/* Key Overview Stat Cards */}
          <div className="dashboard-metrics-grid">
            <div className="dashboard-stat-card">
              <span className="dashboard-stat-label">Income</span>
              <span className="dashboard-stat-amount stat-income">
                {`+ ${formatPaise(periodSummary.incomePaise)}`}
              </span>
            </div>

            <div className="dashboard-stat-card">
              <span className="dashboard-stat-label">Net Expenses</span>
              <span className="dashboard-stat-amount stat-expense">
                {formatPaise(periodSummary.netExpensesPaise)}
              </span>
            </div>

            <div className="dashboard-stat-card full-width" style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
                <Percent size={16} color="var(--color-primary)" />
                <span className="dashboard-stat-label">Savings Rate ({periodLabel})</span>
              </div>
              <span className="dashboard-stat-amount" style={{ color: 'var(--color-primary)' }}>
                {periodSummary.savingsRatePercentage !== null
                  ? `${periodSummary.savingsRatePercentage.toFixed(1)}%`
                  : '—'}
              </span>
            </div>
          </div>

          {/* Period Comparison Card */}
          <PeriodComparisonCard
            comparison={comparison}
            currentPeriodLabel={periodLabel}
            previousPeriodLabel={prevPeriodLabel}
          />

          {/* Category Distribution Chart & List */}
          <CategoryDistributionChart
            categories={categories}
            periodLabel={periodLabel}
          />

          {/* Income vs Expenses Trend Chart */}
          <IncomeExpenseTrendChart
            dailySummaries={dailySummaries}
            periodLabel={periodLabel}
          />
        </>
      )}
    </div>
  )
}
