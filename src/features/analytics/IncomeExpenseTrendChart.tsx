import type { DailySummary } from '../../services/reportingService'
import { formatPaise } from '../../utils/money'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { BarChart3 } from 'lucide-react'

interface IncomeExpenseTrendChartProps {
  dailySummaries: DailySummary[]
  periodLabel: string
}

export function IncomeExpenseTrendChart({
  dailySummaries,
  periodLabel,
}: IncomeExpenseTrendChartProps) {
  // Filter for days that have either income, expenses, or refunds
  const activeDays = dailySummaries.filter(
    (d) => d.incomePaise > 0 || d.grossExpensesPaise > 0 || d.refundsPaise > 0
  )

  if (activeDays.length === 0) {
    return (
      <div className="analytics-card" role="region" aria-label="Income and Expenses Trend">
        <div className="analytics-card-header">
          <h3 className="analytics-card-title">Income & Expenses Trend</h3>
          <span className="analytics-card-badge">{periodLabel}</span>
        </div>
        <div className="analytics-empty-state">
          <BarChart3 size={32} />
          <span>No activity recorded for {periodLabel}.</span>
        </div>
      </div>
    )
  }

  // Format data for Recharts (convert paise to rupees for axes/tooltips)
  const chartData = activeDays.map((d) => {
    // Show only day/month on x-axis, e.g. "24 Oct"
    const parts = d.date.split('-')
    const shortLabel = parts.length === 3 ? `${parts[2]}/${parts[1]}` : d.date
    return {
      date: shortLabel,
      fullDate: d.date,
      income: d.incomePaise / 100,
      netExpenses: Math.max(0, d.netExpensesPaise / 100),
      rawIncomePaise: d.incomePaise,
      rawNetExpensesPaise: d.netExpensesPaise,
    }
  })

  return (
    <div className="analytics-card" role="region" aria-label="Income and Expenses Trend">
      <div className="analytics-card-header">
        <h3 className="analytics-card-title">Income & Expenses Trend</h3>
        <span className="analytics-card-badge">{periodLabel}</span>
      </div>

      {/* Chart visualization */}
      <div style={{ width: '100%', height: 220, position: 'relative' }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--color-text-secondary)' }} />
            <YAxis tick={{ fontSize: 10, fill: 'var(--color-text-secondary)' }} />
            <Tooltip
              formatter={(val) => [
                val !== undefined && val !== null ? `₹${Number(val).toFixed(2)}` : '',
              ]}
              labelFormatter={(label, payload) => {
                const item = payload[0]?.payload as { fullDate?: string } | undefined
                return item?.fullDate ?? label
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: '0.75rem', paddingTop: '8px' }}
            />
            <Bar dataKey="income" name="Income" fill="#10b981" radius={[3, 3, 0, 0]} />
            <Bar dataKey="netExpenses" name="Net Expenses" fill="#f43f5e" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Accessible Activity Table */}
      <table className="trend-summary-table" aria-label="Daily trend data table">
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col" style={{ textAlign: 'right' }}>Income</th>
            <th scope="col" style={{ textAlign: 'right' }}>Net Expenses</th>
          </tr>
        </thead>
        <tbody>
          {activeDays.slice(-7).map((d) => (
            <tr key={d.date}>
              <td>{d.date}</td>
              <td className="amount-col" style={{ color: 'var(--color-income)' }}>
                {d.incomePaise > 0 ? `+ ${formatPaise(d.incomePaise)}` : '—'}
              </td>
              <td className="amount-col" style={{ color: 'var(--color-expense)' }}>
                {d.netExpensesPaise !== 0 ? formatPaise(d.netExpensesPaise) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
