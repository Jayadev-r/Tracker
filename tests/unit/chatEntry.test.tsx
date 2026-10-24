import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ChatPage } from '../../src/features/chat-entry/ChatPage'
import { PaisaTrackDatabase } from '../../src/db/database'
import { initializeDatabase } from '../../src/db/init'
import { generateUuid } from '../../src/utils/ids'

describe('Quick Add Chat UI & Integration (Phase 3)', () => {
  let testDb: PaisaTrackDatabase
  let dbName: string

  beforeEach(async () => {
    dbName = `test_chat_ui_${generateUuid()}`
    testDb = new PaisaTrackDatabase(dbName)
    await initializeDatabase(testDb)

    // Add a secondary bank account for transfer tests
    await testDb.accounts.add({
      id: generateUuid(),
      name: 'Bank',
      type: 'bank',
      openingBalancePaise: 500000,
      openingBalanceDate: '2026-10-24',
      isArchived: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
  })

  afterEach(async () => {
    if (testDb.isOpen()) {
      await testDb.delete()
      testDb.close()
    }
  })

  it('renders chat input bar and examples trigger', async () => {
    render(<ChatPage database={testDb} />)

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Transaction message' })).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: 'Process transaction' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Toggle example commands' })).toBeInTheDocument()
  })

  it('shows review card on parsing "150 food" WITHOUT saving to database automatically', async () => {
    render(<ChatPage database={testDb} />)

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Transaction message' })).toBeInTheDocument()
    })

    const input = screen.getByRole('textbox', { name: 'Transaction message' })
    fireEvent.change(input, { target: { value: '150 food' } })
    fireEvent.click(screen.getByRole('button', { name: 'Process transaction' }))

    // Review card should be rendered
    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Transaction Review Card' })).toBeInTheDocument()
    })

    expect(screen.getByRole('spinbutton', { name: 'Amount in rupees' })).toHaveValue(150)
    expect(screen.getByRole('combobox', { name: 'Transaction Type' })).toHaveValue('expense')

    // CRITICAL: Database MUST NOT have any saved transactions yet!
    const txCount = await testDb.transactions.count()
    expect(txCount).toBe(0)
  })

  it('saves transaction only after user clicks Confirm & Save and clears input', async () => {
    render(<ChatPage database={testDb} />)

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Transaction message' })).toBeInTheDocument()
    })

    const input = screen.getByRole('textbox', { name: 'Transaction message' })
    fireEvent.change(input, { target: { value: '150 food' } })
    fireEvent.click(screen.getByRole('button', { name: 'Process transaction' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Confirm & Save' })).toBeInTheDocument()
    })

    // Click Confirm & Save
    fireEvent.click(screen.getByRole('button', { name: 'Confirm & Save' }))

    // Success notification should appear
    await waitFor(() => {
      expect(screen.getByText(/Saved ₹150\.00/i)).toBeInTheDocument()
    })

    // Transaction must now be persisted in database
    const saved = await testDb.transactions.toArray()
    expect(saved).toHaveLength(1)
    expect(saved[0]?.amountPaise).toBe(15000)
    expect(saved[0]?.type).toBe('expense')

    // Input text must be cleared after save
    expect(input).toHaveValue('')
  })

  it('discards transaction without persisting when user clicks Discard', async () => {
    render(<ChatPage database={testDb} />)

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Transaction message' })).toBeInTheDocument()
    })

    const input = screen.getByRole('textbox', { name: 'Transaction message' })
    fireEvent.change(input, { target: { value: '250 shopping' } })
    fireEvent.click(screen.getByRole('button', { name: 'Process transaction' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Discard' })).toBeInTheDocument()
    })

    // Click Discard
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))

    // Card should disappear
    await waitFor(() => {
      expect(
        screen.queryByRole('region', { name: 'Transaction Review Card' })
      ).not.toBeInTheDocument()
    })

    // Database must remain empty
    expect(await testDb.transactions.count()).toBe(0)
  })

  it('allows user to edit draft fields (amount, description) before confirming', async () => {
    render(<ChatPage database={testDb} />)

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Transaction message' })).toBeInTheDocument()
    })

    const input = screen.getByRole('textbox', { name: 'Transaction message' })
    fireEvent.change(input, { target: { value: '100 food' } })
    fireEvent.click(screen.getByRole('button', { name: 'Process transaction' }))

    await waitFor(() => {
      expect(screen.getByRole('spinbutton', { name: 'Amount in rupees' })).toBeInTheDocument()
    })

    // Edit amount from 100 to 180.50
    const amountInput = screen.getByRole('spinbutton', { name: 'Amount in rupees' })
    fireEvent.change(amountInput, { target: { value: '180.50' } })

    // Edit description
    const descInput = screen.getByRole('textbox', { name: 'Description' })
    fireEvent.change(descInput, { target: { value: 'Dinner with friends' } })

    // Confirm & Save
    fireEvent.click(screen.getByRole('button', { name: 'Confirm & Save' }))

    await waitFor(() => {
      expect(screen.getByText(/Saved ₹180\.50/i)).toBeInTheDocument()
    })

    const saved = await testDb.transactions.toArray()
    expect(saved).toHaveLength(1)
    expect(saved[0]?.amountPaise).toBe(18050)
    expect(saved[0]?.description).toBe('Dinner with friends')
  })

  it('displays clarification prompt when category is missing ("150")', async () => {
    render(<ChatPage database={testDb} />)

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Transaction message' })).toBeInTheDocument()
    })

    const input = screen.getByRole('textbox', { name: 'Transaction message' })
    fireEvent.change(input, { target: { value: '150' } })
    fireEvent.click(screen.getByRole('button', { name: 'Process transaction' }))

    await waitFor(() => {
      expect(screen.getByRole('status')).toBeInTheDocument()
      expect(screen.getByText(/Clarification needed:/i)).toBeInTheDocument()
      expect(screen.getByText(/choose a category/i)).toBeInTheDocument()
    })

    // Review card should still allow picking a category
    expect(screen.getByRole('region', { name: 'Transaction Review Card' })).toBeInTheDocument()
  })

  it('displays actionable error message for invalid inputs like multiple amounts', async () => {
    render(<ChatPage database={testDb} />)

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Transaction message' })).toBeInTheDocument()
    })

    const input = screen.getByRole('textbox', { name: 'Transaction message' })
    fireEvent.change(input, { target: { value: '150 food 200 fuel' } })
    fireEvent.click(screen.getByRole('button', { name: 'Process transaction' }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
      expect(screen.getByText(/Multiple amounts detected/i)).toBeInTheDocument()
    })

    // User's input is preserved for editing
    expect(input).toHaveValue('150 food 200 fuel')
    expect(await testDb.transactions.count()).toBe(0)
  })

  it('handles transfer drafts without becoming ordinary expenses', async () => {
    render(<ChatPage database={testDb} />)

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Transaction message' })).toBeInTheDocument()
    })

    const input = screen.getByRole('textbox', { name: 'Transaction message' })
    fireEvent.change(input, { target: { value: 'transfer 500 from bank to cash' } })
    fireEvent.click(screen.getByRole('button', { name: 'Process transaction' }))

    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Transaction Review Card' })).toBeInTheDocument()
      expect(screen.getByRole('combobox', { name: 'Transaction Type' })).toHaveValue('transfer')
    })

    // Confirm & Save
    fireEvent.click(screen.getByRole('button', { name: 'Confirm & Save' }))

    await waitFor(() => {
      expect(screen.getByText(/Saved ₹500\.00/i)).toBeInTheDocument()
    })

    // Check that two transfer records were created sharing transferGroupId
    const records = await testDb.transactions.toArray()
    expect(records).toHaveLength(2)
    expect(records[0]?.type).toBe('transfer')
    expect(records[1]?.type).toBe('transfer')
    expect(records[0]?.transferGroupId).toBe(records[1]?.transferGroupId)
  })
})
