import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import App from './App'

describe('PaisaTrack Application Shell (Phase 0 Smoke Test)', () => {
  it('renders the header title and Phase 0 badge', () => {
    render(<App />)
    expect(screen.getByRole('heading', { level: 1, name: /PaisaTrack/i })).toBeInTheDocument()
    expect(screen.getByText('Phase 0')).toBeInTheDocument()
  })

  it('renders all 5 main navigation tabs', () => {
    render(<App />)
    expect(screen.getByRole('button', { name: 'Home' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Quick Add' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Calendar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Insights' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument()
  })

  it('switches active tab when navigation item is clicked', () => {
    render(<App />)
    const quickAddButton = screen.getByRole('button', { name: 'Quick Add' })
    fireEvent.click(quickAddButton)

    expect(screen.getByRole('heading', { level: 2, name: 'Quick Add' })).toBeInTheDocument()
    expect(quickAddButton).toHaveAttribute('aria-current', 'page')
  })
})
