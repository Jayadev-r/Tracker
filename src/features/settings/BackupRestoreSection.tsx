import { useState, useEffect, useMemo, useRef } from 'react'
import type { PaisaTrackDatabase } from '../../db/database'
import { db as defaultDb } from '../../db/database'
import { BackupService, type BackupValidationResult } from '../../services/backupService'
import { getLocalTodayDateString } from '../../utils/dates'
import { Download, Upload, Trash2, CheckCircle2, AlertTriangle, AlertCircle, FileText } from 'lucide-react'

interface BackupRestoreSectionProps {
  database?: PaisaTrackDatabase
  onMutated?: () => void
}

export function BackupRestoreSection({
  database = defaultDb,
  onMutated,
}: BackupRestoreSectionProps) {
  const backupService = useMemo(() => new BackupService(database), [database])

  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [validationResult, setValidationResult] = useState<BackupValidationResult | null>(null)
  const [isProcessing, setIsProcessing] = useState<boolean>(false)
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Confirmation Modals
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState<boolean>(false)
  const [isClearModalOpen, setIsClearModalOpen] = useState<boolean>(false)

  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const loadSettings = async () => {
      const s = await database.settings.get('app-settings')
      if (s) setLastBackupAt(s.lastBackupAt)
    }
    loadSettings()
  }, [database])

  const handleExportJson = async () => {
    setIsProcessing(true)
    setStatusMessage(null)
    try {
      const jsonStr = await backupService.exportJsonBackup()
      const today = getLocalTodayDateString()
      const filename = `PaisaTrack_Backup_${today}.json`
      const success = backupService.triggerFileDownload(jsonStr, filename, 'application/json')
      if (success) {
        setLastBackupAt(new Date().toISOString())
        setStatusMessage({
          type: 'success',
          text: `Backup exported successfully as ${filename}. Store this file in a safe location.`,
        })
      } else {
        setStatusMessage({
          type: 'error',
          text: 'Browser prevented file download. Please try again.',
        })
      }
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: `Export failed: ${(err as Error).message}`,
      })
    } finally {
      setIsProcessing(false)
    }
  }

  const handleExportCsv = async () => {
    setIsProcessing(true)
    setStatusMessage(null)
    try {
      const csvStr = await backupService.exportCsvTransactions()
      const today = getLocalTodayDateString()
      const filename = `PaisaTrack_Transactions_${today}.csv`
      const success = backupService.triggerFileDownload(csvStr, filename, 'text/csv')
      if (success) {
        setStatusMessage({
          type: 'success',
          text: `Transactions exported as ${filename}. Note: CSV is for analysis only, not for full database restoration.`,
        })
      }
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: `CSV export failed: ${(err as Error).message}`,
      })
    } finally {
      setIsProcessing(false)
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setSelectedFile(file)
    setStatusMessage(null)
    setIsProcessing(true)

    try {
      const text = await file.text()
      const result = backupService.validateBackup(text)
      setValidationResult(result)
    } catch (err) {
      setValidationResult({
        isValid: false,
        errors: [`Could not read file: ${(err as Error).message}`],
      })
    } finally {
      setIsProcessing(false)
    }
  }

  const handleConfirmRestore = async () => {
    if (!validationResult?.data) return

    setIsProcessing(true)
    setIsRestoreModalOpen(false)
    setStatusMessage(null)

    try {
      const result = await backupService.restoreBackup(validationResult.data, 'replace')
      setStatusMessage({
        type: 'success',
        text: `Restore complete! Restored ${result.transactionsCount} transaction(s), ${result.categoriesCount} category(s), ${result.accountsCount} account(s), and ${result.budgetsCount} budget(s).`,
      })
      setSelectedFile(null)
      setValidationResult(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      onMutated?.()
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: `Restore failed: ${(err as Error).message}. No changes were made to existing data.`,
      })
    } finally {
      setIsProcessing(false)
    }
  }

  const handleConfirmClear = async () => {
    setIsProcessing(true)
    setIsClearModalOpen(false)
    setStatusMessage(null)

    try {
      await backupService.clearAllData()
      setStatusMessage({
        type: 'success',
        text: 'All transactions, budgets, custom categories, and accounts have been cleared. Initial defaults restored.',
      })
      onMutated?.()
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: `Clear data failed: ${(err as Error).message}`,
      })
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="settings-section-card">
      <div className="settings-card-header">
        <div>
          <h3 className="settings-card-title">Backup & Restore</h3>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
            Export your entire financial record to a JSON file or restore from a previous backup.
          </span>
        </div>
      </div>

      {statusMessage && (
        <div
          className={`alert-banner ${statusMessage.type === 'success' ? 'success' : 'danger'}`}
          role="status"
        >
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Export Section */}
      <div
        style={{
          background: 'var(--color-surface-elevated)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: 'var(--space-md)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-sm)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-xs)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>
              Export Full JSON Backup
            </span>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
              Contains all transactions, categories, accounts, budgets, and settings.
            </span>
          </div>

          <button
            type="button"
            className="btn-primary"
            onClick={handleExportJson}
            disabled={isProcessing}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--space-2xs)',
              minHeight: '40px',
              fontSize: 'var(--font-size-xs)',
            }}
          >
            <Download size={15} />
            <span>Export JSON</span>
          </button>
        </div>

        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
          Last backup exported:{' '}
          <strong>
            {lastBackupAt
              ? new Date(lastBackupAt).toLocaleString('en-IN', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })
              : 'Never'}
          </strong>
        </div>

        <div style={{ paddingTop: 'var(--space-2xs)', borderTop: '1px solid var(--color-border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-xs)' }}>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
            Need to open transactions in Excel or Google Sheets?
          </span>
          <button
            type="button"
            className="btn-secondary"
            onClick={handleExportCsv}
            disabled={isProcessing}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--space-2xs)',
              minHeight: '36px',
              fontSize: 'var(--font-size-xs)',
            }}
          >
            <FileText size={14} />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Restore Section */}
      <div
        style={{
          background: 'var(--color-surface-elevated)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: 'var(--space-md)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-sm)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>
            Restore from JSON Backup
          </span>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
            Select a verified PaisaTrack backup file. The file is validated before any changes are made.
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
          <label
            className="btn-secondary"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--space-2xs)',
              minHeight: '40px',
              fontSize: 'var(--font-size-xs)',
              cursor: 'pointer',
            }}
          >
            <Upload size={15} />
            <span>Choose Backup File...</span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
          </label>
          {selectedFile && (
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text)' }}>
              {selectedFile.name}
            </span>
          )}
        </div>

        {/* Validation Errors */}
        {validationResult && !validationResult.isValid && (
          <div className="alert-banner danger" role="alert">
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2xs)', fontWeight: 600 }}>
              <AlertCircle size={15} />
              <span>Backup Validation Failed:</span>
            </div>
            <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
              {validationResult.errors.map((err, idx) => (
                <li key={idx}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Validation Summary and Restore Trigger */}
        {validationResult && validationResult.isValid && validationResult.summary && (
          <div
            style={{
              background: '#ecfdf5',
              border: '1px solid #10b981',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-sm) var(--space-md)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-xs)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2xs)', color: '#065f46', fontWeight: 600, fontSize: 'var(--font-size-xs)' }}>
              <CheckCircle2 size={15} />
              <span>Valid PaisaTrack Backup Verified</span>
            </div>
            <div style={{ fontSize: 'var(--font-size-xs)', color: '#064e3b', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 'var(--space-2xs)' }}>
              <div>Transactions: <strong>{validationResult.summary.transactionsCount}</strong></div>
              <div>Categories: <strong>{validationResult.summary.categoriesCount}</strong></div>
              <div>Accounts: <strong>{validationResult.summary.accountsCount}</strong></div>
              <div>Budgets: <strong>{validationResult.summary.budgetsCount}</strong></div>
            </div>

            <div style={{ marginTop: 'var(--space-2xs)', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn-primary"
                onClick={() => setIsRestoreModalOpen(true)}
                style={{
                  minHeight: '40px',
                  fontSize: 'var(--font-size-xs)',
                  background: '#059669',
                }}
              >
                <span>Restore This Backup</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Clear Data Section */}
      <div
        style={{
          background: 'var(--color-surface-elevated)',
          border: '1px solid rgba(244, 63, 94, 0.2)',
          borderRadius: 'var(--radius-md)',
          padding: 'var(--space-md)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 'var(--space-sm)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', color: 'var(--color-expense)' }}>
            Reset & Clear All Data
          </span>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
            Wipes all transactions and budgets, restoring fresh initial defaults.
          </span>
        </div>

        <button
          type="button"
          className="btn-secondary"
          onClick={() => setIsClearModalOpen(true)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--space-2xs)',
            minHeight: '40px',
            fontSize: 'var(--font-size-xs)',
            color: 'var(--color-expense)',
            borderColor: 'rgba(244, 63, 94, 0.4)',
          }}
        >
          <Trash2 size={15} />
          <span>Clear Data</span>
        </button>
      </div>

      {/* Restore Confirmation Modal */}
      {isRestoreModalOpen && (
        <div className="settings-modal-overlay" role="dialog" aria-modal="true" aria-label="Confirm Restore">
          <div className="settings-modal">
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', color: '#d97706' }}>
              <AlertTriangle size={24} />
              <h4 style={{ margin: 0, fontSize: 'var(--font-size-base)', fontWeight: 600, color: 'var(--color-text)' }}>
                Confirm Data Replacement
              </h4>
            </div>

            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', lineHeight: 1.6, margin: 0 }}>
              Restoring this backup will replace all current categories, accounts, budgets, and transactions with the records in the backup file.
            </p>

            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', lineHeight: 1.5, margin: 0 }}>
              The operation is atomic: if any record fails to restore, your current data remains untouched. We recommend exporting a fresh backup first if you have unbacked-up records.
            </p>

            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setIsRestoreModalOpen(false)}
                style={{ minHeight: '44px', padding: '0.6rem 1rem' }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleConfirmRestore}
                style={{ minHeight: '44px', padding: '0.6rem 1.25rem', background: '#d97706' }}
              >
                Replace and Restore
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear Data Confirmation Modal */}
      {isClearModalOpen && (
        <div className="settings-modal-overlay" role="dialog" aria-modal="true" aria-label="Confirm Clear Data">
          <div className="settings-modal">
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', color: 'var(--color-expense)' }}>
              <AlertTriangle size={24} />
              <h4 style={{ margin: 0, fontSize: 'var(--font-size-base)', fontWeight: 600, color: 'var(--color-text)' }}>
                Clear All Data
              </h4>
            </div>

            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', lineHeight: 1.6, margin: 0 }}>
              Are you sure you want to delete all transactions and budgets? This action cannot be undone unless you have an exported JSON backup file.
            </p>

            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setIsClearModalOpen(false)}
                style={{ minHeight: '44px', padding: '0.6rem 1rem' }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleConfirmClear}
                style={{ minHeight: '44px', padding: '0.6rem 1.25rem', background: 'var(--color-expense)' }}
              >
                Yes, Clear All Data
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
