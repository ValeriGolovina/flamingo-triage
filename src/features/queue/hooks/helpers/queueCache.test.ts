import { describe, expect, it } from 'vitest'

import { ItemStatus } from '@/shared/model/domain'
import type { QueueItem, QueuePage } from '@/shared/model/queue'

import { applyItemToCache, type QueueData } from './queueCache'

const item = (id: string, status: ItemStatus): QueueItem => ({
  id,
  title: `item ${id}`,
  status,
  claimedBy: status === ItemStatus.Claimed ? { id: 'u1', name: 'Anya' } : null,
  claimedAt: status === ItemStatus.Claimed ? '2026-08-01T00:00:00.000Z' : null,
  resolvedBy: null,
  resolvedAt: null,
  createdAt: '2026-08-01T00:00:00.000Z',
})

const data = (...pages: QueuePage[]): QueueData => ({
  pages,
  pageParams: pages.map(() => null),
})

const page = (items: QueueItem[], total: number): QueuePage => ({ items, nextCursor: null, total })

/**
 * This is where the interface would most easily start lying: a claimed item
 * left visible under the "Open" tab. The cases below are the ones that decide
 * whether it does.
 */
describe('applyItemToCache', () => {
  it('replaces the row in place when no filter is active', () => {
    const before = data(page([item('a', ItemStatus.Open), item('b', ItemStatus.Open)], 2))
    const after = applyItemToCache(before, item('a', ItemStatus.Claimed), null)

    expect(after?.pages[0].items.map((i) => i.id)).toEqual(['a', 'b'])
    expect(after?.pages[0].items[0].status).toBe(ItemStatus.Claimed)
    expect(after?.pages[0].total).toBe(2)
  })

  it('replaces the row when it still matches the active filter', () => {
    const before = data(page([item('a', ItemStatus.Claimed)], 1))
    const after = applyItemToCache(before, item('a', ItemStatus.Claimed), ItemStatus.Claimed)

    expect(after?.pages[0].items).toHaveLength(1)
    expect(after?.pages[0].total).toBe(1)
  })

  it('removes the row once it no longer matches the active filter', () => {
    const before = data(page([item('a', ItemStatus.Open), item('b', ItemStatus.Open)], 10))
    const after = applyItemToCache(before, item('a', ItemStatus.Claimed), ItemStatus.Open)

    expect(after?.pages[0].items.map((i) => i.id)).toEqual(['b'])
  })

  it('keeps the total honest when a row is removed', () => {
    const before = data(page([item('a', ItemStatus.Open)], 10))
    const after = applyItemToCache(before, item('a', ItemStatus.Claimed), ItemStatus.Open)

    expect(after?.pages[0].total).toBe(9)
  })

  it('finds the row on a later page', () => {
    const before = data(
      page([item('a', ItemStatus.Open)], 4),
      page([item('b', ItemStatus.Open), item('c', ItemStatus.Open)], 4),
    )
    const after = applyItemToCache(before, item('b', ItemStatus.Claimed), ItemStatus.Open)

    expect(after?.pages[1].items.map((i) => i.id)).toEqual(['c'])
    // The count lives on the first page, wherever the row was removed from.
    expect(after?.pages[0].total).toBe(3)
  })

  it('leaves the cache alone for a row it does not hold', () => {
    const before = data(page([item('a', ItemStatus.Open)], 1))
    const after = applyItemToCache(before, item('zzz', ItemStatus.Claimed), ItemStatus.Open)

    expect(after?.pages[0].items.map((i) => i.id)).toEqual(['a'])
    expect(after?.pages[0].total).toBe(1)
  })

  it('is a no-op before the first page has loaded', () => {
    expect(applyItemToCache(undefined, item('a', ItemStatus.Open), null)).toBeUndefined()
  })
})
