import type { CategorySummary } from '../../services/reportingService'
import { formatPaise } from '../../utils/money'
import { PieChart as PieIcon } from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'

interface CategoryDistributionChartProps {
  categories: CategorySummary[]
  periodLabel: string
}

export function CategoryDistributionChart({
  categories,
  periodLabel,
}: CategoryDistributionChartProps) {
  // Only expense categories with positive net spending
  const expenseCategories = categories.filter(
    (c) => c.categoryType === 'expense' && c.netAmountPaise > 0
  )

  if (expenseCategories.length === 0) {
    return (
      <div className="analytics-card" role="region" aria-label="Category Spending Distribution">
        <div className="analytics-card-header">
          <h3 className="analytics-card-title">Category Spending</h3>
          <span className="analytics-card-badge">{periodLabel}</span>
        </div>
        <div className="analytics-empty-state">
          <PieIcon size={32} />
          <span>No expense transactions recorded for {periodLabel}.</span>
        </div>
      </div>
    )
  }

  // Data formatted for chart display (rupees for tooltips)
  const chartData = expenseCategories.map((c) => ({
    name: c.categoryName,
    value: c.netAmountPaise / 100,
    color: c.color,
    amountFormatted: formatPaise(c.netAmountPaise),
    percentage: c.percentageOfTotal ? c.percentageOfTotal.toFixed(1) : '0.0',
  }))

  return (
    <div className="analytics-card" role="region" aria-label="Category Spending Distribution">
      <div className="analytics-card-header">
        <h3 className="analytics-card-title">Category Spending</h3>
        <span className="analytics-card-badge">{periodLabel}</span>
      </div>

      {/* Visual Chart with Responsive Container */}
      <div style={{ width: '100%', height: 200, position: 'relative' }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={80}
              paddingAngle={3}
              dataKey="value"
              aria-label="Category Spending Pie"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(val) => [
                val !== undefined && val !== null ? `₹${Number(val).toFixed(2)}` : '',
                'Net Amount',
              ]}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Accessible Category Breakdown List */}
      <div className="category-progress-list" role="list" aria-label="Expense categories breakdown">
        {expenseCategories.map((cat) => {
          const pct = cat.percentageOfTotal !== null ? cat.percentageOfTotal : 0
          return (
            <div key={cat.categoryId} className="category-progress-item" role="listitem">
              <div className="category-progress-labels">
                <span className="category-progress-name">
                  <span
                    className="category-progress-dot"
                    style={{ backgroundColor: cat.color }}
                    aria-hidden="true"
                  />
                  <span>{cat.categoryName}</span>
                </span>
                <span className="category-progress-values">
                  <span>{formatPaise(cat.netAmountPaise)}</span>
                  <span style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>
                    ({pct.toFixed(1)}%)
                  </span>
                </span>
              </div>
              <div className="category-progress-track">
                <div
                  className="category-progress-fill"
                  style={{
                    width: `${Math.min(100, Math.max(0, pct))}%`,
                    backgroundColor: cat.color,
                  }}
                  aria-hidden="true"
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
