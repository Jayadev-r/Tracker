import { useState, useEffect, useMemo } from 'react'
import type { Category, Account, Transaction, TransactionType } from '../../types'
import type { TransactionService } from '../../services/transactionService'
import { parseRupeesToPaise } from '../../utils/money'
import { getLocalTodayDateString, isValidLocalDateString } from '../../utils/dates'
import { X, Check, AlertCircle } from 'lucide-react'

export interface AddTransactionModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (transaction: Transaction) => void
  categories: readonly Category[]
  accounts: readonly Account[]
  defaultAccountId?: string | null
  initialDate?: string
  txService: TransactionService
}

export function AddTransactionModal({
  isOpen,
  onClose,
  onSuccess,
  categories,
  accounts,
  defaultAccountId,
  initialDate,
  txService,
}: AddTransactionModalProps) {
  const today = useMemo(() => getLocalTodayDateString(), [])

  // Form states
  const [type, setType] = useState<TransactionType>('expense')
  const [amountInput, setAmountInput] = useState<string>('')
  const [categoryId, setCategoryId] = useState<string>('')
  const [accountId, setAccountId] = useState<string>('')
  const [transactionDate, setTransactionDate] = useState<string>(today)
  const [description, setDescription] = useState<string>('')

  // UI & Validation states
  const [isSaving, setIsSaving] = useState<boolean>(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<{
    amount?: string
    category?: string
    account?: string
    date?: string
  }>({})

  // Active accounts list
  const activeAccounts = useMemo(() => {
    return accounts.filter((a) => !a.isArchived)
  }, [accounts])

  // Filter categories matching current transaction type
  const filteredCategories = useMemo(() => {
    return categories.filter((c) => !c.isArchived && c.type === type)
  }, [categories, type])

  // Initialize/reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setType('expense')
      setAmountInput('')
      setDescription('')
      setErrorMessage(null)
      setFieldErrors({})

      // Initialize date: default to initialDate if valid and not future, otherwise today
      if (initialDate && isValidLocalDateString(initialDate) && initialDate <= today) {
        setTransactionDate(initialDate)
      } else {
        setTransactionDate(today)
      }

      // Initialize account: defaultAccountId or first active account
      if (defaultAccountId && activeAccounts.some((a) => a.id === defaultAccountId)) {
        setAccountId(defaultAccountId)
      } else if (activeAccounts.length > 0) {
        setAccountId(activeAccounts[0]?.id ?? '')
      } else {
        setAccountId('')
      }
    }
  }, [isOpen, initialDate, today, defaultAccountId, activeAccounts])

  // Keep category in sync with the current transaction type
  useEffect(() => {
    if (isOpen) {
      const available = categories.filter((c) => !c.isArchived && c.type === type)
      if (available.length > 0) {
        // If current category is not in the filtered list, select the first available
        if (!available.some((c) => c.id === categoryId)) {
          setCategoryId(available[0]?.id ?? '')
        }
      } else {
        setCategoryId('')
      }
    }
  }, [type, categories, isOpen])

  if (!isOpen) {
    return null
  }

  const handleTypeChange = (newType: TransactionType) => {
    if (isSaving) return
    setType(newType)
    setErrorMessage(null)
    setFieldErrors((prev) => ({ ...prev, category: undefined }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSaving) return

    setErrorMessage(null)
    const errors: { amount?: string; category?: string; account?: string; date?: string } = {}

    // 1. Validate Amount
    let resolvedPaise = 0
    if (!amountInput.trim()) {
      errors.amount = 'Please enter an amount.'
    } else {
      try {
        resolvedPaise = parseRupeesToPaise(amountInput.trim())
        if (resolvedPaise <= 0) {
          errors.amount = 'Amount must be greater than zero.'
        }
      } catch (err) {
        errors.amount = err instanceof Error ? err.message : 'Please enter a valid rupee amount with up to 2 decimal places.'
      }
    }

    // 2. Validate Category
    if (!categoryId) {
      errors.category = 'Please select a category.'
    }

    // 3. Validate Account
    if (!accountId) {
      errors.account = 'Please select an account.'
    }

    // 4. Validate Date
    if (!transactionDate || !isValidLocalDateString(transactionDate)) {
      errors.date = 'Please enter a valid date in YYYY-MM-DD format.'
    } else if (transactionDate > today) {
      errors.date = 'Future dates are not allowed. Please select today or a past date.'
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }

    // All validation passed, proceed to save
    setIsSaving(true)
    setFieldErrors({})

    try {
      const createdTx = await txService.createTransaction({
        type,
        amountPaise: resolvedPaise,
        categoryId: categoryId || null,
        accountId,
        transactionDate,
        description: description.trim(),
        source: 'form',
      })

      // Notify parent & close modal
      onSuccess(createdTx)
      onClose()
    } catch (err) {
      // Keep modal open, preserve all user entered values, and display the error
      console.error('Failed to create transaction', err)
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to save transaction. Please check your inputs and try again.'
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div
      className="modal-backdrop"
      onClick={isSaving ? undefined : onClose}
      role="presentation"
    >
      <div
        className="modal-sheet add-tx-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-tx-modal-title"
      >
        {/* Header */}
        <div className="modal-header">
          <h3 id="add-tx-modal-title" className="modal-title">
            Add Transaction
          </h3>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            disabled={isSaving}
            aria-label="Close add transaction modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* Global Error Banner */}
        {errorMessage && (
          <div
            className="alert-banner danger"
            role="alert"
            style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 'var(--space-xs)' }}
          >
            <AlertCircle size={16} flex-shrink={0} />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
          {/* Top: Transaction Type Selector */}
          <div className="form-group">
            <span className="form-label" id="tx-type-label">Transaction Type</span>
            <div className="add-tx-type-selector" role="radiogroup" aria-labelledby="tx-type-label">
              <button
                type="button"
                role="radio"
                aria-checked={type === 'expense'}
                className={`add-tx-type-btn ${type === 'expense' ? 'active-expense' : ''}`}
                onClick={() => handleTypeChange('expense')}
                disabled={isSaving}
              >
                Expense
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={type === 'income'}
                className={`add-tx-type-btn ${type === 'income' ? 'active-income' : ''}`}
                onClick={() => handleTypeChange('income')}
                disabled={isSaving}
              >
                Income
              </button>
            </div>
          </div>

          {/* Amount Field */}
          <div className="form-group">
            <label htmlFor="add-tx-amount" className="form-label">
              Amount (₹) <span aria-hidden="true" style={{ color: 'var(--color-expense)' }}>*</span>
            </label>
            <div className="add-tx-amount-wrapper">
              <span className="add-tx-currency-symbol" aria-hidden="true">₹</span>
              <input
                id="add-tx-amount"
                type="number"
                step="0.01"
                min="0.01"
                inputMode="decimal"
                placeholder="0.00"
                className="form-input add-tx-amount-input"
                value={amountInput}
                onChange={(e) => {
                  setAmountInput(e.target.value)
                  if (fieldErrors.amount) {
                    setFieldErrors((prev) => ({ ...prev, amount: undefined }))
                  }
                }}
                disabled={isSaving}
                autoFocus
                required
              />
            </div>
            {fieldErrors.amount && (
              <span className="form-error-msg" role="alert">{fieldErrors.amount}</span>
            )}
          </div>

          {/* Category Dropdown */}
          <div className="form-group">
            <label htmlFor="add-tx-category" className="form-label">
              Category <span aria-hidden="true" style={{ color: 'var(--color-expense)' }}>*</span>
            </label>
            <select
              id="add-tx-category"
              className="form-select"
              value={categoryId}
              onChange={(e) => {
                setCategoryId(e.target.value)
                if (fieldErrors.category) {
                  setFieldErrors((prev) => ({ ...prev, category: undefined }))
                }
              }}
              disabled={isSaving}
              required
            >
              {filteredCategories.length === 0 ? (
                <option value="" disabled>No categories available</option>
              ) : (
                filteredCategories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))
              )}
            </select>
            {fieldErrors.category && (
              <span className="form-error-msg" role="alert">{fieldErrors.category}</span>
            )}
          </div>

          {/* Date Field */}
          <div className="form-group">
            <label htmlFor="add-tx-date" className="form-label">
              Date <span aria-hidden="true" style={{ color: 'var(--color-expense)' }}>*</span>
            </label>
            <input
              id="add-tx-date"
              type="date"
              max={today}
              className="form-input"
              value={transactionDate}
              onChange={(e) => {
                setTransactionDate(e.target.value)
                if (fieldErrors.date) {
                  setFieldErrors((prev) => ({ ...prev, date: undefined }))
                }
              }}
              disabled={isSaving}
              required
            />
            {fieldErrors.date && (
              <span className="form-error-msg" role="alert">{fieldErrors.date}</span>
            )}
          </div>

          {/* Account Dropdown */}
          <div className="form-group">
            <label htmlFor="add-tx-account" className="form-label">
              Account <span aria-hidden="true" style={{ color: 'var(--color-expense)' }}>*</span>
            </label>
            <select
              id="add-tx-account"
              className="form-select"
              value={accountId}
              onChange={(e) => {
                setAccountId(e.target.value)
                if (fieldErrors.account) {
                  setFieldErrors((prev) => ({ ...prev, account: undefined }))
                }
              }}
              disabled={isSaving}
              required
            >
              {activeAccounts.length === 0 ? (
                <option value="" disabled>No accounts available</option>
              ) : (
                activeAccounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({acc.type})
                  </option>
                ))
              )}
            </select>
            {fieldErrors.account && (
              <span className="form-error-msg" role="alert">{fieldErrors.account}</span>
            )}
          </div>

          {/* Description Field (Optional) */}
          <div className="form-group">
            <label htmlFor="add-tx-description" className="form-label">
              Description <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>(optional)</span>
            </label>
            <input
              id="add-tx-description"
              type="text"
              placeholder="e.g. Dinner with team"
              className="form-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isSaving}
              maxLength={200}
            />
          </div>

          {/* Actions */}
          <div className="modal-actions" style={{ marginTop: 'var(--space-xs)', gap: 'var(--space-sm)' }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              disabled={isSaving}
              style={{ minHeight: '44px', padding: '0.6rem 1.25rem' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={isSaving}
              style={{ minHeight: '44px', padding: '0.6rem 1.5rem', flex: 2 }}
            >
              <Check size={16} />
              <span>{isSaving ? 'Saving...' : 'Save Transaction'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
