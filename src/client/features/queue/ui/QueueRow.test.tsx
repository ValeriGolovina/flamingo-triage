/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ItemStatus, Role } from '@/shared/model/domain'
import type { QueueItem } from '@/shared/model/queue'

import { QueueRow } from './QueueRow'

afterEach(cleanup)

const ME = 'me-1'
const OTHER = { id: 'other-1', name: 'Dmytro Bondar' }

const item = (over: Partial<QueueItem> = {}): QueueItem => ({
  id: 'i-1',
  title: 'Card declined at checkout',
  status: ItemStatus.Open,
  claimedBy: null,
  claimedAt: null,
  resolvedBy: null,
  resolvedAt: null,
  createdAt: new Date(Date.now() - 3 * 60_000).toISOString(),
  ...over,
})

function renderRow(over: Partial<QueueItem> = {}, props: Partial<Parameters<typeof QueueRow>[0]> = {}) {
  const handlers = { onClaim: vi.fn(), onRelease: vi.fn(), onResolve: vi.fn() }
  render(
    <QueueRow
      item={item(over)}
      currentUserId={ME}
      role={Role.Member}
      isPending={false}
      now={Date.now()}
      {...handlers}
      {...props}
    />,
  )
  return handlers
}

/**
 * These are the questions the brief asks of the interface, not assertions about
 * markup: who holds this, what a viewer may do, and whether a control ever
 * silently does nothing.
 */
describe('QueueRow', () => {
  it('names the holder without needing a click', () => {
    renderRow({ status: ItemStatus.Claimed, claimedBy: OTHER, claimedAt: new Date().toISOString() })
    expect(screen.getByText(OTHER.name)).toBeDefined()
  })

  it('offers Claim on an open item and reports which item was claimed', async () => {
    const { onClaim } = renderRow()
    await userEvent.click(screen.getByRole('button', { name: 'Claim' }))
    expect(onClaim).toHaveBeenCalledWith('i-1')
  })

  it('disables Claim for a viewer and says why, rather than hiding it', () => {
    renderRow({}, { role: Role.Viewer })
    const button = screen.getByRole('button', { name: 'Claim' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(button.title).toContain('cannot claim')
  })

  it('offers no action on an item somebody else holds', () => {
    renderRow({ status: ItemStatus.Claimed, claimedBy: OTHER, claimedAt: new Date().toISOString() })
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText('Held')).toBeDefined()
  })

  it('offers Release and Resolve on an item I hold, and marks it as mine', () => {
    renderRow({
      status: ItemStatus.Claimed,
      claimedBy: { id: ME, name: 'Anya Kovalenko' },
      claimedAt: new Date().toISOString(),
    })
    expect(screen.getByRole('button', { name: 'Release' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Resolve' })).toBeDefined()
    expect(screen.getByText('(you)')).toBeDefined()
  })

  it('shows a pending state that asserts nothing while a claim is in flight', () => {
    renderRow({}, { isPending: true })
    // No button to click twice, and the status badge still says Open — the row
    // does not claim to be mine before the server has said so.
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText('Working…')).toBeDefined()
    expect(screen.getByText('Open')).toBeDefined()
  })

  /**
   * The row is memoised, so nothing about an unchanged item makes it re-render.
   * Before `now` was a prop, the age it printed first was the age it printed
   * forever: this test failed with '1m' after twenty simulated minutes.
   */
  it('keeps the age moving even when the item itself never changes', () => {
    const createdAt = new Date(Date.now() - 60_000).toISOString()
    const props = {
      item: item({ createdAt }),
      currentUserId: ME,
      role: Role.Member,
      isPending: false,
      onClaim: vi.fn(),
      onRelease: vi.fn(),
      onResolve: vi.fn(),
    }

    const { rerender } = render(<QueueRow {...props} now={Date.now()} />)
    expect(screen.getByTitle(createdAt).textContent).toBe('1m')

    // Same item object, twenty minutes later — exactly what a poll tick that
    // changed nothing hands back.
    rerender(<QueueRow {...props} now={Date.now() + 20 * 60_000} />)
    expect(screen.getByTitle(createdAt).textContent).toBe('21m')
  })

  it('leaves a resolved item with no action at all', () => {
    renderRow({
      status: ItemStatus.Resolved,
      resolvedBy: OTHER,
      resolvedAt: new Date().toISOString(),
    })
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText('Done')).toBeDefined()
  })
})
