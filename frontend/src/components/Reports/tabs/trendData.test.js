// src/components/Reports/tabs/trendData.test.js
// Funciones de la pestaña Tendencia de ventas (spec 05, T4).
import { describe, expect, it } from 'vitest'
import {
  axisLabel, longLabel, partialDays, buildChartData, pctChange, fmtPct, fmtMetric,
} from './trendData'

const period = (start, end, extra = {}) => ({
  start, end, from: start, to: end, partial: false, current: false, future: false, ...extra,
})

describe('period labels', () => {
  it('labels days, weeks and months in Spanish', () => {
    const day   = period('2026-10-15', '2026-10-15')
    const week  = period('2026-10-12', '2026-10-18')
    const month = period('2026-10-01', '2026-10-31')

    expect([axisLabel(day, 'day'), axisLabel(week, 'week'), axisLabel(month, 'month')])
      .toEqual(['15 oct', 'sem 12 oct', 'oct 2026'])
    expect([longLabel(day, 'day'), longLabel(week, 'week'), longLabel(month, 'month')])
      .toEqual(['jue 15 oct 2026', 'Semana del 12 al 18 oct 2026', 'octubre 2026'])
  })

  it('names both months of a week that crosses months, and the days of a partial period', () => {
    const week = period('2026-07-27', '2026-08-02', { from: '2026-08-01', partial: true })

    expect(longLabel(week, 'week')).toBe('Semana del 27 jul al 2 ago 2026')
    expect(partialDays(week)).toBe('1–2 ago')
    expect(partialDays({ from: '2026-07-30', to: '2026-08-02' })).toBe('30 jul – 2 ago')
  })
})

describe('buildChartData', () => {
  const data = {
    granularity: 'day',
    periods: [
      period('2026-03-11', '2026-03-11', { netSales: 0,   avgTicket: null }),
      period('2026-03-12', '2026-03-12', { netSales: 100, avgTicket: 100, current: true }),
      period('2026-03-13', '2026-03-13', { netSales: null, avgTicket: null, future: true }),
    ],
    previousYear: {
      periods: [
        period('2025-03-12', '2025-03-12', { netSales: 50,  avgTicket: 50 }),
        period('2025-03-13', '2025-03-13', { netSales: 0,   avgTicket: null }),
        period('2025-03-14', '2025-03-14', { netSales: 80,  avgTicket: 80 }),
      ],
    },
    branches: [
      { branchId: 1, name: 'Centro', periods: [{ netSales: 0 }, { netSales: 60 }, { netSales: null }] },
      { branchId: 2, name: 'Norte',  periods: [{ netSales: 0 }, { netSales: 40 }, { netSales: null }] },
    ],
  }

  it('keeps future periods and the ticket without sales empty', () => {
    const rows = buildChartData(data, 'avgTicket', 'none')

    expect(rows.map(r => r.current)).toEqual([null, 100, null])
    expect(rows.map(r => r.label)).toEqual(['11 mar', '12 mar', '13 mar'])
    expect(rows[0]).not.toHaveProperty('previous')
  })

  it('aligns the previous year series period by period, with its real dates', () => {
    const rows = buildChartData(data, 'netSales', 'previous_year')

    expect(rows.map(r => [r.current, r.previous])).toEqual([[0, 50], [100, 0], [null, 80]])
    expect(rows[2].previousPeriod.start).toBe('2025-03-14')
  })

  it('builds one series per branch', () => {
    const rows = buildChartData(data, 'netSales', 'branch')

    expect(rows.map(r => [r.branch_1, r.branch_2])).toEqual([[0, 0], [60, 40], [null, null]])
  })
})

describe('comparison and formats', () => {
  it('computes the change against the previous year, or nothing when it was 0', () => {
    expect(pctChange(112.4, 100)).toBeCloseTo(12.4)
    expect(pctChange(-50, -100)).toBeCloseTo(50)
    expect(pctChange(100, 0)).toBeNull()
    expect([fmtPct(12.44), fmtPct(-3.4), fmtPct(null)]).toEqual(['↑ 12.4%', '↓ 3.4%', '—'])
  })

  it('formats money, counts and missing values', () => {
    expect(fmtMetric('netSales', 1234.5)).toBe((1234.5).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' }))
    expect(fmtMetric('orders', 0.42)).toBe('0.42')
    expect(fmtMetric('avgTicket', null)).toBe('—')
  })
})
