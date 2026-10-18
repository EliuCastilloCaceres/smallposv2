// src/helpers/userAccess.test.js
import { describe, expect, it } from 'vitest'
import { hasUserPermission } from './userAccess'

describe('hasUserPermission', () => {
  const me = { permissions: ['users.read', 'users.update'] }

  it('returns true when the permission is in the list', () => {
    expect(hasUserPermission(me, 'users.read')).toBe(true)
  })

  it('returns false when the permission is not in the list', () => {
    expect(hasUserPermission(me, 'users.create')).toBe(false)
  })

  it.each([
    ['no user', undefined],
    ['no permissions', {}],
    ['permissions that are not an array', { permissions: 'users.read' }],
  ])('returns false with %s', (_, user) => {
    expect(hasUserPermission(user, 'users.read')).toBe(false)
  })
})
