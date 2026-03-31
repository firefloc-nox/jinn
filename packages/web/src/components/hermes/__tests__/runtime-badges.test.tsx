import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import { RuntimeBadges } from '../runtime-badges'

describe('RuntimeBadges', () => {
  it('renders active brain, profile, provider/model, MCP, and Honcho badges', () => {
    render(
      <RuntimeBadges
        requestedBrain="hermes"
        actualExecutor="hermes"
        hermesRuntimeMeta={{
          profile: 'ops',
          provider: 'anthropic',
          model: 'claude-sonnet-4-5',
          mcp: true,
          honcho: true,
        }}
      />,
    )

    expect(screen.getByText('Hermes')).toBeTruthy()
    expect(screen.getByText('Profile ops')).toBeTruthy()
    expect(screen.getByText('anthropic / claude-sonnet-4-5')).toBeTruthy()
    expect(screen.getByText('MCP')).toBeTruthy()
    expect(screen.getByText('Honcho')).toBeTruthy()
  })

  it('renders fallback executor badge when actual executor differs from requested brain', () => {
    render(
      <RuntimeBadges
        requestedBrain="hermes"
        actualExecutor="codex"
        hermesRuntimeMeta={{ profile: 'ops' }}
      />,
    )

    expect(screen.getByText('Fallback Codex')).toBeTruthy()
  })

  it('stays quiet when optional metadata is missing', () => {
    render(<RuntimeBadges requestedBrain="claude" actualExecutor="claude" />)

    expect(screen.getByText('Claude')).toBeTruthy()
    expect(screen.queryByText(/Profile /)).toBeNull()
    expect(screen.queryByText('MCP')).toBeNull()
    expect(screen.queryByText('Honcho')).toBeNull()
  })
})
