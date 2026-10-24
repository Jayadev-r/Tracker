import { useState, useEffect } from 'react'
import type { PaisaTrackDatabase } from '../../db/database'
import { db as defaultDb } from '../../db/database'
import type { AppSettings, Account, ThemePreference, WeekStartDay } from '../../types'
import { settingsSchema } from '../../db/schema'
import { ShieldCheck } from 'lucide-react'

interface PreferencesSectionProps {
  database?: PaisaTrackDatabase
  onMutated?: () => void
}

export function PreferencesSection({
  database = defaultDb,
  onMutated,
}: PreferencesSectionProps) {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      const [s, accs] = await Promise.all([
        database.settings.get('app-settings'),
        database.accounts.filter((a) => !a.isArchived).toArray(),
      ])
      setSettings(s ?? null)
      setAccounts(accs)
    }
    load()
  }, [database])

  const handleUpdate = async (updates: Partial<AppSettings>) => {
    const current = (await database.settings.get('app-settings')) ?? settings
    if (!current) return

    const now = new Date().toISOString()
    const updated: AppSettings = {
      ...current,
      ...updates,
      updatedAt: now,
    }

    const validated = settingsSchema.parse(updated)
    await database.settings.put(validated)
    setSettings(validated)

    // Apply theme dynamically to document if theme changed
    if (updates.theme !== undefined) {
      localStorage.setItem('paisatrack_theme', updates.theme)
      if (updates.theme === 'system') {
        document.documentElement.removeAttribute('data-theme')
        const isSystemDark = window.matchMedia('(prefers-color-scheme: dark)').matches
        document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isSystemDark ? '#0f141c' : '#f8fafc')
      } else {
        document.documentElement.setAttribute('data-theme', updates.theme)
        document.querySelector('meta[name="theme-color"]')?.setAttribute('content', updates.theme === 'light' ? '#f8fafc' : '#0f141c')
      }
    }

    setSaveFeedback('Preferences saved.')
    setTimeout(() => setSaveFeedback(null), 2500)
    onMutated?.()
  }

  if (!settings) {
    return (
      <div className="settings-section-card">
        <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
          Loading preferences...
        </span>
      </div>
    )
  }

  return (
    <div className="settings-section-card">
      <div className="settings-card-header">
        <div>
          <h3 className="settings-card-title">Preferences & About</h3>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
            App settings, default account, theme, and privacy information.
          </span>
        </div>
      </div>

      {saveFeedback && (
        <div className="alert-banner success" role="status">
          <span>{saveFeedback}</span>
        </div>
      )}

      {/* Theme selection */}
      <div className="form-group">
        <label className="form-label" htmlFor="theme-select">
          Theme Preference
        </label>
        <select
          id="theme-select"
          className="form-select"
          value={settings.theme}
          onChange={(e) => handleUpdate({ theme: e.target.value as ThemePreference })}
        >
          <option value="system">System Default</option>
          <option value="light">Light Mode</option>
          <option value="dark">Dark Mode</option>
        </select>
      </div>

      {/* Week starts on */}
      <div className="form-group">
        <label className="form-label" htmlFor="week-start-select">
          Week Starts On
        </label>
        <select
          id="week-start-select"
          className="form-select"
          value={settings.weekStartsOn}
          onChange={(e) => handleUpdate({ weekStartsOn: Number(e.target.value) as WeekStartDay })}
        >
          <option value={1}>Monday (ISO standard)</option>
          <option value={0}>Sunday</option>
        </select>
      </div>

      {/* Default account */}
      <div className="form-group">
        <label className="form-label" htmlFor="default-account-select">
          Default Payment Account
        </label>
        <select
          id="default-account-select"
          className="form-select"
          value={settings.defaultAccountId ?? ''}
          onChange={(e) => handleUpdate({ defaultAccountId: e.target.value || null })}
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.type})
            </option>
          ))}
        </select>
        <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
          Pre-selected for new transactions in Quick Add when no account keyword is specified.
        </span>
      </div>

      {/* Privacy and App Info */}
      <div
        style={{
          background: 'var(--color-surface-elevated)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: 'var(--space-md)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-xs)',
          fontSize: 'var(--font-size-xs)',
          color: 'var(--color-text-secondary)',
          lineHeight: 1.6,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2xs)', color: 'var(--color-income)', fontWeight: 600 }}>
          <ShieldCheck size={16} />
          <span>Privacy & Data Sovereignty Guarantee</span>
        </div>
        <div>
          PaisaTrack stores your financial records exclusively inside your device's browser IndexedDB.
          There are no remote servers, cloud databases, analytics SDKs, advertising trackers, or external APIs.
        </div>
        <div style={{ borderTop: '1px solid var(--color-border-subtle)', paddingTop: 'var(--space-xs)', display: 'flex', flexDirection: 'column', gap: '2px', color: 'var(--color-text-muted)' }}>
          <div><strong>App Version:</strong> 1.0 (Phase 7 - PWA)</div>
          <div><strong>Database Engine:</strong> Dexie IndexedDB (Schema v2)</div>
          <div><strong>Currency:</strong> Indian Rupee (INR, ₹)</div>
        </div>
      </div>
    </div>
  )
}
