import { useState } from 'react'
import type { PaisaTrackDatabase } from '../../db/database'
import { db as defaultDb } from '../../db/database'
import { CategoryManager } from './CategoryManager'
import { AccountManager } from './AccountManager'
import { BudgetManager } from './BudgetManager'
import { BackupRestoreSection } from './BackupRestoreSection'
import { PreferencesSection } from './PreferencesSection'
import { Tag, Landmark, PieChart, Database, Sliders } from 'lucide-react'
import './settings.css'

export type SettingsSubTab = 'categories' | 'accounts' | 'budgets' | 'backup' | 'preferences'

interface SettingsPageProps {
  database?: PaisaTrackDatabase
  onDataMutated?: () => void
  initialSubTab?: SettingsSubTab
}

export function SettingsPage({
  database = defaultDb,
  onDataMutated,
  initialSubTab = 'categories',
}: SettingsPageProps) {
  const [subTab, setSubTab] = useState<SettingsSubTab>(initialSubTab)

  return (
    <div className="settings-container">
      {/* Sub-tab Pill Navigation */}
      <div className="settings-tabs" role="tablist" aria-label="Settings Sections">
        <button
          type="button"
          className={`settings-tab-btn ${subTab === 'categories' ? 'active' : ''}`}
          onClick={() => setSubTab('categories')}
          role="tab"
          aria-selected={subTab === 'categories'}
          aria-label="Categories Settings"
        >
          <Tag size={15} />
          <span>Categories</span>
        </button>

        <button
          type="button"
          className={`settings-tab-btn ${subTab === 'accounts' ? 'active' : ''}`}
          onClick={() => setSubTab('accounts')}
          role="tab"
          aria-selected={subTab === 'accounts'}
          aria-label="Accounts Settings"
        >
          <Landmark size={15} />
          <span>Accounts</span>
        </button>

        <button
          type="button"
          className={`settings-tab-btn ${subTab === 'budgets' ? 'active' : ''}`}
          onClick={() => setSubTab('budgets')}
          role="tab"
          aria-selected={subTab === 'budgets'}
          aria-label="Budgets Settings"
        >
          <PieChart size={15} />
          <span>Budgets</span>
        </button>

        <button
          type="button"
          className={`settings-tab-btn ${subTab === 'backup' ? 'active' : ''}`}
          onClick={() => setSubTab('backup')}
          role="tab"
          aria-selected={subTab === 'backup'}
          aria-label="Backup and Restore Settings"
        >
          <Database size={15} />
          <span>Backup</span>
        </button>

        <button
          type="button"
          className={`settings-tab-btn ${subTab === 'preferences' ? 'active' : ''}`}
          onClick={() => setSubTab('preferences')}
          role="tab"
          aria-selected={subTab === 'preferences'}
          aria-label="Preferences and About"
        >
          <Sliders size={15} />
          <span>Preferences</span>
        </button>
      </div>

      {/* Render Active Settings Sub-view */}
      {subTab === 'categories' && (
        <CategoryManager
          database={database}
          onMutated={onDataMutated}
        />
      )}

      {subTab === 'accounts' && (
        <AccountManager
          database={database}
          onMutated={onDataMutated}
        />
      )}

      {subTab === 'budgets' && (
        <BudgetManager
          database={database}
          onMutated={onDataMutated}
        />
      )}

      {subTab === 'backup' && (
        <BackupRestoreSection
          database={database}
          onMutated={onDataMutated}
        />
      )}

      {subTab === 'preferences' && (
        <PreferencesSection
          database={database}
          onMutated={onDataMutated}
        />
      )}
    </div>
  )
}
