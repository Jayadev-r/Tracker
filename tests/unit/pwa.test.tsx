import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import fs from 'node:fs'
import path from 'node:path'
import App from '../../src/App'

describe('PWA Configuration, Icons, and Offline Shell (Phase 7)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('validates public icon files exist with proper formats and magic bytes', () => {
    const publicDir = path.resolve(__dirname, '../../public')

    const pngFiles = [
      'pwa-192x192.png',
      'pwa-512x512.png',
      'maskable-icon-512x512.png',
      'apple-touch-icon.png',
    ]

    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

    for (const file of pngFiles) {
      const filePath = path.join(publicDir, file)
      expect(fs.existsSync(filePath), `Expected ${file} to exist in public/`).toBe(true)
      const buffer = fs.readFileSync(filePath)
      expect(buffer.length).toBeGreaterThan(100)
      // Check standard PNG magic bytes
      expect(buffer.subarray(0, 8).equals(pngHeader), `${file} should have standard PNG magic header`).toBe(true)
    }

    // Verify SVG favicon
    const svgPath = path.join(publicDir, 'favicon.svg')
    expect(fs.existsSync(svgPath)).toBe(true)
    const svgContent = fs.readFileSync(svgPath, 'utf-8')
    expect(svgContent).toContain('<svg')
    expect(svgContent).toContain('viewBox="0 0 512 512"')

    // Verify favicon.ico
    const icoPath = path.join(publicDir, 'favicon.ico')
    expect(fs.existsSync(icoPath)).toBe(true)
    expect(fs.statSync(icoPath).size).toBeGreaterThan(50)
  })

  it('validates index.html contains iPhone Apple standalone tags and safe-area viewport', () => {
    const indexPath = path.resolve(__dirname, '../../index.html')
    const html = fs.readFileSync(indexPath, 'utf-8')

    // Viewport with cover for iPhone 17 notch / Dynamic Island
    expect(html).toContain('viewport-fit=cover')
    expect(html).toContain('name="viewport"')

    // Apple Standalone Web App tags
    expect(html).toContain('<meta name="apple-mobile-web-app-capable" content="yes"')
    expect(html).toContain('<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"')
    expect(html).toContain('<meta name="apple-mobile-web-app-title" content="PaisaTrack"')
    expect(html).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png"')

    // Theme color
    expect(html).toContain('<meta name="theme-color" content="#0f141c"')

    // Application Title
    expect(html).toContain('<title>PaisaTrack - Expense Tracker</title>')
  })

  it('validates CSS design system specifies safe-area insets and 44px min touch targets', () => {
    const varsPath = path.resolve(__dirname, '../../src/styles/variables.css')
    const css = fs.readFileSync(varsPath, 'utf-8')

    expect(css).toContain('--safe-top: env(safe-area-inset-top')
    expect(css).toContain('--safe-bottom: env(safe-area-inset-bottom')
    expect(css).toContain('--safe-left: env(safe-area-inset-left')
    expect(css).toContain('--safe-right: env(safe-area-inset-right')
    expect(css).toContain('--min-touch-target: 44px')
    expect(css).toContain('--max-app-width: 480px')
  })

  it('displays offline indicator badge when network connectivity is lost', () => {
    // Render initially
    render(<App />)

    // Offline badge is not present when online
    expect(screen.queryByText('Offline')).not.toBeInTheDocument()

    // Trigger window offline event
    act(() => {
      fireEvent(window, new Event('offline'))
    })

    // Offline badge appears in header
    expect(screen.getByText('Offline')).toBeInTheDocument()
    expect(screen.getByRole('status', { name: /Offline Mode/i })).toBeInTheDocument()

    // Trigger window online event
    act(() => {
      fireEvent(window, new Event('online'))
    })

    // Offline badge disappears
    expect(screen.queryByText('Offline')).not.toBeInTheDocument()
  })

  it('verifies production build dist artifacts include manifest, sw.js, and precached shell', () => {
    const distDir = path.resolve(__dirname, '../../dist')
    const manifestPath = path.join(distDir, 'manifest.webmanifest')
    const swPath = path.join(distDir, 'sw.js')

    if (fs.existsSync(distDir)) {
      expect(fs.existsSync(manifestPath), 'manifest.webmanifest should exist in dist/').toBe(true)
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))

      expect(manifest.name).toBe('PaisaTrack - Expense Tracker')
      expect(manifest.short_name).toBe('PaisaTrack')
      expect(manifest.display).toBe('standalone')
      expect(manifest.orientation).toBe('portrait')
      expect(manifest.start_url).toBe('/')
      expect(manifest.theme_color).toBe('#0f141c')
      expect(manifest.background_color).toBe('#0f141c')

      // Icons in manifest
      expect(manifest.icons.length).toBeGreaterThanOrEqual(3)
      const hasMaskable = manifest.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')
      expect(hasMaskable).toBe(true)

      // Service worker in dist
      expect(fs.existsSync(swPath), 'sw.js should exist in dist/').toBe(true)
      const swContent = fs.readFileSync(swPath, 'utf-8')
      expect(swContent).toContain('precacheAndRoute')
    }
  })
})
