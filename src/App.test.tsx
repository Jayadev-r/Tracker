import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import App from './App'

describe('PaisaTrack Application Shell (Navigation & Shell Smoke Test)', () => {
  it('renders the header title and currency label', () => {
    render(<App />)
    expect(screen.getByRole('heading', { level: 1, name: /PaisaTrack/i })).toBeInTheDocument()
    expect(screen.getByText(/INR/i)).toBeInTheDocument()
  })

  it('renders all 5 main navigation tabs', () => {
    render(<App />)
    expect(screen.getByRole('button', { name: 'Home' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Quick Add' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Calendar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Insights' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument()
  })

  it('switches active tab when navigation item is clicked', async () => {
    render(<App />)

    // Switch to Home tab
    const homeButton = screen.getByRole('button', { name: 'Home' })
    fireEvent.click(homeButton)

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: 'Home' })).toBeInTheDocument()
      expect(homeButton).toHaveAttribute('aria-current', 'page')
    })

    // Switch back to Quick Add tab
    const quickAddButton = screen.getByRole('button', { name: 'Quick Add' })
    fireEvent.click(quickAddButton)

    await waitFor(() => {
      expect(quickAddButton).toHaveAttribute('aria-current', 'page')
      expect(screen.getByRole('textbox', { name: 'Transaction message' })).toBeInTheDocument()
    })
  })
})
