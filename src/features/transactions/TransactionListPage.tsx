import { useState, useEffect, useMemo, useCallback } from 'react'
import type { PaisaTrackDatabase } from '../../db/database'
import { db as defaultDb } from '../../db/database'
import { TransactionService } from '../../services/transactionService'
import type { Category, Account, Transaction } from '../../types'
import {
  type DisplayTransactionItem,
  groupTransactionsForDisplay,
} from './types'
import { TransactionItem } from './TransactionItem'
import {
  TransactionFilterBar,
  type FilterState,
  INITIAL_FILTER_STATE,
} from './TransactionFilterBar'
import { TransactionDetailModal } from './TransactionDetailModal'
import { Inbox, SearchX } from 'lucide-react'
import './transactions.css'

interface TransactionListPageProps {
  database?: PaisaTrackDatabase
  refreshTrigger?: number
  onTransactionMutated?: () => void
}

export function TransactionListPage({
  database = defaultDb,
  refreshTrigger = 0,
  onTransactionMutated,
}: TransactionListPageProps) {
  const txService = useMemo(() => new TransactionService(database), [database])

  const [categories, setCategories] = useState<Category[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [filters, setFilters] = useState<FilterState>(INITIAL_FILTER_STATE)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [hasAnyTransactionsInDb, setHasAnyTransactionsInDb] = useState<boolean>(false)

  // Selected item for modal
  const [selectedItem, setSelectedItem] = useState<DisplayTransactionItem | null>(null)
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false)

  // Load categories and accounts once or when database changes
  useEffect(() => {
    let isMounted = true
    const loadMetadata = async () => {
      try {
        const [cats, accs] = await Promise.all([
          database.categories.toArray(),
          database.accounts.toArray(),
        ])
        if (isMounted) {
          setCategories(cats)
          setAccounts(accs)
        }
      } catch (err) {
        console.error('Failed to load metadata in TransactionListPage', err)
      }
    }
    loadMetadata()
    return () => {
      isMounted = false
    }
  }, [database])

  // Fetch transactions based on filters
  const loadTransactions = useCallback(async () => {
    setIsLoading(true)
    try {
      const [allCount, results] = await Promise.all([
        database.transactions.count(),
        txService.listTransactions({
          type: filters.type !== 'all' ? filters.type : undefined,
          categoryId: filters.categoryId !== 'all' ? filters.categoryId : undefined,
          accountId: filters.accountId !== 'all' ? filters.accountId : undefined,
          startDate: filters.startDate || undefined,
          endDate: filters.endDate || undefined,
          search: filters.search || undefined,
          sortBy: filters.sortBy,
          order: filters.order,
        }),
      ])
      setHasAnyTransactionsInDb(allCount > 0)
      setTransactions(results)
    } catch (err) {
      console.error('Failed to list transactions', err)
    } finally {
      setIsLoading(false)
    }
  }, [database, txService, filters])

  useEffect(() => {
    loadTransactions()
  }, [loadTransactions, refreshTrigger])

  const displayItems = useMemo(() => {
    return groupTransactionsForDisplay(transactions, accounts, categories)
  }, [transactions, accounts, categories])

  const handleItemClick = (item: DisplayTransactionItem) => {
    if (item.kind === 'malformed_transfer') return
    setSelectedItem(item)
    setIsModalOpen(true)
  }

  const handleUpdated = () => {
    loadTransactions()
    onTransactionMutated?.()
  }

  const handleDeleted = () => {
    loadTransactions()
    onTransactionMutated?.()
  }

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
    <div className="tx-list-container">
      {/* Header */}
      <div className="tx-list-header">
        <h2 className="tx-list-title">Transaction History</h2>
        <span className="tx-count-badge">
          {displayItems.length} {displayItems.length === 1 ? 'entry' : 'entries'}
        </span>
      </div>

      {/* Filter and Search Bar */}
      <TransactionFilterBar
        filters={filters}
        categories={categories}
        accounts={accounts}
        onChange={setFilters}
        onReset={() => setFilters(INITIAL_FILTER_STATE)}
      />

      {/* Content Area */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--color-text-secondary)' }}>
          Loading transactions...
        </div>
      ) : displayItems.length === 0 ? (
        <div className="tx-empty-state">
          {hasAnyTransactionsInDb && hasActiveFilters ? (
            <>
              <div className="tx-empty-icon">
                <SearchX size={32} />
              </div>
              <p className="tx-empty-title">No transactions match your filters</p>
              <p className="tx-empty-desc">
                Try loosening your search term or adjusting filter options to find what you're looking for.
              </p>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setFilters(INITIAL_FILTER_STATE)}
                style={{ marginTop: 'var(--space-xs)' }}
              >
                Clear all filters
              </button>
            </>
          ) : (
            <>
              <div className="tx-empty-icon">
                <Inbox size={32} />
              </div>
              <p className="tx-empty-title">No transactions recorded yet</p>
              <p className="tx-empty-desc">
                Use Quick Add or the Calendar to track your first income, expense, or transfer.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="tx-items-list" role="feed" aria-label="Transactions list">
          {displayItems.map((item) => {
            const key =
              item.kind === 'standard'
                ? item.transaction.id
                : item.transferGroupId
            return (
              <TransactionItem
                key={key}
                item={item}
                onClick={handleItemClick}
              />
            )
          })}
        </div>
      )}

      {/* Detail / Edit Modal */}
      <TransactionDetailModal
        item={selectedItem}
        categories={categories}
        accounts={accounts}
        isOpen={isModalOpen}
        txService={txService}
        onClose={() => {
          setIsModalOpen(false)
          setSelectedItem(null)
        }}
        onUpdated={handleUpdated}
        onDeleted={handleDeleted}
      />
    </div>
  )
}
