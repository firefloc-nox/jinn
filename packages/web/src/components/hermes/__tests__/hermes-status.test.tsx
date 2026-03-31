import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mock the hook before importing the component
// ---------------------------------------------------------------------------

vi.mock('@/hooks/use-hermes', () => ({
  useHermesStatus: vi.fn(),
}))

import { useHermesStatus } from '@/hooks/use-hermes'
import { HermesStatusBadge } from '../hermes-status'

const mockStatus = useHermesStatus as ReturnType<typeof vi.fn>

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HermesStatusBadge', () => {
  it('renders "Hermes" text in all states', () => {
    mockStatus.mockReturnValue('connected')
    const { unmount } = render(<HermesStatusBadge />)
    expect(screen.getByText('Hermes')).toBeDefined()
    unmount()
  })

  it('renders connected state with accessible label', () => {
    mockStatus.mockReturnValue('connected')
    render(<HermesStatusBadge />)
    const el = screen.getByLabelText('Hermes — connected')
    expect(el).toBeDefined()
  })

  it('renders disconnected state with accessible label', () => {
    mockStatus.mockReturnValue('disconnected')
    render(<HermesStatusBadge />)
    const el = screen.getByLabelText('Hermes — disconnected')
    expect(el).toBeDefined()
  })

  it('renders loading state with accessible label', () => {
    mockStatus.mockReturnValue('loading')
    render(<HermesStatusBadge />)
    const el = screen.getByLabelText('Hermes — checking')
    expect(el).toBeDefined()
  })

  it('applies custom className prop', () => {
    mockStatus.mockReturnValue('connected')
    render(<HermesStatusBadge className="test-custom-class" />)
    const el = screen.getByLabelText('Hermes — connected')
    expect(el.className).toContain('test-custom-class')
  })

  it('connected badge does not have title (no tooltip needed)', () => {
    mockStatus.mockReturnValue('connected')
    render(<HermesStatusBadge />)
    const el = screen.getByLabelText('Hermes — connected')
    expect(el.getAttribute('title')).toBeNull()
  })

  it('disconnected badge has tooltip text', () => {
    mockStatus.mockReturnValue('disconnected')
    render(<HermesStatusBadge />)
    const el = screen.getByLabelText('Hermes — disconnected')
    expect(el.getAttribute('title')).toBe('Hermes WebAPI unavailable')
  })

  it('renders tristate correctly: connected → disconnected → loading', () => {
    // connected
    mockStatus.mockReturnValue('connected')
    const { unmount: u1, rerender: r1 } = render(<HermesStatusBadge />)
    expect(screen.getByLabelText('Hermes — connected')).toBeDefined()
    u1()

    // disconnected
    mockStatus.mockReturnValue('disconnected')
    const { unmount: u2 } = render(<HermesStatusBadge />)
    expect(screen.getByLabelText('Hermes — disconnected')).toBeDefined()
    u2()

    // loading
    mockStatus.mockReturnValue('loading')
    render(<HermesStatusBadge />)
    expect(screen.getByLabelText('Hermes — checking')).toBeDefined()
  })
})
