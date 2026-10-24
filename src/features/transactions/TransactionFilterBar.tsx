import { useState, useId } from 'react'
import type { Category, Account, TransactionType } from '../../types'
import { Filter } from 'lucide-react'

export interface FilterState {
  search: string
  type: TransactionType | 'all'
  categoryId: string | 'all'
  accountId: string | 'all'
  startDate: string
  endDate: string
  sortBy: 'transactionDate' | 'amountPaise'
  order: 'asc' | 'desc'
}

export const INITIAL_FILTER_STATE: FilterState = {
  search: '',
  type: 'all',
  categoryId: 'all',
  accountId: 'all',
  startDate: '',
  endDate: '',
  sortBy: 'transactionDate',
  order: 'desc',
}

interface TransactionFilterBarProps {
  filters: FilterState
  categories: readonly Category[]
  accounts: readonly Account[]
  onChange: (filters: FilterState) => void
  onReset: () => void
}

export function TransactionFilterBar({
  filters,
  categories,
  accounts,
  onChange,
  onReset,
}: TransactionFilterBarProps) {
  const [isExpanded, setIsExpanded] = useState<boolean>(false)

  const searchId = useId()
  const typeId = useId()
  const categoryId = useId()
  const accountId = useId()
  const startDateId = useId()
  const endDateId = useId()
  const sortId = useId()

  const activeCategories = categories.filter((c) => !c.isArchived)
  const activeAccounts = accounts.filter((a) => !a.isArchived)

  const hasActiveFilters =
    filters.search !== '' ||
    filters.type !== 'all' ||
    filters.categoryId !== 'all' ||
    filters.accountId !== 'all' ||
    filters.startDate !== '' ||
    filters.endDate !== '' ||
    filters.order !== 'desc' ||
    filters.sortBy !== 'transactionDate'

  return (
    <div className="tx-filter-container">
      {/* Search Input Always Visible */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <label htmlFor={searchId} className="sr-only" style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', border: 0 }}>
            Search description
          </label>
          <input
            id={searchId}
            type="text"
            className="tx-search-input"
            value={filters.search}
            onChange={(e) => onChange({ ...filters, search: e.target.value })}
            placeholder="Search description..."
            aria-label="Search description"
          />
        </div>
        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          className="btn-secondary"
          style={{ minHeight: '40px', padding: '0 var(--space-sm)', flex: 'none', display: 'flex', alignItems: 'center', gap: 'var(--space-2xs)' }}
          aria-expanded={isExpanded}
          aria-label="Toggle advanced filters"
        >
          <Filter size={16} />
          <span>Filters</span>
        </button>
      </div>

      {/* Advanced Filter Controls */}
      {isExpanded && (
        <div className="tx-filter-row">
          {/* Type Filter */}
          <select
            id={typeId}
            className="tx-filter-select"
            value={filters.type}
            onChange={(e) => onChange({ ...filters, type: e.target.value as TransactionType | 'all' })}
            aria-label="Filter by type"
          >
            <option value="all">All Types</option>
            <option value="expense">Expenses</option>
            <option value="income">Income</option>
            <option value="refund">Refunds</option>
            <option value="transfer">Transfers</option>
          </select>

          {/* Category Filter */}
          <select
            id={categoryId}
            className="tx-filter-select"
            value={filters.categoryId}
            onChange={(e) => onChange({ ...filters, categoryId: e.target.value })}
            aria-label="Filter by category"
          >
            <option value="all">All Categories</option>
            {activeCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          {/* Account Filter */}
          <select
            id={accountId}
            className="tx-filter-select"
            value={filters.accountId}
            onChange={(e) => onChange({ ...filters, accountId: e.target.value })}
            aria-label="Filter by account"
          >
            <option value="all">All Accounts</option>
            {activeAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>

          {/* Date Range Filters */}
          <div style={{ display: 'flex', gap: 'var(--space-2xs)', width: '100%' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <label htmlFor={startDateId} style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                From
              </label>
              <input
                id={startDateId}
                type="date"
                className="tx-filter-select"
                value={filters.startDate}
                onChange={(e) => onChange({ ...filters, startDate: e.target.value })}
                aria-label="Filter from date"
              />
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <label htmlFor={endDateId} style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                To
              </label>
              <input
                id={endDateId}
                type="date"
                className="tx-filter-select"
                value={filters.endDate}
                onChange={(e) => onChange({ ...filters, endDate: e.target.value })}
                aria-label="Filter to date"
              />
            </div>
          </div>

          {/* Sort By */}
          <select
            id={sortId}
            className="tx-filter-select"
            value={`${filters.sortBy}-${filters.order}`}
            onChange={(e) => {
              const [sb, ord] = e.target.value.split('-') as ['transactionDate' | 'amountPaise', 'asc' | 'desc']
              onChange({ ...filters, sortBy: sb, order: ord })
            }}
            aria-label="Sort transactions"
          >
            <option value="transactionDate-desc">Date (Newest first)</option>
            <option value="transactionDate-asc">Date (Oldest first)</option>
            <option value="amountPaise-desc">Amount (High to Low)</option>
            <option value="amountPaise-asc">Amount (Low to High)</option>
          </select>

          {/* Reset Action */}
          {hasActiveFilters && (
            <button
              type="button"
              className="tx-reset-btn"
              onClick={onReset}
              aria-label="Reset all filters"
            >
              Reset Filters
            </button>
          )}
        </div>
      )}
    </div>
  )
}
