import type { DisplayTransactionItem } from './types'
import { formatPaise } from '../../utils/money'
import {
  ArrowDownLeft,
  ArrowUpRight,
  RotateCcw,
  ArrowRightLeft,
  AlertTriangle,
} from 'lucide-react'

interface TransactionItemProps {
  item: DisplayTransactionItem
  onClick: (item: DisplayTransactionItem) => void
}

export function TransactionItem({ item, onClick }: TransactionItemProps) {
  if (item.kind === 'transfer') {
    const fromName = item.sourceAccount?.name ?? 'Unknown'
    const toName = item.destinationAccount?.name ?? 'Unknown'
    return (
      <button
        type="button"
        className="tx-item-btn"
        onClick={() => onClick(item)}
        aria-label={`Transfer of ${formatPaise(item.amountPaise)} from ${fromName} to ${toName}`}
      >
        <div className="tx-item-left">
          <div className="tx-item-icon icon-transfer" aria-hidden="true">
            <ArrowRightLeft size={18} />
          </div>
          <div className="tx-item-details">
            <span className="tx-item-desc">{item.description}</span>
            <span className="tx-item-sub">
              {fromName} → {toName}
            </span>
          </div>
        </div>
        <div className="tx-item-right">
          <span className="tx-item-amount amount-transfer">{formatPaise(item.amountPaise)}</span>
          <span className="tx-item-date">{item.transactionDate}</span>
        </div>
      </button>
    )
  }

  if (item.kind === 'malformed_transfer') {
    return (
      <div
        className="tx-item-btn"
        style={{ borderColor: 'var(--color-warning)' }}
        role="alert"
        aria-label="Incomplete transfer error"
      >
        <div className="tx-item-left">
          <div className="tx-item-icon icon-warning">
            <AlertTriangle size={18} />
          </div>
          <div className="tx-item-details">
            <span className="tx-item-desc" style={{ color: 'var(--color-warning)' }}>
              Incomplete Transfer
            </span>
            <span className="tx-item-sub">{item.error}</span>
          </div>
        </div>
      </div>
    )
  }

  // Standard transaction (income, expense, or refund)
  const tx = item.transaction
  const categoryName = item.category?.name ?? (tx.type === 'income' ? 'Income' : 'Expense')
  const accountName = item.account?.name ?? 'Account'

  let iconNode = <ArrowUpRight size={18} />
  let iconClass = 'icon-expense'
  let amountClass = 'amount-expense'
  let amountPrefix = '- '

  if (tx.type === 'income') {
    iconNode = <ArrowDownLeft size={18} />
    iconClass = 'icon-income'
    amountClass = 'amount-income'
    amountPrefix = '+ '
  } else if (tx.type === 'refund') {
    iconNode = <RotateCcw size={18} />
    iconClass = 'icon-refund'
    amountClass = 'amount-refund'
    amountPrefix = '+ '
  }

  return (
    <button
      type="button"
      className="tx-item-btn"
      onClick={() => onClick(item)}
      aria-label={`${tx.type} of ${formatPaise(tx.amountPaise)} for ${categoryName}`}
    >
      <div className="tx-item-left">
        <div className={`tx-item-icon ${iconClass}`} aria-hidden="true">
          {iconNode}
        </div>
        <div className="tx-item-details">
          <span className="tx-item-desc">{tx.description || categoryName}</span>
          <span className="tx-item-sub">
            {categoryName} • {accountName}
          </span>
        </div>
      </div>
      <div className="tx-item-right">
        <span className={`tx-item-amount ${amountClass}`}>
          {amountPrefix}
          {formatPaise(tx.amountPaise)}
        </span>
        <span className="tx-item-date">{tx.transactionDate}</span>
      </div>
    </button>
  )
}
