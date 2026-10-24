import { useState, useEffect, useMemo, useCallback } from 'react'
import type { PaisaTrackDatabase } from '../../db/database'
import { db as defaultDb } from '../../db/database'
import { CategoryService } from '../../services/categoryService'
import type { Category, CategoryType } from '../../types'
import { Plus, Edit2, Archive, RotateCcw, Trash2, X } from 'lucide-react'

const CURATED_COLORS = [
  '#f97316', // Orange
  '#10b981', // Green
  '#6366f1', // Indigo
  '#eab308', // Yellow
  '#06b6d4', // Cyan
  '#ec4899', // Pink
  '#f59e0b', // Amber
  '#8b5cf6', // Violet
  '#ef4444', // Red
  '#14b8a6', // Teal
  '#a855f7', // Purple
  '#3b82f6', // Blue
  '#64748b', // Slate
]

interface CategoryManagerProps {
  database?: PaisaTrackDatabase
  onMutated?: () => void
}

export function CategoryManager({
  database = defaultDb,
  onMutated,
}: CategoryManagerProps) {
  const catService = useMemo(() => new CategoryService(database), [database])

  const [activeType, setActiveType] = useState<CategoryType>('expense')
  const [showArchived, setShowArchived] = useState<boolean>(false)
  const [categories, setCategories] = useState<Category[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [nameInput, setNameInput] = useState<string>('')
  const [colorInput, setColorInput] = useState<string>('#f97316')
  const [aliasesInput, setAliasesInput] = useState<string>('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Delete error modal
  const [feedbackError, setFeedbackError] = useState<string | null>(null)

  const loadCategories = useCallback(async () => {
    setIsLoading(true)
    try {
      const list = await catService.listCategories({
        type: activeType,
        includeArchived: showArchived,
      })
      setCategories(list)
    } catch (err) {
      console.error('Failed to load categories', err)
    } finally {
      setIsLoading(false)
    }
  }, [catService, activeType, showArchived])

  useEffect(() => {
    loadCategories()
  }, [loadCategories])

  const openCreateModal = () => {
    setEditingCategory(null)
    setNameInput('')
    setColorInput(activeType === 'income' ? '#10b981' : '#f97316')
    setAliasesInput('')
    setErrorMessage(null)
    setIsModalOpen(true)
  }

  const openEditModal = (cat: Category) => {
    setEditingCategory(cat)
    setNameInput(cat.name)
    setColorInput(cat.color)
    setAliasesInput(cat.aliases.join(', '))
    setErrorMessage(null)
    setIsModalOpen(true)
  }

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)

    const aliasList = aliasesInput
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)

    try {
      if (editingCategory) {
        await catService.updateCategory(editingCategory.id, {
          name: nameInput,
          color: colorInput,
          aliases: aliasList,
        })
      } else {
        await catService.createCategory({
          name: nameInput,
          type: activeType,
          color: colorInput,
          aliases: aliasList,
        })
      }
      setIsModalOpen(false)
      loadCategories()
      onMutated?.()
    } catch (err) {
      setErrorMessage((err as Error).message)
    }
  }

  const handleToggleArchive = async (cat: Category) => {
    setFeedbackError(null)
    try {
      if (cat.isArchived) {
        await catService.restoreCategory(cat.id)
      } else {
        await catService.archiveCategory(cat.id)
      }
      loadCategories()
      onMutated?.()
    } catch (err) {
      setFeedbackError((err as Error).message)
    }
  }

  const handleDelete = async (cat: Category) => {
    setFeedbackError(null)
    if (!window.confirm(`Delete category "${cat.name}"? Only categories with no transactions can be deleted.`)) {
      return
    }

    try {
      await catService.deleteCategory(cat.id)
      loadCategories()
      onMutated?.()
    } catch (err) {
      setFeedbackError((err as Error).message)
    }
  }

  return (
    <div className="settings-section-card">
      <div className="settings-card-header">
        <div>
          <h3 className="settings-card-title">Category Management</h3>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
            Configure income and expense categories, colors, and parser aliases.
          </span>
        </div>
        <button
          type="button"
          className="btn-primary"
          onClick={openCreateModal}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--space-2xs)',
            minHeight: '40px',
            fontSize: 'var(--font-size-xs)',
          }}
          aria-label="Add New Category"
        >
          <Plus size={16} />
          <span>New Category</span>
        </button>
      </div>

      {feedbackError && (
        <div className="alert-banner danger" role="alert">
          <span>{feedbackError}</span>
        </div>
      )}

      {/* Filter controls: Type tabs & Archived toggle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-xs)' }}>
        <div className="dashboard-period-selector" role="tablist" aria-label="Category Type" style={{ maxWidth: '240px', margin: 0 }}>
          <button
            type="button"
            className={`dashboard-period-btn ${activeType === 'expense' ? 'active' : ''}`}
            onClick={() => setActiveType('expense')}
            role="tab"
            aria-selected={activeType === 'expense'}
          >
            Expense
          </button>
          <button
            type="button"
            className={`dashboard-period-btn ${activeType === 'income' ? 'active' : ''}`}
            onClick={() => setActiveType('income')}
            role="tab"
            aria-selected={activeType === 'income'}
          >
            Income
          </button>
        </div>

        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2xs)', fontSize: 'var(--font-size-xs)', cursor: 'pointer', color: 'var(--color-text-secondary)' }}>
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            style={{ width: '16px', height: '16px', accentColor: 'var(--color-primary)' }}
          />
          <span>Show Archived</span>
        </label>
      </div>

      {/* Category List */}
      {isLoading ? (
        <div style={{ padding: 'var(--space-md)', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
          Loading categories...
        </div>
      ) : categories.length === 0 ? (
        <div style={{ padding: 'var(--space-lg)', textAlign: 'center', color: 'var(--color-text-muted)' }}>
          No categories found.
        </div>
      ) : (
        <div className="settings-list" role="list" aria-label="Categories list">
          {categories.map((cat) => (
            <div
              key={cat.id}
              className={`settings-list-item ${cat.isArchived ? 'archived' : ''}`}
              role="listitem"
            >
              <div className="settings-item-main">
                <span
                  className="settings-item-dot"
                  style={{ backgroundColor: cat.color }}
                  aria-hidden="true"
                />
                <div className="settings-item-info">
                  <span className="settings-item-name">{cat.name}</span>
                  {cat.aliases.length > 0 && (
                    <span className="settings-item-sub">
                      Aliases: {cat.aliases.join(', ')}
                    </span>
                  )}
                </div>
              </div>

              <div className="settings-item-actions">
                <span className={cat.isArchived ? 'badge-archived' : 'badge-active'}>
                  {cat.isArchived ? 'Archived' : 'Active'}
                </span>

                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => openEditModal(cat)}
                  style={{ minHeight: '36px', minWidth: '36px', padding: '0.4rem' }}
                  aria-label={`Edit category ${cat.name}`}
                  title="Edit category"
                >
                  <Edit2 size={15} />
                </button>

                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => handleToggleArchive(cat)}
                  style={{ minHeight: '36px', minWidth: '36px', padding: '0.4rem' }}
                  aria-label={cat.isArchived ? `Restore category ${cat.name}` : `Archive category ${cat.name}`}
                  title={cat.isArchived ? 'Restore category' : 'Archive category'}
                >
                  {cat.isArchived ? <RotateCcw size={15} /> : <Archive size={15} />}
                </button>

                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => handleDelete(cat)}
                  style={{ minHeight: '36px', minWidth: '36px', padding: '0.4rem', color: 'var(--color-expense)' }}
                  aria-label={`Delete category ${cat.name}`}
                  title="Delete category"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Category Modal */}
      {isModalOpen && (
        <div className="settings-modal-overlay" role="dialog" aria-modal="true" aria-label={editingCategory ? 'Edit Category' : 'Add Category'}>
          <div className="settings-modal">
            <div className="settings-modal-header">
              <h4 style={{ margin: 0, fontSize: 'var(--font-size-base)', fontWeight: 600 }}>
                {editingCategory ? `Edit "${editingCategory.name}"` : `Add ${activeType} Category`}
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

            <form onSubmit={handleSaveCategory} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
              <div className="form-group">
                <label className="form-label" htmlFor="cat-name-input">
                  Category Name
                </label>
                <input
                  id="cat-name-input"
                  type="text"
                  className="form-input"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="e.g. Groceries, Gym, Freelance"
                  maxLength={50}
                  required
                />
              </div>

              <div className="form-group">
                <span className="form-label">Category Color</span>
                <div className="color-swatch-picker" role="radiogroup" aria-label="Category color swatches">
                  {CURATED_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={`color-swatch ${colorInput === color ? 'selected' : ''}`}
                      style={{ backgroundColor: color }}
                      onClick={() => setColorInput(color)}
                      aria-label={`Select color ${color}`}
                      aria-checked={colorInput === color}
                      role="radio"
                    />
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="cat-aliases-input">
                  Chat Parser Aliases (comma-separated)
                </label>
                <input
                  id="cat-aliases-input"
                  type="text"
                  className="form-input"
                  value={aliasesInput}
                  onChange={(e) => setAliasesInput(e.target.value)}
                  placeholder="e.g. dinner, snack, meal"
                />
                <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
                  Typing any of these words in Quick Add matches this category.
                </span>
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
                  Save Category
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
