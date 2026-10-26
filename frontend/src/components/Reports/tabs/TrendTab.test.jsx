// src/components/Reports/tabs/TrendTab.test.jsx
// Pestaña Tendencia de ventas con la API simulada (spec 05, T4; rediseño de la
// spec 08, T3).
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import api from '../../../services/api'
import { fmtRangeLabel, getTrendPresetRange } from '../../../utils/dateRanges'
import TrendTab, { TrendTooltip } from './TrendTab'
import { fmtMoney } from './trendData'

let isCentralAdmin = false

vi.mock('../../../services/api', () => ({ default: { get: vi.fn() } }))
vi.mock('../../../context/UserContext', () => ({ useUser: () => ({ isCentralAdmin }) }))

const period = (start, end, values = {}, flags = {}) => ({
  start, end, from: start, to: end, partial: false, current: false, future: false,
  netSales: 0, orders: 0, profit: 0, avgTicket: null, ...values, ...flags,
})

// Respuesta mensual de 3 periodos: ene (1,000 en 4 ventas), feb (0), mar en curso (500 en 2)
const trendResponse = ({ compare = 'none', noCostLines = 0 } = {}) => ({
  granularity: 'month',
  periods: [
    period('2026-01-01', '2026-01-31', { netSales: 1000, orders: 4, profit: 400, avgTicket: 250 }),
    period('2026-02-01', '2026-02-28'),
    period('2026-03-01', '2026-03-31', { netSales: 500, orders: 2, profit: 150, avgTicket: 250 }, { current: true }),
  ],
  previousYear: compare === 'previous_year' ? {
    periods: [
      period('2025-01-01', '2025-01-31', { netSales: 800, orders: 4, profit: 320, avgTicket: 200 }),
      period('2025-02-01', '2025-02-28', { netSales: 300, orders: 1, profit: 90, avgTicket: 300 }),
      period('2025-03-01', '2025-03-31', { netSales: 700, orders: 3, profit: 210, avgTicket: 233.33 }),
    ],
  } : null,
  branches: null,
  summary: {
    elapsedPeriods: 3,
    totals:   { netSales: 1500, orders: 6, profit: 550, avgTicket: 250 },
    averages: { netSales: 500, orders: 2, profit: 183.33 },
    best: {
      netSales:  { index: 0, start: '2026-01-01', value: 1000, ...(compare === 'previous_year' && { previousValue: 800 }) },
      orders:    { index: 0, start: '2026-01-01', value: 4, ...(compare === 'previous_year' && { previousValue: 4 }) },
      profit:    { index: 0, start: '2026-01-01', value: 400, ...(compare === 'previous_year' && { previousValue: 320 }) },
      avgTicket: { index: 0, start: '2026-01-01', value: 250, ...(compare === 'previous_year' && { previousValue: 200 }) },
    },
  },
  previousSummary: compare === 'previous_year' ? {
    from: '2025-01-01', to: '2025-03-12',
    totals:   { netSales: 1250, orders: 6, profit: 0, avgTicket: 208.33 },
    averages: { netSales: 416.67, orders: 2, profit: 0 },
  } : null,
  noCost: { lines: noCostLines, netSales: noCostLines ? 90 : 0 },
})

let options = {}

const mockApi = () => {
  api.get.mockImplementation((url) => {
    if (url.startsWith('branches')) {
      return Promise.resolve({ data: { data: [{ branch_id: 1, name: 'Sucursal Central' }, { branch_id: 2, name: 'Sucursal Norte' }] } })
    }
    const compare = new URLSearchParams(url.split('?')[1]).get('compare')
    return Promise.resolve({ data: { data: trendResponse({ ...options, compare }) } })
  })
}

// Parámetros de la última llamada a reports/trend
const lastTrendParams = () => {
  const url = api.get.mock.calls.map(([u]) => u).filter(u => u.startsWith('reports/trend')).at(-1)
  return new URLSearchParams(url.split('?')[1])
}

const kpiCard = (label) => screen.getByText(label, { selector: '.rpt-kpi__label' }).closest('.rpt-kpi')

const renderTab = async () => {
  render(<TrendTab />)
  await screen.findByText('Total', { selector: '.rpt-kpi__label' })
}

const buttonIn = (group) => (name) => within(screen.getByRole('group', { name: group })).getByRole('button', { name })
const granularityButton = buttonIn('Granularidad')
const metricButton      = buttonIn('Métrica')
const compareButton     = buttonIn('Comparación')
const compareOptions    = () => within(screen.getByRole('group', { name: 'Comparación' })).getAllByRole('button').map(b => b.textContent)

// Recharts mide el contenedor con ResizeObserver, que jsdom no trae
const OriginalResizeObserver = globalThis.ResizeObserver
beforeAll(() => {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
})
afterAll(() => { globalThis.ResizeObserver = OriginalResizeObserver })

describe('TrendTab', () => {
  beforeEach(() => {
    isCentralAdmin = false
    options = {}
    api.get.mockReset()
    mockApi()
  })

  it('starts on the last 12 months, by month and without comparison', async () => {
    await renderTab()
    const { start, end } = getTrendPresetRange('last12months')
    const params = lastTrendParams()

    expect(screen.getByRole('tab', { name: 'Últimos 12 meses' })).toHaveAttribute('aria-selected', 'true')
    expect([params.get('start_date'), params.get('end_date')]).toEqual([start, end])
    expect(params.get('granularity')).toBe('month')
    expect(params.get('compare')).toBe('none')
  })

  it('shows the dates of the period next to the presets, and a chart title with the metric, granularity and period', async () => {
    await renderTab()
    const { start, end } = getTrendPresetRange('last12months')
    const chart = within(screen.getByRole('region', { name: 'Gráfica de tendencia' }))

    expect(within(screen.getByRole('region', { name: 'Filtros' })).getByText(fmtRangeLabel(start, end))).toBeInTheDocument()
    expect(chart.getByRole('heading')).toHaveTextContent(`Monto vendido por mes · ${fmtRangeLabel(start, end)}`)

    fireEvent.click(metricButton('Número de ventas'))

    expect(chart.getByRole('heading')).toHaveTextContent('Número de ventas por mes')
    expect(metricButton('Número de ventas')).toHaveAttribute('aria-pressed', 'true')
  })

  it('puts the metric, granularity and comparison controls above the KPIs, inside the chart card', async () => {
    await renderTab()
    const card = screen.getByRole('region', { name: 'Gráfica de tendencia' })
    const metricGroup = within(card).getByRole('group', { name: 'Métrica' })
    const totalCard = kpiCard('Total')

    expect(card).toContainElement(totalCard)
    expect(metricGroup.compareDocumentPosition(totalCard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(card).getByRole('group', { name: 'Granularidad' })).toBeInTheDocument()
    expect(within(card).getByRole('group', { name: 'Comparación' })).toBeInTheDocument()
  })

  it('disables the granularities beyond their limit and goes back to the automatic one when the range changes', async () => {
    await renderTab()

    // 12 meses: por día no cabe (más de 92 días)
    expect(granularityButton('Día')).toBeDisabled()
    expect(granularityButton('Día')).toHaveAttribute('title', 'Por día: hasta 92 días')

    fireEvent.click(granularityButton('Semana'))
    await waitFor(() => expect(lastTrendParams().get('granularity')).toBe('week'))

    fireEvent.click(screen.getByRole('tab', { name: 'Este mes' }))
    await waitFor(() => expect(lastTrendParams().get('granularity')).toBe('day'))
    expect(granularityButton('Día')).toBeEnabled()

    fireEvent.click(screen.getByRole('tab', { name: 'Este año' }))
    await waitFor(() => expect(lastTrendParams().get('granularity')).toBe('month'))
  })

  it('sends the chosen comparison', async () => {
    await renderTab()

    fireEvent.click(compareButton('Año anterior'))

    await waitFor(() => expect(lastTrendParams().get('compare')).toBe('previous_year'))
    expect(compareButton('Año anterior')).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows total, average and best period, and only the range ticket and best period for the ticket', async () => {
    await renderTab()

    expect(kpiCard('Total')).toHaveTextContent(fmtMoney(1500))
    expect(kpiCard('Promedio por mes')).toHaveTextContent(fmtMoney(500))
    expect(kpiCard('Mejor mes')).toHaveTextContent(fmtMoney(1000))
    expect(kpiCard('Mejor mes')).toHaveTextContent('enero 2026')

    fireEvent.click(metricButton('Ticket promedio'))

    expect(kpiCard('Ticket del rango')).toHaveTextContent(fmtMoney(250))
    expect(screen.queryByText('Promedio por mes')).toBeNull()
    expect(screen.queryByText('Total', { selector: '.rpt-kpi__label' })).toBeNull()
  })

  it('shows the previous year value and change in each card, or "—" when it was 0', async () => {
    await renderTab()
    fireEvent.click(compareButton('Año anterior'))
    await screen.findByText(/vs .*1,250/)

    expect(kpiCard('Total')).toHaveTextContent('↑ 20%')
    expect(kpiCard('Mejor mes')).toHaveTextContent('enero 2025')
    expect(kpiCard('Mejor mes')).toHaveTextContent('↑ 25%')

    fireEvent.click(metricButton('Utilidad bruta'))
    expect(kpiCard('Total')).toHaveTextContent(`vs ${fmtMoney(0)} · —`)
  })

  it('warns about sales without cost only with the profit metric', async () => {
    options = { noCostLines: 1 }
    await renderTab()

    expect(screen.queryByRole('status')).toBeNull()

    fireEvent.click(metricButton('Utilidad bruta'))

    expect(screen.getByRole('status')).toHaveTextContent(`1 línea de venta sin costo suma ${fmtMoney(90)}`)
    expect(screen.getByRole('status')).toHaveTextContent('Ventas y utilidad')
  })

  it('offers the branch comparison only to the central admin in the consolidated view', async () => {
    await renderTab()
    expect(compareOptions()).toEqual(['Ninguna', 'Año anterior'])
  })

  it('removes the branch comparison when the central admin filters a branch', async () => {
    isCentralAdmin = true
    await renderTab()
    expect(compareOptions()).toEqual(['Ninguna', 'Año anterior', 'Por sucursal'])

    fireEvent.click(compareButton('Por sucursal'))
    await waitFor(() => expect(lastTrendParams().get('compare')).toBe('branch'))

    await screen.findByRole('option', { name: 'Sucursal Norte' })
    fireEvent.change(screen.getByRole('combobox', { name: 'Sucursal' }), { target: { value: '2' } })

    await waitFor(() => expect(lastTrendParams().get('branch_id')).toBe('2'))
    expect(lastTrendParams().get('compare')).toBe('none')
    expect(compareOptions()).toEqual(['Ninguna', 'Año anterior'])
  })
})

describe('TrendTooltip', () => {
  const row = (periodData, extra = {}) => [{ payload: { period: periodData, current: periodData.avgTicket, ...extra } }]

  it('marks the current period and a partial one with its days', () => {
    const week = period('2026-07-27', '2026-08-02', { avgTicket: 120 }, { from: '2026-08-01', partial: true, current: true })

    render(<TrendTooltip active payload={row(week)} metric="avgTicket" granularity="week" compare="none" />)

    expect(screen.getByText('Semana del 27 jul al 2 ago 2026')).toBeInTheDocument()
    expect(screen.getByText('en curso')).toBeInTheDocument()
    expect(screen.getByText('parcial: 1–2 ago')).toBeInTheDocument()
  })

  it('says "sin ventas" for the ticket of a past period without sales, and "—" for a future one', () => {
    const past   = period('2026-02-01', '2026-02-28')
    const future = period('2026-04-01', '2026-04-30', { avgTicket: null }, { future: true })

    const { unmount } = render(<TrendTooltip active payload={row(past)} metric="avgTicket" granularity="month" compare="none" />)
    expect(screen.getByText('sin ventas')).toBeInTheDocument()
    unmount()

    render(<TrendTooltip active payload={row(future)} metric="avgTicket" granularity="month" compare="none" />)
    expect(screen.queryByText('sin ventas')).toBeNull()
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('shows the real date of the previous year period', () => {
    const current  = period('2026-03-05', '2026-03-05', { netSales: 100 })
    const previous = period('2025-03-06', '2025-03-06', { netSales: 80 })

    render(
      <TrendTooltip
        active metric="netSales" granularity="day" compare="previous_year"
        payload={[{ payload: { period: current, current: 100, previousPeriod: previous, previous: 80 } }]}
      />
    )

    expect(screen.getByText('jue 5 mar 2026')).toBeInTheDocument()
    expect(screen.getByText('jue 6 mar 2025')).toBeInTheDocument()
    expect(screen.getByText(fmtMoney(80))).toBeInTheDocument()
  })
})
