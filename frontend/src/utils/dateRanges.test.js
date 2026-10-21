// src/utils/dateRanges.test.js
import { describe, expect, it } from 'vitest'
import { DATE_PRESETS, getPresetRange } from './dateRanges'

// Miércoles 15 de octubre de 2026, a media tarde
const NOW = new Date(2026, 9, 15, 16, 30)

describe('getPresetRange', () => {
  it('returns the current day for today', () => {
    expect(getPresetRange('today', {}, NOW)).toEqual({ start: '2026-10-15', end: '2026-10-15' })
  })

  it('returns a week that starts on Monday and ends on Sunday', () => {
    expect(getPresetRange('week', {}, NOW)).toEqual({ start: '2026-10-12', end: '2026-10-18' })
  })

  it('keeps a Sunday in the week that started the Monday before', () => {
    const sunday = new Date(2026, 9, 18, 22, 0)

    expect(getPresetRange('week', {}, sunday)).toEqual({ start: '2026-10-12', end: '2026-10-18' })
  })

  it('returns the whole calendar month for month', () => {
    expect(getPresetRange('month', {}, NOW)).toEqual({ start: '2026-10-01', end: '2026-10-31' })
  })

  it('returns the custom range, falling back to today for a missing end', () => {
    expect(getPresetRange('custom', { start: '2026-09-01', end: '2026-09-20' }, NOW))
      .toEqual({ start: '2026-09-01', end: '2026-09-20' })
    expect(getPresetRange('custom', { start: '2026-09-01', end: '' }, NOW))
      .toEqual({ start: '2026-09-01', end: '2026-10-15' })
  })

  it('lists the four presets in order', () => {
    expect(DATE_PRESETS.map(p => p.label)).toEqual(['Hoy', 'Esta semana', 'Este mes', 'Personalizado'])
  })
})
