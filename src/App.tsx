import { useState, useEffect } from 'react'
import { Home, MessageSquarePlus, Calendar, PieChart, Settings, ArrowLeft, WifiOff } from 'lucide-react'
import type { PaisaTrackDatabase } from './db/database'
import { db as defaultDb } from './db/database'
import { ChatPage } from './features/chat-entry/ChatPage'
import { TransactionListPage } from './features/transactions/TransactionListPage'
import { CalendarPage } from './features/calendar/CalendarPage'
import { DashboardPage } from './features/dashboard/DashboardPage'
import { AnalyticsPage } from './features/analytics/AnalyticsPage'
import { SettingsPage } from './features/settings/SettingsPage'

export type Tab = 'home' | 'quick-add' | 'calendar' | 'insights' | 'settings'

interface NavTab {
  id: Tab
  label: string
  icon: typeof Home
}

const NAV_TABS: readonly NavTab[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'quick-add', label: 'Quick Add', icon: MessageSquarePlus },
  { id: 'calendar', label: 'Calendar', icon: Calendar },
  { id: 'insights', label: 'Insights', icon: PieChart },
  { id: 'settings', label: 'Settings', icon: Settings },
]

interface AppProps {
  database?: PaisaTrackDatabase
  initialTab?: Tab
}

export default function App({ database = defaultDb, initialTab = 'quick-add' }: AppProps) {
  const [activeTab, setActiveTab] = useState<Tab>(initialTab)
  const [homeView, setHomeView] = useState<'dashboard' | 'history'>('dashboard')
  const [dataRevision, setDataRevision] = useState<number>(0)
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' && 'onLine' in navigator ? navigator.onLine : true
  )

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  useEffect(() => {
    let isMounted = true
    const applyTheme = async () => {
      try {
        const cached = localStorage.getItem('paisatrack_theme')
        if (cached && cached !== 'system') {
          document.documentElement.setAttribute('data-theme', cached)
          document.querySelector('meta[name="theme-color"]')?.setAttribute('content', cached === 'light' ? '#f8fafc' : '#0f141c')
        }

        if (!database.isOpen()) {
          await database.open()
        }
        const settings = await database.settings.get('app-settings')
        if (!isMounted) return
        const theme = settings?.theme ?? cached ?? 'system'
        if (theme === 'system') {
          document.documentElement.removeAttribute('data-theme')
          const isSystemDark = window.matchMedia('(prefers-color-scheme: dark)').matches
          document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isSystemDark ? '#0f141c' : '#f8fafc')
        } else {
          document.documentElement.setAttribute('data-theme', theme)
          document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f8fafc' : '#0f141c')
        }
      } catch {
        // Fallback silently if database is initializing
      }
    }
    applyTheme()

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleMediaChange = (e: MediaQueryListEvent) => {
      const currentTheme = localStorage.getItem('paisatrack_theme') ?? 'system'
      if (currentTheme === 'system') {
        document.querySelector('meta[name="theme-color"]')?.setAttribute('content', e.matches ? '#0f141c' : '#f8fafc')
      }
    }
    mediaQuery.addEventListener('change', handleMediaChange)

    return () => {
      isMounted = false
      mediaQuery.removeEventListener('change', handleMediaChange)
    }
  }, [database, dataRevision])

  const handleDataMutated = () => {
    setDataRevision((prev) => prev + 1)
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="app-title-group">
          <h1 className="app-title">PaisaTrack</h1>
          {!isOnline && (
            <span
              className="app-offline-badge"
              role="status"
              aria-label="Offline Mode: All data is stored locally in IndexedDB"
            >
              <WifiOff size={11} aria-hidden="true" />
              <span>Offline</span>
            </span>
          )}
        </div>
        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
          ₹ INR
        </span>
      </header>

      <main className="app-main">
        {activeTab === 'home' && (
          <div>
            <h2 className="sr-only">Home</h2>
            {homeView === 'dashboard' ? (
              <DashboardPage
                database={database}
                refreshTrigger={dataRevision}
                onTransactionMutated={handleDataMutated}
                onViewAllTransactions={() => setHomeView('history')}
              />
            ) : (
              <div>
                <div style={{ marginBottom: 'var(--space-xs)' }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setHomeView('dashboard')}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 'var(--space-2xs)',
                      padding: 'var(--space-2xs) var(--space-sm)',
                      fontSize: 'var(--font-size-xs)',
                    }}
                    aria-label="Back to Dashboard"
                  >
                    <ArrowLeft size={14} />
                    <span>Back to Dashboard</span>
                  </button>
                </div>
                <TransactionListPage
                  database={database}
                  refreshTrigger={dataRevision}
                  onTransactionMutated={handleDataMutated}
                />
              </div>
            )}
          </div>
        )}

        {activeTab === 'quick-add' && (
          <ChatPage
            database={database}
            onTransactionCreated={handleDataMutated}
          />
        )}

        {activeTab === 'calendar' && (
          <CalendarPage
            database={database}
            refreshTrigger={dataRevision}
            onTransactionMutated={handleDataMutated}
          />
        )}

        {activeTab === 'insights' && (
          <div>
            <h2 className="sr-only">Insights</h2>
            <AnalyticsPage
              database={database}
              refreshTrigger={dataRevision}
            />
          </div>
        )}

        {activeTab === 'settings' && (
          <div>
            <h2 className="sr-only">Settings</h2>
            <SettingsPage
              database={database}
              onDataMutated={handleDataMutated}
            />
          </div>
        )}
      </main>

      <nav className="app-bottom-nav" aria-label="Main Navigation">
        {NAV_TABS.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              className={`nav-item ${isActive ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
              aria-current={isActive ? 'page' : undefined}
              aria-label={tab.label}
            >
              <Icon size={20} strokeWidth={isActive ? 2.25 : 1.75} aria-hidden="true" />
              <span>{tab.label}</span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}
