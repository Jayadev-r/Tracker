import { useState, useEffect } from 'react'
import type { DisplayTransactionItem } from './types'
import type { Category, Account } from '../../types'
import type { TransactionService } from '../../services/transactionService'
import { paiseToRupees, parseRupeesToPaise } from '../../utils/money'
import { X, Trash2, Check, AlertCircle } from 'lucide-react'

interface TransactionDetailModalProps {
  item: DisplayTransactionItem | null
  categories: readonly Category[]
  accounts: readonly Account[]
  isOpen: boolean
  txService: TransactionService
  onClose: () => void
  onUpdated: () => void
  onDeleted: () => void
}

export function TransactionDetailModal({
  item,
  categories,
  accounts,
  isOpen,
  txService,
  onClose,
  onUpdated,
  onDeleted,
}: TransactionDetailModalProps) {
  const [rupeesInput, setRupeesInput] = useState<string>('')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [accountId, setAccountId] = useState<string | null>(null)
  const [transactionDate, setTransactionDate] = useState<string>('')
  const [description, setDescription] = useState<string>('')
  const [isSaving, setIsSaving] = useState<boolean>(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<boolean>(false)

  useEffect(() => {
    if (item && item.kind === 'standard') {
      const tx = item.transaction
      setRupeesInput(String(paiseToRupees(tx.amountPaise)))
      setCategoryId(tx.categoryId)
      setAccountId(tx.accountId)
      setTransactionDate(tx.transactionDate)
      setDescription(tx.description)
      setErrorMessage(null)
      setConfirmDelete(false)
    } else if (item && item.kind === 'transfer') {
      setRupeesInput(String(paiseToRupees(item.amountPaise)))
      setCategoryId(null)
      setAccountId(item.sourceTransaction.accountId)
      setTransactionDate(item.transactionDate)
      setDescription(item.description)
      setErrorMessage(null)
      setConfirmDelete(false)
    }
  }, [item])

  if (!isOpen || !item || item.kind === 'malformed_transfer') {
    return null
  }

  const isTransfer = item.kind === 'transfer'
  const tx = item.kind === 'standard' ? item.transaction : null
  const txType = isTransfer ? 'transfer' : tx?.type ?? 'expense'

  const availableCategories = categories.filter(
    (c) => !c.isArchived && (txType === 'refund' || c.type === txType)
  )
  const activeAccounts = accounts.filter((a) => !a.isArchived)

  const handleSave = async () => {
    setErrorMessage(null)
    setIsSaving(true)

    try {
      let resolvedPaise: number
      try {
        resolvedPaise = parseRupeesToPaise(rupeesInput)
      } catch {
        setErrorMessage('Please enter a valid positive rupee amount.')
        setIsSaving(false)
        return
      }

      if (isTransfer) {
        await txService.updateTransfer(item.transferGroupId, {
          amountPaise: resolvedPaise,
          transactionDate,
          description: description.trim(),
        })
      } else if (tx) {
        await txService.updateTransaction(tx.id, {
          amountPaise: resolvedPaise,
          categoryId: categoryId ?? null,
          accountId: accountId ?? undefined,
          transactionDate,
          description: description.trim(),
        })
      }

      onUpdated()
      onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update transaction.'
      setErrorMessage(msg)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }

    setErrorMessage(null)
    setIsSaving(true)

    try {
      if (isTransfer) {
        await txService.deleteTransfer(item.transferGroupId)
      } else if (tx) {
        await txService.deleteTransaction(tx.id)
      }

      onDeleted()
      onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete transaction.'
      setErrorMessage(msg)
      setConfirmDelete(false)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSaving) onClose()
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Transaction Details and Editing"
    >
      <div className="modal-sheet">
        <div className="modal-header">
          <span className="modal-title">
            {isTransfer ? 'Transfer Details' : `${txType.toUpperCase()} Details`}
          </span>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            disabled={isSaving}
            aria-label="Close modal"
          >
            <X size={20} />
          </button>
        </div>

        {errorMessage && (
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
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Amount */}
        <div className="chat-form-row">
          <label className="chat-label" htmlFor="modal-amount">Amount (₹)</label>
          <input
            id="modal-amount"
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

        {/* Category (Non-transfer only) */}
        {!isTransfer && (
          <div className="chat-form-row">
            <label className="chat-label" htmlFor="modal-category">Category</label>
            <select
              id="modal-category"
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

        {/* Account Display or Select */}
        {isTransfer ? (
          <div
            style={{
              padding: 'var(--space-xs) var(--space-sm)',
              background: 'var(--color-surface-elevated)',
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--font-size-xs)',
              color: 'var(--color-text-secondary)',
            }}
          >
            <strong>Accounts:</strong> {item.sourceAccount?.name ?? 'Unknown'} →{' '}
            {item.destinationAccount?.name ?? 'Unknown'}
          </div>
        ) : (
          <div className="chat-form-row">
            <label className="chat-label" htmlFor="modal-account">Account</label>
            <select
              id="modal-account"
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
          <label className="chat-label" htmlFor="modal-date">Date</label>
          <input
            id="modal-date"
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
          <label className="chat-label" htmlFor="modal-desc">Description</label>
          <input
            id="modal-desc"
            type="text"
            maxLength={300}
            className="chat-input-field"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={isSaving}
            aria-label="Description"
          />
        </div>

        {/* Timestamps Info */}
        {tx && (
          <div
            style={{
              fontSize: 'var(--font-size-xs)',
              color: 'var(--color-text-muted)',
              display: 'flex',
              flexDirection: 'column',
              gap: '2px',
            }}
          >
            <div>Created: {new Date(tx.createdAt).toLocaleString()}</div>
            <div>Updated: {new Date(tx.updatedAt).toLocaleString()}</div>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)', marginTop: 'var(--space-xs)' }}>
          <button
            type="button"
            className="btn-primary"
            onClick={handleSave}
            disabled={isSaving}
            aria-label="Save changes"
          >
            <Check size={18} />
            <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
          </button>

          <button
            type="button"
            className="btn-danger"
            onClick={handleDelete}
            disabled={isSaving}
            aria-label={confirmDelete ? 'Confirm Permanent Deletion' : 'Delete Transaction'}
          >
            <Trash2 size={18} />
            <span>
              {confirmDelete ? 'Are you sure? Click again to permanently delete' : 'Delete Transaction'}
            </span>
          </button>

          {confirmDelete && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setConfirmDelete(false)}
              disabled={isSaving}
              style={{ width: '100%' }}
            >
              Cancel Deletion
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
