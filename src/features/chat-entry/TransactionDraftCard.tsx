import { useState, useId } from 'react'
import type { Category, Account, TransactionType } from '../../types'
import type { TransactionDraft } from './parseTransaction'
import { paiseToRupees, parseRupeesToPaise } from '../../utils/money'
import { Check, X, AlertCircle } from 'lucide-react'

interface TransactionDraftCardProps {
  draft: TransactionDraft
  categories: readonly Category[]
  accounts: readonly Account[]
  isSaving: boolean
  onConfirm: (confirmedDraft: TransactionDraft) => void
  onCancel: () => void
}

export function TransactionDraftCard({
  draft,
  categories,
  accounts,
  isSaving,
  onConfirm,
  onCancel,
}: TransactionDraftCardProps) {
  const [rupeesInput, setRupeesInput] = useState<string>(() =>
    String(paiseToRupees(draft.amountPaise))
  )
  const [type, setType] = useState<TransactionType>(draft.type)
  const [categoryId, setCategoryId] = useState<string | null>(draft.categoryId)
  const [accountId, setAccountId] = useState<string | null>(draft.accountId)
  const [transferToAccountId, setTransferToAccountId] = useState<string | null>(
    draft.transferToAccountId ?? null
  )
  const [transactionDate, setTransactionDate] = useState<string>(draft.transactionDate)
  const [description, setDescription] = useState<string>(draft.description)
  const [cardError, setCardError] = useState<string | null>(null)

  const amountId = useId()
  const typeId = useId()
  const categorySelectId = useId()
  const accountSelectId = useId()
  const destAccountSelectId = useId()
  const dateId = useId()
  const descId = useId()

  const availableCategories = categories.filter(
    (c) => !c.isArchived && (type === 'refund' || c.type === type)
  )
  const activeAccounts = accounts.filter((a) => !a.isArchived)

  const handleConfirm = () => {
    setCardError(null)

    // Validate amount
    let resolvedPaise: number
    try {
      resolvedPaise = parseRupeesToPaise(rupeesInput)
    } catch {
      setCardError('Please enter a valid positive rupee amount.')
      return
    }

    // Validate accounts
    if (!accountId) {
      setCardError('Please select an account.')
      return
    }

    if (type === 'transfer') {
      if (!transferToAccountId) {
        setCardError('Please select a destination account for the transfer.')
        return
      }
      if (accountId === transferToAccountId) {
        setCardError('Source and destination accounts must be different.')
        return
      }
    }

    // Validate Category (for non-transfer)
    if (type !== 'transfer' && !categoryId && type !== 'refund') {
      setCardError('Please select a category.')
      return
    }

    const confirmed: TransactionDraft = {
      type,
      amountPaise: resolvedPaise,
      categoryId: type === 'transfer' ? null : categoryId,
      accountId,
      transferToAccountId: type === 'transfer' ? transferToAccountId : null,
      description: description.trim() || 'Transaction',
      transactionDate,
      source: 'chat',
      originalText: draft.originalText,
      refundOfId: draft.refundOfId ?? null,
    }

    onConfirm(confirmed)
  }

  const badgeClass =
    type === 'expense'
      ? 'badge-expense'
      : type === 'income'
        ? 'badge-income'
        : type === 'refund'
          ? 'badge-refund'
          : 'badge-transfer'

  return (
    <div className="chat-card" role="region" aria-label="Transaction Review Card">
      <div className="chat-card-header">
        <span className="chat-card-title">Review Transaction</span>
        <span className={`chat-card-badge ${badgeClass}`}>{type}</span>
      </div>

      {cardError && (
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
          <span>{cardError}</span>
        </div>
      )}

      {/* Amount in Rupees */}
      <div className="chat-form-row">
        <label className="chat-label" htmlFor={amountId}>Amount (₹)</label>
        <input
          id={amountId}
          type="number"
          step="0.01"
          min="0.01"
          className="chat-input-field"
          value={rupeesInput}
          onChange={(e) => setRupeesInput(e.target.value)}
          disabled={isSaving}
          aria-label="Amount in rupees"
        />
      </div>

      {/* Transaction Type */}
      <div className="chat-form-row">
        <label className="chat-label" htmlFor={typeId}>Type</label>
        <select
          id={typeId}
          className="chat-select-field"
          value={type}
          onChange={(e) => {
            const newType = e.target.value as TransactionType
            setType(newType)
            // Reset category if incompatible
            setCategoryId(null)
          }}
          disabled={isSaving}
          aria-label="Transaction Type"
        >
          <option value="expense">Expense</option>
          <option value="income">Income</option>
          <option value="refund">Refund</option>
          <option value="transfer">Transfer</option>
        </select>
      </div>

      {/* Category (if not transfer) */}
      {type !== 'transfer' && (
        <div className="chat-form-row">
          <label className="chat-label" htmlFor={categorySelectId}>Category</label>
          <select
            id={categorySelectId}
            className="chat-select-field"
            value={categoryId ?? ''}
            onChange={(e) => setCategoryId(e.target.value || null)}
            disabled={isSaving}
            aria-label="Category"
          >
            <option value="">Select Category...</option>
            {availableCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Account(s) */}
      {type === 'transfer' ? (
        <>
          <div className="chat-form-row">
            <label className="chat-label" htmlFor={accountSelectId}>Source Account (From)</label>
            <select
              id={accountSelectId}
              className="chat-select-field"
              value={accountId ?? ''}
              onChange={(e) => setAccountId(e.target.value || null)}
              disabled={isSaving}
              aria-label="Source Account"
            >
              <option value="">Select Source Account...</option>
              {activeAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="chat-form-row">
            <label className="chat-label" htmlFor={destAccountSelectId}>Destination Account (To)</label>
            <select
              id={destAccountSelectId}
              className="chat-select-field"
              value={transferToAccountId ?? ''}
              onChange={(e) => setTransferToAccountId(e.target.value || null)}
              disabled={isSaving}
              aria-label="Destination Account"
            >
              <option value="">Select Destination Account...</option>
              {activeAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        </>
      ) : (
        <div className="chat-form-row">
          <label className="chat-label" htmlFor={accountSelectId}>Account</label>
          <select
            id={accountSelectId}
            className="chat-select-field"
            value={accountId ?? ''}
            onChange={(e) => setAccountId(e.target.value || null)}
            disabled={isSaving}
            aria-label="Account"
          >
            <option value="">Select Account...</option>
            {activeAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Date */}
      <div className="chat-form-row">
        <label className="chat-label" htmlFor={dateId}>Date</label>
        <input
          id={dateId}
          type="date"
          className="chat-input-field"
          value={transactionDate}
          onChange={(e) => setTransactionDate(e.target.value)}
          disabled={isSaving}
          aria-label="Transaction Date"
        />
      </div>

      {/* Description */}
      <div className="chat-form-row">
        <label className="chat-label" htmlFor={descId}>Description</label>
        <input
          id={descId}
          type="text"
          maxLength={300}
          className="chat-input-field"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={isSaving}
          aria-label="Description"
        />
      </div>

      {/* Actions */}
      <div className="chat-card-actions">
        <button
          type="button"
          className="btn-primary"
          onClick={handleConfirm}
          disabled={isSaving}
          aria-label="Confirm & Save"
        >
          <Check size={18} />
          <span>{isSaving ? 'Saving...' : 'Confirm & Save'}</span>
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={onCancel}
          disabled={isSaving}
          aria-label="Discard"
        >
          <X size={18} />
          <span>Discard</span>
        </button>
      </div>
    </div>
  )
}
