// src/utils/dateFormatter.test.js
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fmtDate } from './dateFormatter'

describe('fmtDate', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each([null, undefined, ''])('returns the default fallback for %p', (value) => {
    expect(fmtDate(value)).toBe('—')
  })

  it('returns the given fallback for an invalid date', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect(fmtDate('not-a-date', 'n/a')).toBe('n/a')
    expect(warn).toHaveBeenCalledOnce()
  })

  it('formats in Mexico time, not UTC', () => {
    // 2026-03-15 03:30 UTC = 2026-03-14 21:30 en México.
    expect(fmtDate('2026-03-15T03:30:00Z')).toBe('14 mar 2026')
  })
})
