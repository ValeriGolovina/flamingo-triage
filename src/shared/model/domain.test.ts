import { describe, expect, it } from 'vitest'

import { Role, roleAtLeast } from './domain'

/**
 * Role comparison decides who may claim, resolve and release. It is three lines
 * of code and the only thing standing between a viewer and a write, so it is
 * worth pinning the boundary rather than the happy path.
 */
describe('roleAtLeast', () => {
  it('lets a role satisfy itself', () => {
    for (const role of [Role.Viewer, Role.Member, Role.Owner]) {
      expect(roleAtLeast(role, role)).toBe(true)
    }
  })

  it('lets a higher role satisfy a lower requirement', () => {
    expect(roleAtLeast(Role.Owner, Role.Member)).toBe(true)
    expect(roleAtLeast(Role.Member, Role.Viewer)).toBe(true)
    expect(roleAtLeast(Role.Owner, Role.Viewer)).toBe(true)
  })

  it('refuses a viewer everything a member may do', () => {
    expect(roleAtLeast(Role.Viewer, Role.Member)).toBe(false)
    expect(roleAtLeast(Role.Viewer, Role.Owner)).toBe(false)
    expect(roleAtLeast(Role.Member, Role.Owner)).toBe(false)
  })
})
