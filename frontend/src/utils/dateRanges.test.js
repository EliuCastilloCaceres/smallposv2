// src/utils/dateRanges.test.js
import { describe, expect, it } from 'vitest'
import {
  DATE_PRESETS, getPresetRange,
  TREND_PRESETS, getTrendPresetRange, todayInAppTimezone, rangeDays, autoGranularity, fitsGranularity,
  fmtRangeLabel,
} from './dateRanges'

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

// Instantes en UTC; las fechas esperadas son las de México
const at = (iso) => new Date(iso)

describe('trend presets', () => {
  const OCT_21 = at('2026-10-21T18:00:00Z')

  it('lists the five trend presets in order', () => {
    expect(TREND_PRESETS.map(p => p.label))
      .toEqual(['Este mes', 'Últimos 3 meses', 'Este año', 'Últimos 12 meses', 'Personalizado'])
  })

  it('aligns every preset to calendar months', () => {
    expect(getTrendPresetRange('month', {}, OCT_21)).toEqual({ start: '2026-10-01', end: '2026-10-31' })
    expect(getTrendPresetRange('last3months', {}, OCT_21)).toEqual({ start: '2026-08-01', end: '2026-10-31' })
    expect(getTrendPresetRange('year', {}, OCT_21)).toEqual({ start: '2026-01-01', end: '2026-12-31' })
    expect(getTrendPresetRange('last12months', {}, OCT_21)).toEqual({ start: '2025-11-01', end: '2026-10-31' })
  })

  it('crosses the year back for the last 3 and 12 months', () => {
    const jan15 = at('2026-01-15T18:00:00Z')

    expect(getTrendPresetRange('last3months', {}, jan15)).toEqual({ start: '2025-11-01', end: '2026-01-31' })
    expect(getTrendPresetRange('last12months', {}, jan15)).toEqual({ start: '2025-02-01', end: '2026-01-31' })
  })

  it('ends February on the 28th or on the 29th of a leap year', () => {
    expect(getTrendPresetRange('month', {}, at('2026-02-10T18:00:00Z'))).toEqual({ start: '2026-02-01', end: '2026-02-28' })
    expect(getTrendPresetRange('month', {}, at('2028-02-10T18:00:00Z'))).toEqual({ start: '2028-02-01', end: '2028-02-29' })
  })

  it('uses the Mexico date, not the UTC one', () => {
    // 1 nov 03:00 UTC son las 21:00 del 31 oct en México
    const halloweenNight = at('2026-11-01T03:00:00Z')

    expect(todayInAppTimezone(halloweenNight)).toBe('2026-10-31')
    expect(getTrendPresetRange('month', {}, halloweenNight)).toEqual({ start: '2026-10-01', end: '2026-10-31' })
  })

  it('returns the custom range, falling back to today', () => {
    expect(getTrendPresetRange('custom', { start: '2026-05-01', end: '2026-06-15' }, OCT_21))
      .toEqual({ start: '2026-05-01', end: '2026-06-15' })
    expect(getTrendPresetRange('custom', { start: '2026-05-01' }, OCT_21))
      .toEqual({ start: '2026-05-01', end: '2026-10-21' })
  })
})

describe('trend granularity', () => {
  it('counts both ends of the range', () => {
    expect(rangeDays('2026-03-01', '2026-03-31')).toBe(31)
    expect(rangeDays('2026-03-01', '2026-03-01')).toBe(1)
  })

  it('picks day up to 31 days, week up to 183 and month above', () => {
    expect([autoGranularity(31), autoGranularity(32)]).toEqual(['day', 'week'])
    expect([autoGranularity(183), autoGranularity(184)]).toEqual(['week', 'month'])
  })

  it('limits day to 92 days, week to 731 and month to 1827', () => {
    expect([fitsGranularity('day', 92), fitsGranularity('day', 93)]).toEqual([true, false])
    expect([fitsGranularity('week', 731), fitsGranularity('week', 732)]).toEqual([true, false])
    expect([fitsGranularity('month', 1827), fitsGranularity('month', 1828)]).toEqual([true, false])
  })
})

describe('fmtRangeLabel', () => {
  it('shows a single day', () => {
    expect(fmtRangeLabel('2026-10-26', '2026-10-26')).toBe('26 oct 2026')
  })

  it('shows the month and year once within the same month', () => {
    expect(fmtRangeLabel('2026-10-01', '2026-10-31')).toBe('1 – 31 oct 2026')
  })

  it('shows the year once within the same year', () => {
    expect(fmtRangeLabel('2026-08-01', '2026-10-31')).toBe('1 ago – 31 oct 2026')
  })

  it('shows both years across years', () => {
    expect(fmtRangeLabel('2025-11-01', '2026-10-31')).toBe('1 nov 2025 – 31 oct 2026')
  })
})
