import type { PeriodComparison } from '../../services/reportingService'
import { formatPaise } from '../../utils/money'
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react'

interface PeriodComparisonCardProps {
  comparison: PeriodComparison | null
  currentPeriodLabel: string
  previousPeriodLabel: string
}

export function PeriodComparisonCard({
  comparison,
  currentPeriodLabel,
  previousPeriodLabel,
}: PeriodComparisonCardProps) {
  if (!comparison) return null

  const {
    netExpenseChangePaise,
    netExpenseChangePercentage,
    incomeChangePaise,
    incomeChangePercentage,
    currentPeriod,
    previousPeriod,
  } = comparison

  // Expense change styling: lower expenses is favorable (green), higher expenses is unfavorable (red)
  const isExpenseFavorable = netExpenseChangePaise < 0
  const isExpenseUnfavorable = netExpenseChangePaise > 0

  // Income change styling: higher income is favorable (green), lower income is unfavorable (red)
  const isIncomeFavorable = incomeChangePaise > 0
  const isIncomeUnfavorable = incomeChangePaise < 0

  return (
    <div className="analytics-card" role="region" aria-label="Period Comparison">
      <div className="analytics-card-header">
        <h3 className="analytics-card-title">Comparison vs. Previous Period</h3>
        <span className="analytics-card-badge">
          {currentPeriodLabel} vs {previousPeriodLabel}
        </span>
      </div>

      <div className="comparison-grid">
        {/* Net Expenses Comparison Box */}
        <div className="comparison-box">
          <span className="comparison-box-label">Net Expenses</span>
          <span className="comparison-box-val">
            {formatPaise(currentPeriod.netExpensesPaise)}
          </span>
          <span
            className={`comparison-box-delta ${
              isExpenseFavorable
                ? 'delta-favorable'
                : isExpenseUnfavorable
                ? 'delta-unfavorable'
                : 'delta-neutral'
            }`}
          >
            {isExpenseUnfavorable ? (
              <ArrowUpRight size={14} />
            ) : isExpenseFavorable ? (
              <ArrowDownRight size={14} />
            ) : (
              <Minus size={14} />
            )}
            <span>
              {netExpenseChangePaise > 0 ? '+ ' : ''}
              {formatPaise(netExpenseChangePaise)}
              {netExpenseChangePercentage !== null
                ? ` (${netExpenseChangePercentage > 0 ? '+' : ''}${netExpenseChangePercentage.toFixed(1)}%)`
                : ''}
            </span>
          </span>
          <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
            Prev: {formatPaise(previousPeriod.netExpensesPaise)}
          </span>
        </div>

        {/* Income Comparison Box */}
        <div className="comparison-box">
          <span className="comparison-box-label">Income</span>
          <span className="comparison-box-val">
            {formatPaise(currentPeriod.incomePaise)}
          </span>
          <span
            className={`comparison-box-delta ${
              isIncomeFavorable
                ? 'delta-favorable'
                : isIncomeUnfavorable
                ? 'delta-unfavorable'
                : 'delta-neutral'
            }`}
          >
            {isIncomeFavorable ? (
              <ArrowUpRight size={14} />
            ) : isIncomeUnfavorable ? (
              <ArrowDownRight size={14} />
            ) : (
              <Minus size={14} />
            )}
            <span>
              {incomeChangePaise > 0 ? '+ ' : ''}
              {formatPaise(incomeChangePaise)}
              {incomeChangePercentage !== null
                ? ` (${incomeChangePercentage > 0 ? '+' : ''}${incomeChangePercentage.toFixed(1)}%)`
                : ''}
            </span>
          </span>
          <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
            Prev: {formatPaise(previousPeriod.incomePaise)}
          </span>
        </div>
      </div>
    </div>
  )
}
