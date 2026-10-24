import { useState } from 'react'
import { Home, MessageSquarePlus, Calendar, PieChart, Settings } from 'lucide-react'
import { ChatPage } from './features/chat-entry/ChatPage'

type Tab = 'home' | 'quick-add' | 'calendar' | 'insights' | 'settings'

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

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('quick-add')

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="app-title-group">
          <h1 className="app-title">PaisaTrack</h1>
          <span className="app-badge">Phase 3</span>
        </div>
        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
          ₹ INR • Local-first
        </span>
      </header>

      <main className="app-main">
        {activeTab === 'quick-add' ? (
          <ChatPage />
        ) : (
          <section
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-lg)',
              padding: 'var(--space-lg)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-md)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ fontSize: 'var(--font-size-base)', fontWeight: 600 }}>
                {NAV_TABS.find((t) => t.id === activeTab)?.label ?? 'Overview'}
              </h2>
              <span
                style={{
                  fontSize: 'var(--font-size-xs)',
                  color: 'var(--color-income)',
                  background: 'var(--color-income-bg)',
                  padding: '0.2rem 0.5rem',
                  borderRadius: 'var(--radius-full)',
                  fontWeight: 600,
                }}
              >
                Ready
              </span>
            </div>

            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
              {activeTab === 'home'
                ? 'Welcome to PaisaTrack. Use Quick Add below to record your transactions.'
                : `Section "${NAV_TABS.find((t) => t.id === activeTab)?.label}" is prepared for implementation in subsequent phases.`}
            </p>

            <div
              style={{
                padding: 'var(--space-sm) var(--space-md)',
                background: 'var(--color-surface-elevated)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border-subtle)',
                fontSize: 'var(--font-size-xs)',
                color: 'var(--color-text-muted)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-2xs)',
              }}
            >
              <div><strong>Active View:</strong> {activeTab}</div>
              <div><strong>Currency:</strong> Indian Rupee (INR, ₹)</div>
              <div><strong>Privacy:</strong> Zero telemetry • Local device storage</div>
            </div>
          </section>
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
