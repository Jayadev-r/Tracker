import { useState, useEffect, useMemo, useCallback } from 'react'
import type { PaisaTrackDatabase } from '../../db/database'
import { db as defaultDb } from '../../db/database'
import { BudgetService, type BudgetProgress } from '../../services/budgetService'
import type { Category, BudgetPeriod } from '../../types'
import { formatPaise, parseRupeesToPaise } from '../../utils/money'
import { getLocalTodayDateString, getMonthStartLocalDateString, getPreviousMonthLocalDateString, getNextMonthLocalDateString } from '../../utils/dates'
import { Plus, Edit2, Trash2, X, AlertTriangle, AlertCircle, CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react'

interface BudgetManagerProps {
  database?: PaisaTrackDatabase
  onMutated?: () => void
}

export function BudgetManager({
  database = defaultDb,
  onMutated,
}: BudgetManagerProps) {
  const budgetService = useMemo(() => new BudgetService(database), [database])

  const [period] = useState<BudgetPeriod>('monthly')
  const [currentMonthStart, setCurrentMonthStart] = useState<string>(() =>
    getMonthStartLocalDateString(getLocalTodayDateString())
  )

  const [budgetsProgress, setBudgetsProgress] = useState<BudgetProgress[]>([])
  const [expenseCategories, setExpenseCategories] = useState<Category[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false)
  const [editingBudgetProgress, setEditingBudgetProgress] = useState<BudgetProgress | null>(null)
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('')
  const [limitRupeesInput, setLimitRupeesInput] = useState<string>('5000')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setIsLoading(true)
    try {
      const [progressList, allCats] = await Promise.all([
        budgetService.listBudgetProgressForPeriod(currentMonthStart, period),
        database.categories.filter((c) => !c.isArchived && c.type === 'expense').toArray(),
      ])
      setBudgetsProgress(progressList)
      setExpenseCategories(allCats.sort((a, b) => a.name.localeCompare(b.name)))
    } catch (err) {
      console.error('Failed to load budget progress', err)
    } finally {
      setIsLoading(false)
    }
  }, [budgetService, database, currentMonthStart, period])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Filter out categories that already have a budget for this month
  const availableCategories = useMemo(() => {
    const budgetedCatIds = new Set(budgetsProgress.map((p) => p.budget.categoryId))
    return expenseCategories.filter((c) => !budgetedCatIds.has(c.id))
  }, [expenseCategories, budgetsProgress])

  const handlePrevMonth = () => {
    setCurrentMonthStart((prev) => getPreviousMonthLocalDateString(prev))
  }

  const handleNextMonth = () => {
    setCurrentMonthStart((prev) => getNextMonthLocalDateString(prev))
  }

  const openCreateModal = () => {
    setEditingBudgetProgress(null)
    setSelectedCategoryId(availableCategories[0]?.id ?? '')
    setLimitRupeesInput('5000')
    setErrorMessage(null)
    setIsModalOpen(true)
  }

  const openEditModal = (progress: BudgetProgress) => {
    setEditingBudgetProgress(progress)
    setSelectedCategoryId(progress.budget.categoryId)
    setLimitRupeesInput((progress.budget.limitPaise / 100).toString())
    setErrorMessage(null)
    setIsModalOpen(true)
  }

  const handleSaveBudget = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)

    try {
      const limitPaise = parseRupeesToPaise(limitRupeesInput)

      if (editingBudgetProgress) {
        await budgetService.updateBudget(editingBudgetProgress.budget.id, {
          limitPaise,
        })
      } else {
        if (!selectedCategoryId) {
          throw new Error('Please select an expense category.')
        }
        await budgetService.createBudget({
          categoryId: selectedCategoryId,
          period,
          periodStart: currentMonthStart,
          limitPaise,
        })
      }
      setIsModalOpen(false)
      loadData()
      onMutated?.()
    } catch (err) {
      setErrorMessage((err as Error).message)
    }
  }

  const handleDeleteBudget = async (progress: BudgetProgress) => {
    if (!window.confirm(`Delete ${progress.category.name} budget for ${currentMonthStart.substring(0, 7)}?`)) {
      return
    }

    try {
      await budgetService.deleteBudget(progress.budget.id)
      loadData()
      onMutated?.()
    } catch (err) {
      console.error('Failed to delete budget', err)
    }
  }

  const renderThresholdBadge = (progress: BudgetProgress) => {
    switch (progress.threshold) {
      case 'alert':
        return (
          <span className="badge-alert" style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
            <AlertCircle size={12} />
            <span>Over Budget ({progress.spentPercentage.toFixed(0)}%)</span>
          </span>
        )
      case 'warning':
        return (
          <span className="badge-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
            <AlertTriangle size={12} />
            <span>Near Limit ({progress.spentPercentage.toFixed(0)}%)</span>
          </span>
        )
      default:
        return (
          <span className="badge-normal" style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
            <CheckCircle2 size={12} />
            <span>On Track ({progress.spentPercentage.toFixed(0)}%)</span>
          </span>
        )
    }
  }

  const getProgressColor = (threshold: BudgetProgress['threshold']) => {
    switch (threshold) {
      case 'alert':
        return '#f43f5e'
      case 'warning':
        return '#f59e0b'
      default:
        return '#10b981'
    }
  }

  return (
    <div className="settings-section-card">
      <div className="settings-card-header">
        <div>
          <h3 className="settings-card-title">Category Budgets</h3>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
            Track spending limits with 80% warning and 100% over-budget threshold alerts.
          </span>
        </div>
        <button
          type="button"
          className="btn-primary"
          onClick={openCreateModal}
          disabled={availableCategories.length === 0}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--space-2xs)',
            minHeight: '40px',
            fontSize: 'var(--font-size-xs)',
          }}
          aria-label="Set New Category Budget"
          title={availableCategories.length === 0 ? 'All expense categories have a budget for this month' : 'Set budget'}
        >
          <Plus size={16} />
          <span>New Budget</span>
        </button>
      </div>

      {/* Month Navigation Control */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--color-surface-elevated)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '0.4rem var(--space-sm)' }}>
        <button
          type="button"
          className="btn-secondary"
          onClick={handlePrevMonth}
          style={{ minHeight: '36px', minWidth: '36px', padding: '0.3rem' }}
          aria-label="Previous Month"
        >
          <ChevronLeft size={16} />
        </button>
        <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>
          {new Date(currentMonthStart + 'T00:00:00').toLocaleDateString('en-IN', {
            month: 'long',
            year: 'numeric',
          })}
        </span>
        <button
          type="button"
          className="btn-secondary"
          onClick={handleNextMonth}
          style={{ minHeight: '36px', minWidth: '36px', padding: '0.3rem' }}
          aria-label="Next Month"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Budgets List */}
      {isLoading ? (
        <div style={{ padding: 'var(--space-md)', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
          Loading budgets...
        </div>
      ) : budgetsProgress.length === 0 ? (
        <div style={{ padding: 'var(--space-lg)', textAlign: 'center', color: 'var(--color-text-muted)', display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)', alignItems: 'center' }}>
          <span>No budgets configured for this month.</span>
          <span style={{ fontSize: 'var(--font-size-xs)' }}>
            Tap "New Budget" above to set a spending target for an expense category.
          </span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }} role="list" aria-label="Budgets list">
          {budgetsProgress.map((bp) => (
            <div
              key={bp.budget.id}
              className={`budget-card threshold-${bp.threshold}`}
              role="listitem"
            >
              <div className="budget-card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
                  <span
                    className="settings-item-dot"
                    style={{ backgroundColor: bp.category.color }}
                    aria-hidden="true"
                  />
                  <span style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>
                    {bp.category.name}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
                  {renderThresholdBadge(bp)}
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => openEditModal(bp)}
                    style={{ minHeight: '32px', minWidth: '32px', padding: '0.3rem' }}
                    aria-label={`Edit ${bp.category.name} budget`}
                  >
                    <Edit2 size={13} />
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => handleDeleteBudget(bp)}
                    style={{ minHeight: '32px', minWidth: '32px', padding: '0.3rem', color: 'var(--color-expense)' }}
                    aria-label={`Delete ${bp.category.name} budget`}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              {/* Progress bar */}
              <div className="budget-progress-track" role="progressbar" aria-valuenow={Math.round(bp.spentPercentage)} aria-valuemin={0} aria-valuemax={100} aria-label={`${bp.category.name} budget progress`}>
                <div
                  className="budget-progress-fill"
                  style={{
                    width: `${Math.min(100, Math.max(0, bp.spentPercentage))}%`,
                    backgroundColor: getProgressColor(bp.threshold),
                  }}
                />
              </div>

              {/* Amounts row */}
              <div className="budget-amounts-row">
                <span style={{ color: 'var(--color-text-secondary)' }}>
                  Spent: <strong>{formatPaise(bp.spentPaise)}</strong> of {formatPaise(bp.limitPaise)}
                </span>
                <span
                  style={{
                    fontWeight: 600,
                    color: bp.isOverBudget ? 'var(--color-expense)' : 'var(--color-income)',
                  }}
                >
                  {bp.isOverBudget
                    ? `${formatPaise(Math.abs(bp.remainingPaise))} over budget`
                    : `${formatPaise(bp.remainingPaise)} left`}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Budget Modal */}
      {isModalOpen && (
        <div className="settings-modal-overlay" role="dialog" aria-modal="true" aria-label={editingBudgetProgress ? 'Edit Budget' : 'Set Category Budget'}>
          <div className="settings-modal">
            <div className="settings-modal-header">
              <h4 style={{ margin: 0, fontSize: 'var(--font-size-base)', fontWeight: 600 }}>
                {editingBudgetProgress ? `Edit ${editingBudgetProgress.category.name} Budget` : 'Set Category Budget'}
              </h4>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setIsModalOpen(false)}
                style={{ minHeight: '36px', minWidth: '36px', padding: '0.3rem' }}
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </div>

            {errorMessage && (
              <div className="alert-banner danger" role="alert">
                <span>{errorMessage}</span>
              </div>
            )}

            <form onSubmit={handleSaveBudget} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
              {!editingBudgetProgress && (
                <div className="form-group">
                  <label className="form-label" htmlFor="budget-cat-select">
                    Expense Category
                  </label>
                  <select
                    id="budget-cat-select"
                    className="form-select"
                    value={selectedCategoryId}
                    onChange={(e) => setSelectedCategoryId(e.target.value)}
                    required
                  >
                    {availableCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="form-group">
                <label className="form-label" htmlFor="budget-limit-input">
                  Budget Limit (₹ INR)
                </label>
                <input
                  id="budget-limit-input"
                  type="number"
                  step="0.01"
                  min="1"
                  className="form-input"
                  value={limitRupeesInput}
                  onChange={(e) => setLimitRupeesInput(e.target.value)}
                  placeholder="5000"
                  required
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setIsModalOpen(false)}
                  style={{ minHeight: '44px', padding: '0.6rem 1rem' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  style={{ minHeight: '44px', padding: '0.6rem 1.25rem' }}
                >
                  Save Budget
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
