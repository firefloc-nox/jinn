import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mock hooks — before imports
// ---------------------------------------------------------------------------

vi.mock('@/hooks/use-hermes', () => ({
  useHermesMemory: vi.fn(),
}))

vi.mock('@/components/page-layout', () => ({
  PageLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

import { useHermesMemory } from '@/hooks/use-hermes'
import HermesMemoryPage from '../page'

const mockMemoryHook = useHermesMemory as ReturnType<typeof vi.fn>

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockMemoryData = {
  memory: {
    entries: ['Agent fact A', 'Agent fact B'],
    usage: '45%',
  },
  user: {
    entries: ['User name: Firefloc', 'Prefers French'],
    usage: '20%',
  },
}

function defaultHook(overrides: Partial<ReturnType<typeof useHermesMemory>> = {}) {
  return {
    memory: mockMemoryData,
    loading: false,
    unavailable: false,
    update: vi.fn().mockResolvedValue({ status: 'ok' }),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockMemoryHook.mockReturnValue(defaultHook())
})

afterEach(() => vi.restoreAllMocks())

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HermesMemoryPage', () => {
  it('renders memory entries in Agent Memory column', () => {
    render(<HermesMemoryPage />)
    expect(screen.getByText('Agent fact A')).toBeDefined()
    expect(screen.getByText('Agent fact B')).toBeDefined()
  })

  it('renders user entries in User Profile column', () => {
    render(<HermesMemoryPage />)
    expect(screen.getByText('User name: Firefloc')).toBeDefined()
    expect(screen.getByText('Prefers French')).toBeDefined()
  })

  it('renders both column titles', () => {
    render(<HermesMemoryPage />)
    expect(screen.getByText('Agent Memory')).toBeDefined()
    expect(screen.getByText('User Profile')).toBeDefined()
  })

  it('shows usage bars with correct percentage text', () => {
    render(<HermesMemoryPage />)
    // Usage strings are displayed in UsageBar
    expect(screen.getByText('45%')).toBeDefined()
    expect(screen.getByText('20%')).toBeDefined()
  })

  it('clicking edit button on an entry reveals a textarea', async () => {
    render(<HermesMemoryPage />)
    // Edit buttons are aria-label="Edit entry" — they appear on hover
    // We need to directly trigger the button (testing-library doesn't do hover for CSS transitions)
    const editBtns = screen.getAllByLabelText('Edit entry')
    expect(editBtns.length).toBeGreaterThan(0)
    fireEvent.click(editBtns[0])
    // Textarea should now be visible
    const textarea = screen.getAllByRole('textbox')
    expect(textarea.length).toBeGreaterThan(0)
  })

  it('clicking delete button on an entry shows diff preview "Will be removed:"', async () => {
    render(<HermesMemoryPage />)
    const deleteBtns = screen.getAllByLabelText('Delete entry')
    expect(deleteBtns.length).toBeGreaterThan(0)
    fireEvent.click(deleteBtns[0])
    // DiffPreview shows "Will be removed:" text
    expect(screen.getByText('Will be removed:')).toBeDefined()
    // Entry not yet removed — still visible in the preview (as line-through text)
    // The original entry text should still be in the document
    expect(screen.getAllByText('Agent fact A').length).toBeGreaterThan(0)
  })

  it('clicking delete then Cancel does not call update', async () => {
    const update = vi.fn().mockResolvedValue({ status: 'ok' })
    mockMemoryHook.mockReturnValue(defaultHook({ update }))
    render(<HermesMemoryPage />)
    const deleteBtns = screen.getAllByLabelText('Delete entry')
    fireEvent.click(deleteBtns[0])
    const cancelBtn = screen.getByText('Cancel')
    fireEvent.click(cancelBtn)
    expect(update).not.toHaveBeenCalled()
  })

  it('clicking confirm delete calls update with action="remove"', async () => {
    const update = vi.fn().mockResolvedValue({ status: 'ok' })
    mockMemoryHook.mockReturnValue(defaultHook({ update }))
    render(<HermesMemoryPage />)

    const deleteBtns = screen.getAllByLabelText('Delete entry')
    fireEvent.click(deleteBtns[0])

    // Click "Delete" confirm button
    const confirmBtn = screen.getByText('Delete')
    fireEvent.click(confirmBtn)

    await waitFor(() => {
      expect(update).toHaveBeenCalledWith('memory', 'remove', '', 'Agent fact A')
    })
  })

  it('shows "Hermes WebAPI unavailable" banner when unavailable=true', () => {
    mockMemoryHook.mockReturnValue(defaultHook({ memory: null, unavailable: true }))
    render(<HermesMemoryPage />)
    expect(screen.getByText('Hermes WebAPI unavailable')).toBeDefined()
  })

  it('does not render memory columns when unavailable', () => {
    mockMemoryHook.mockReturnValue(defaultHook({ memory: null, unavailable: true }))
    render(<HermesMemoryPage />)
    expect(screen.queryByText('Agent Memory')).toBeNull()
    expect(screen.queryByText('User Profile')).toBeNull()
  })

  it('shows loading state when loading=true', () => {
    mockMemoryHook.mockReturnValue(defaultHook({ memory: null, loading: true }))
    render(<HermesMemoryPage />)
    expect(screen.getByText('Loading…')).toBeDefined()
  })

  it('renders page title "Memory"', () => {
    render(<HermesMemoryPage />)
    expect(screen.getByText('Memory')).toBeDefined()
  })
})
