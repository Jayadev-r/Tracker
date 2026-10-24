import { useState, useEffect, useMemo } from 'react'
import type { Category, Account, AppSettings } from '../../types'
import { db as defaultDb, PaisaTrackDatabase } from '../../db/database'
import { initializeDatabase } from '../../db/init'
import { parseTransaction, type TransactionDraft, type ParseResult } from './parseTransaction'
import { ChatInput } from './ChatInput'
import { TransactionDraftCard } from './TransactionDraftCard'
import { TransactionService } from '../../services/transactionService'
import { formatPaise } from '../../utils/money'
import { HelpCircle, CheckCircle2, AlertCircle } from 'lucide-react'
import './chat.css'

interface ChatMessage {
  id: string
  sender: 'user' | 'system'
  text: string
  type?: 'info' | 'success' | 'warning' | 'error'
  timestamp: string
}

const EXAMPLE_PHRASES = [
  '150 food',
  'shopping - 2000',
  'salary 36000',
  'spent 300 on lunch',
  '200 fuel yesterday',
  'refund 250 shopping',
  'transfer 500 from bank to cash',
]

interface ChatPageProps {
  database?: PaisaTrackDatabase
  initialDate?: string
  onTransactionCreated?: () => void
}

export function ChatPage({
  database = defaultDb,
  initialDate,
  onTransactionCreated,
}: ChatPageProps) {
  const [categories, setCategories] = useState<Category[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)

  const [inputText, setInputText] = useState<string>('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [currentDraft, setCurrentDraft] = useState<TransactionDraft | null>(null)
  const [clarificationQuestions, setClarificationQuestions] = useState<string[] | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState<boolean>(false)
  const [showExamples, setShowExamples] = useState<boolean>(false)

  // Load database entities
  useEffect(() => {
    let isMounted = true

    async function loadData() {
      try {
        await initializeDatabase(database)
        const [cats, accs, sets] = await Promise.all([
          database.categories.toArray(),
          database.accounts.toArray(),
          database.settings.get('app-settings'),
        ])
        if (isMounted) {
          setCategories(cats)
          setAccounts(accs)
          setSettings(sets ?? null)
          setIsLoading(false)
        }
      } catch (err) {
        if (isMounted) {
          setErrorMessage('Failed to connect to database. Please reload the app.')
          setIsLoading(false)
        }
      }
    }

    loadData()
    return () => {
      isMounted = false
    }
  }, [database])

  const handleParse = () => {
    if (!inputText.trim() || isSaving) return

    setErrorMessage(null)
    setClarificationQuestions(null)

    const textToParse = inputText.trim()

    // Add user message to history
    const userMsg: ChatMessage = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      sender: 'user',
      text: textToParse,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }
    setMessages((prev) => [...prev, userMsg])

    // Run deterministic local parser
    const result: ParseResult = parseTransaction(textToParse, {
      categories,
      accounts,
      defaultAccountId: settings?.defaultAccountId ?? null,
      defaultDate: initialDate,
    })

    if (result.status === 'invalid') {
      setErrorMessage(result.message)
      // Keep input text so user can correct it
    } else if (result.status === 'needs_clarification') {
      setClarificationQuestions(result.questions)
      // If we have a partial draft, present it in draft card so user can complete missing fields
      if (result.draft.amountPaise) {
        setCurrentDraft({
          type: result.draft.type ?? 'expense',
          amountPaise: result.draft.amountPaise,
          categoryId: result.draft.categoryId ?? null,
          accountId: result.draft.accountId ?? settings?.defaultAccountId ?? accounts[0]?.id ?? null,
          transferToAccountId: result.draft.transferToAccountId ?? null,
          description: result.draft.description ?? textToParse,
          transactionDate: result.draft.transactionDate ?? initialDate ?? new Date().toISOString().split('T')[0]!,
          source: 'chat',
          originalText: textToParse,
          refundOfId: null,
        })
      }
    } else if (result.status === 'success') {
      setCurrentDraft(result.draft)
    }
  }

  const txService = useMemo(() => new TransactionService(database), [database])

  const handleConfirmSave = async (confirmed: TransactionDraft) => {
    setIsSaving(true)
    setErrorMessage(null)

    try {
      if (confirmed.type === 'transfer') {
        if (!confirmed.accountId || !confirmed.transferToAccountId) {
          throw new Error('Both source and destination accounts are required for a transfer.')
        }
        await txService.createTransfer({
          sourceAccountId: confirmed.accountId,
          destinationAccountId: confirmed.transferToAccountId,
          amountPaise: confirmed.amountPaise,
          transactionDate: confirmed.transactionDate,
          description: confirmed.description,
          source: 'chat',
        })
      } else if (confirmed.type === 'refund') {
        if (!confirmed.accountId) {
          throw new Error('An account is required for a refund.')
        }
        await txService.createRefund({
          amountPaise: confirmed.amountPaise,
          accountId: confirmed.accountId,
          categoryId: confirmed.categoryId,
          description: confirmed.description,
          transactionDate: confirmed.transactionDate,
          refundOfId: confirmed.refundOfId,
          source: 'chat',
        })
      } else {
        if (!confirmed.accountId) {
          throw new Error('An account is required.')
        }
        await txService.createTransaction({
          type: confirmed.type,
          amountPaise: confirmed.amountPaise,
          categoryId: confirmed.categoryId,
          accountId: confirmed.accountId,
          description: confirmed.description,
          transactionDate: confirmed.transactionDate,
          source: 'chat',
        })
      }

      // Successful save
      const categoryName = categories.find((c) => c.id === confirmed.categoryId)?.name ?? confirmed.type
      const successText = `Saved ${formatPaise(confirmed.amountPaise)} (${categoryName})`

      const confirmMsg: ChatMessage = {
        id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
        sender: 'system',
        text: successText,
        type: 'success',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }

      setMessages((prev) => [...prev, confirmMsg])
      setCurrentDraft(null)
      setClarificationQuestions(null)
      setInputText('') // Clear input only after successful save
      onTransactionCreated?.()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save transaction.'
      setErrorMessage(msg)
      // Keep draft visible so user does not lose input
    } finally {
      setIsSaving(false)
    }
  }

  const handleDiscard = () => {
    setCurrentDraft(null)
    setClarificationQuestions(null)
    setErrorMessage(null)
  }

  if (isLoading) {
    return (
      <div style={{ padding: 'var(--space-lg)', textAlign: 'center', color: 'var(--color-text-muted)' }}>
        Loading PaisaTrack...
      </div>
    )
  }

  return (
    <div className="chat-page">
      {/* Help / Examples Accordion */}
      <div className="examples-tray">
        <button
          type="button"
          onClick={() => setShowExamples((prev) => !prev)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2xs)',
            fontSize: 'var(--font-size-xs)',
            color: 'var(--color-brand)',
            padding: 'var(--space-2xs) 0',
          }}
          aria-expanded={showExamples}
          aria-label="Toggle example commands"
        >
          <HelpCircle size={14} />
          <span>{showExamples ? 'Hide example phrases' : 'View example phrases'}</span>
        </button>

        {showExamples && (
          <div className="examples-pills">
            {EXAMPLE_PHRASES.map((phrase) => (
              <button
                key={phrase}
                type="button"
                className="example-pill"
                onClick={() => setInputText(phrase)}
              >
                {phrase}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Messages History */}
      <div className="chat-history">
        {messages.length === 0 && !currentDraft && (
          <div
            style={{
              padding: 'var(--space-lg)',
              textAlign: 'center',
              color: 'var(--color-text-muted)',
              fontSize: 'var(--font-size-sm)',
            }}
          >
            Type a message like <strong>150 food</strong> or <strong>salary 36000</strong> to add an entry.
          </div>
        )}

        {messages.map((m) => (
          <div
            key={m.id}
            className={`chat-bubble ${m.sender === 'user' ? 'chat-bubble-user' : 'chat-bubble-system'}`}
          >
            {m.type === 'success' && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--color-income)' }}>
                <CheckCircle2 size={16} />
              </span>
            )}
            <span>{m.text}</span>
          </div>
        ))}

        {/* Clarification Prompts */}
        {clarificationQuestions && clarificationQuestions.length > 0 && (
          <div
            style={{
              background: 'var(--color-warning-bg)',
              color: 'var(--color-warning)',
              border: '1px solid var(--color-warning)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-sm) var(--space-md)',
              fontSize: 'var(--font-size-sm)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-2xs)',
            }}
            role="status"
          >
            <strong>Clarification needed:</strong>
            {clarificationQuestions.map((q, idx) => (
              <div key={idx}>{q}</div>
            ))}
          </div>
        )}

        {/* Global Error Banner */}
        {errorMessage && (
          <div
            style={{
              background: 'var(--color-expense-bg)',
              color: 'var(--color-expense)',
              border: '1px solid var(--color-expense)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-sm) var(--space-md)',
              fontSize: 'var(--font-size-sm)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-xs)',
            }}
            role="alert"
          >
            <AlertCircle size={16} />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Active Transaction Review Card */}
        {currentDraft && (
          <TransactionDraftCard
            draft={currentDraft}
            categories={categories}
            accounts={accounts}
            isSaving={isSaving}
            onConfirm={handleConfirmSave}
            onCancel={handleDiscard}
          />
        )}
      </div>

      {/* Input Bar */}
      <ChatInput
        value={inputText}
        onChange={setInputText}
        onSubmit={handleParse}
        disabled={isSaving}
      />
    </div>
  )
}
