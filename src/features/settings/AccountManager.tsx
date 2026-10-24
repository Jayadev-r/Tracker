import { useState, useEffect, useMemo, useCallback } from 'react'
import type { PaisaTrackDatabase } from '../../db/database'
import { db as defaultDb } from '../../db/database'
import { AccountService } from '../../services/accountService'
import type { Account, AccountType, AppSettings } from '../../types'
import { formatPaise, parseRupeesToPaise } from '../../utils/money'
import { getLocalTodayDateString } from '../../utils/dates'
import { Plus, Edit2, Archive, RotateCcw, Trash2, X, Wallet, Landmark, CreditCard, Layers, Star } from 'lucide-react'

interface AccountManagerProps {
  database?: PaisaTrackDatabase
  onMutated?: () => void
}

export function AccountManager({
  database = defaultDb,
  onMutated,
}: AccountManagerProps) {
  const accService = useMemo(() => new AccountService(database), [database])

  const [accounts, setAccounts] = useState<Account[]>([])
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [showArchived, setShowArchived] = useState<boolean>(false)
  const [isLoading, setIsLoading] = useState<boolean>(true)

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false)
  const [editingAccount, setEditingAccount] = useState<Account | null>(null)
  const [nameInput, setNameInput] = useState<string>('')
  const [typeInput, setTypeInput] = useState<AccountType>('bank')
  const [balanceRupeesInput, setBalanceRupeesInput] = useState<string>('0')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [feedbackError, setFeedbackError] = useState<string | null>(null)

  const loadAccounts = useCallback(async () => {
    setIsLoading(true)
    try {
      const [list, sets] = await Promise.all([
        accService.listAccounts({ includeArchived: showArchived }),
        database.settings.get('app-settings'),
      ])
      setAccounts(list)
      setSettings(sets ?? null)
    } catch (err) {
      console.error('Failed to load accounts', err)
    } finally {
      setIsLoading(false)
    }
  }, [accService, database, showArchived])

  useEffect(() => {
    loadAccounts()
  }, [loadAccounts])

  const openCreateModal = () => {
    setEditingAccount(null)
    setNameInput('')
    setTypeInput('bank')
    setBalanceRupeesInput('0')
    setErrorMessage(null)
    setIsModalOpen(true)
  }

  const openEditModal = (acc: Account) => {
    setEditingAccount(acc)
    setNameInput(acc.name)
    setTypeInput(acc.type)
    setBalanceRupeesInput((acc.openingBalancePaise / 100).toString())
    setErrorMessage(null)
    setIsModalOpen(true)
  }

  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)

    try {
      const balancePaise = parseRupeesToPaise(balanceRupeesInput || '0')

      if (editingAccount) {
        await accService.updateAccount(editingAccount.id, {
          name: nameInput,
          type: typeInput,
          openingBalancePaise: balancePaise,
        })
      } else {
        await accService.createAccount({
          name: nameInput,
          type: typeInput,
          openingBalancePaise: balancePaise,
          openingBalanceDate: getLocalTodayDateString(),
        })
      }
      setIsModalOpen(false)
      loadAccounts()
      onMutated?.()
    } catch (err) {
      setErrorMessage((err as Error).message)
    }
  }

  const handleToggleArchive = async (acc: Account) => {
    setFeedbackError(null)
    try {
      if (acc.isArchived) {
        await accService.restoreAccount(acc.id)
      } else {
        await accService.archiveAccount(acc.id)
      }
      loadAccounts()
      onMutated?.()
    } catch (err) {
      setFeedbackError((err as Error).message)
    }
  }

  const handleDelete = async (acc: Account) => {
    setFeedbackError(null)
    if (!window.confirm(`Delete account "${acc.name}"? Only accounts with no transactions can be deleted.`)) {
      return
    }

    try {
      await accService.deleteAccount(acc.id)
      loadAccounts()
      onMutated?.()
    } catch (err) {
      setFeedbackError((err as Error).message)
    }
  }

  const renderAccountTypeIcon = (type: AccountType) => {
    switch (type) {
      case 'cash':
        return <Wallet size={16} />
      case 'bank':
        return <Landmark size={16} />
      case 'credit_card':
        return <CreditCard size={16} />
      default:
        return <Layers size={16} />
    }
  }

  return (
    <div className="settings-section-card">
      <div className="settings-card-header">
        <div>
          <h3 className="settings-card-title">Accounts Management</h3>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
            Manage cash, bank accounts, and credit cards used in transactions and transfers.
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
          aria-label="Add New Account"
        >
          <Plus size={16} />
          <span>New Account</span>
        </button>
      </div>

      {feedbackError && (
        <div className="alert-banner danger" role="alert">
          <span>{feedbackError}</span>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2xs)', fontSize: 'var(--font-size-xs)', cursor: 'pointer', color: 'var(--color-text-secondary)' }}>
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            style={{ width: '16px', height: '16px', accentColor: 'var(--color-primary)' }}
          />
          <span>Show Archived Accounts</span>
        </label>
      </div>

      {isLoading ? (
        <div style={{ padding: 'var(--space-md)', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
          Loading accounts...
        </div>
      ) : accounts.length === 0 ? (
        <div style={{ padding: 'var(--space-lg)', textAlign: 'center', color: 'var(--color-text-muted)' }}>
          No accounts found.
        </div>
      ) : (
        <div className="settings-list" role="list" aria-label="Accounts list">
          {accounts.map((acc) => {
            const isDefault = settings?.defaultAccountId === acc.id
            return (
              <div
                key={acc.id}
                className={`settings-list-item ${acc.isArchived ? 'archived' : ''}`}
                role="listitem"
              >
                <div className="settings-item-main">
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--color-surface)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--color-primary)',
                      border: '1px solid var(--color-border-subtle)',
                      flexShrink: 0,
                    }}
                    aria-hidden="true"
                  >
                    {renderAccountTypeIcon(acc.type)}
                  </div>
                  <div className="settings-item-info">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2xs)' }}>
                      <span className="settings-item-name">{acc.name}</span>
                      {isDefault && (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '2px',
                            fontSize: '0.65rem',
                            color: 'var(--color-primary)',
                            background: 'rgba(99, 102, 241, 0.1)',
                            padding: '0.1rem 0.35rem',
                            borderRadius: 'var(--radius-full)',
                            fontWeight: 600,
                          }}
                        >
                          <Star size={10} fill="currentColor" />
                          <span>Default</span>
                        </span>
                      )}
                    </div>
                    <span className="settings-item-sub">
                      Type: {acc.type.replace('_', ' ')} • Opening: {formatPaise(acc.openingBalancePaise)}
                    </span>
                  </div>
                </div>

                <div className="settings-item-actions">
                  <span className={acc.isArchived ? 'badge-archived' : 'badge-active'}>
                    {acc.isArchived ? 'Archived' : 'Active'}
                  </span>

                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => openEditModal(acc)}
                    style={{ minHeight: '36px', minWidth: '36px', padding: '0.4rem' }}
                    aria-label={`Edit account ${acc.name}`}
                    title="Edit account"
                  >
                    <Edit2 size={15} />
                  </button>

                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => handleToggleArchive(acc)}
                    style={{ minHeight: '36px', minWidth: '36px', padding: '0.4rem' }}
                    aria-label={acc.isArchived ? `Restore account ${acc.name}` : `Archive account ${acc.name}`}
                    title={acc.isArchived ? 'Restore account' : 'Archive account'}
                  >
                    {acc.isArchived ? <RotateCcw size={15} /> : <Archive size={15} />}
                  </button>

                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => handleDelete(acc)}
                    style={{ minHeight: '36px', minWidth: '36px', padding: '0.4rem', color: 'var(--color-expense)' }}
                    aria-label={`Delete account ${acc.name}`}
                    title="Delete account"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Add / Edit Account Modal */}
      {isModalOpen && (
        <div className="settings-modal-overlay" role="dialog" aria-modal="true" aria-label={editingAccount ? 'Edit Account' : 'Add Account'}>
          <div className="settings-modal">
            <div className="settings-modal-header">
              <h4 style={{ margin: 0, fontSize: 'var(--font-size-base)', fontWeight: 600 }}>
                {editingAccount ? `Edit "${editingAccount.name}"` : 'Add New Account'}
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

            <form onSubmit={handleSaveAccount} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
              <div className="form-group">
                <label className="form-label" htmlFor="acc-name-input">
                  Account Name
                </label>
                <input
                  id="acc-name-input"
                  type="text"
                  className="form-input"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="e.g. HDFC Bank, Cash Wallet, ICICI Credit"
                  maxLength={50}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="acc-type-select">
                  Account Type
                </label>
                <select
                  id="acc-type-select"
                  className="form-select"
                  value={typeInput}
                  onChange={(e) => setTypeInput(e.target.value as AccountType)}
                >
                  <option value="bank">Bank Account</option>
                  <option value="cash">Cash</option>
                  <option value="credit_card">Credit Card</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="acc-balance-input">
                  Opening Balance (₹ INR)
                </label>
                <input
                  id="acc-balance-input"
                  type="number"
                  step="0.01"
                  className="form-input"
                  value={balanceRupeesInput}
                  onChange={(e) => setBalanceRupeesInput(e.target.value)}
                  placeholder="0.00"
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
                  Save Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
