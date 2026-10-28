// src/components/Reports/tabs/ExpensesTab.test.jsx
// Pestaña Gastos de Reportes con la API simulada (spec 13, T3).
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import api from '../../../services/api'
import { fmtRangeLabel, getPresetRange } from '../../../utils/dateRanges'
import ExpensesTab from './ExpensesTab'

let isCentralAdmin = false

vi.mock('../../../services/api', () => ({ default: { get: vi.fn() } }))
vi.mock('../../../context/UserContext', () => ({ useUser: () => ({ isCentralAdmin }) }))

const money = (n) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })

const SUMMARY = { total: 9000, count: 4, average: 2250, inNetProfit: 7800, outOfNetProfit: 1200 }

const CATEGORY_REPORT = {
  data: [
    { groupId: 1, name: 'Renta', count: 2, total: 7000, share: 77.78, countsInNetProfit: true },
    { groupId: 7, name: 'Pago a proveedor (mercancía)', count: 1, total: 1200, share: 13.33, countsInNetProfit: false },
    { groupId: 2, name: 'Servicios', count: 1, total: 800, share: 8.89, countsInNetProfit: true },
  ],
  pagination: { page: 1, limit: 20, total: 3, totalPages: 1 },
  summary: SUMMARY,
  firstExpenseDate: '2026-01-05',
}

const PROVIDER_REPORT = {
  data: [
    { groupId: null, name: 'Sin proveedor', count: 2, total: 7000, share: 77.78 },
    { groupId: 4, name: 'Pepsi', count: 2, total: 2000, share: 22.22 },
  ],
  pagination: { page: 1, limit: 20, total: 2, totalPages: 1 },
  summary: SUMMARY,
  firstExpenseDate: '2026-01-05',
}

const mockApi = (overrides = {}) => {
  api.get.mockImplementation((url) => {
    if (url.startsWith('branches')) {
      return Promise.resolve({ data: { data: [{ branch_id: 1, name: 'Sucursal Central' }, { branch_id: 2, name: 'Sucursal Norte' }] } })
    }
    const params = new URLSearchParams(url.split('?')[1])
    const report = params.get('group_by') === 'provider' ? PROVIDER_REPORT : CATEGORY_REPORT
    return Promise.resolve({ data: { ...report, ...overrides } })
  })
}

const lastParams = () => {
  const url = api.get.mock.calls.map(([u]) => u).filter(u => u.startsWith('reports/expenses')).at(-1)
  return new URLSearchParams(url.split('?')[1])
}

const renderTab = async () => {
  render(<ExpensesTab />)
  return screen.findByRole('table')
}

const stat = (label) => screen.getByText(label, { selector: '.rpt-stat__label' }).closest('.rpt-stat')
const viewBy = () => within(screen.getByRole('group', { name: 'Ver por' })).getAllByRole('button').map(b => b.textContent)

describe('ExpensesTab', () => {
  beforeEach(() => {
    isCentralAdmin = false
    api.get.mockReset()
    mockApi()
  })

  it('starts on the current month, by category, 20 per page', async () => {
    await renderTab()
    const { start, end } = getPresetRange('month', {})
    const params = lastParams()

    expect(screen.getByRole('tab', { name: 'Este mes' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText(fmtRangeLabel(start, end))).toBeInTheDocument()
    expect(params.get('start_date')).toBe(start)
    expect(params.get('end_date')).toBe(end)
    expect(params.get('group_by')).toBe('category')
    expect(params.get('limit')).toBe('20')
    expect(params.has('branch_id')).toBe(false)
  })

  it('shows the total, the count, the average and what counts in the net profit', async () => {
    await renderTab()

    expect(within(stat('Total gastado')).getByText(money(9000))).toBeInTheDocument()
    expect(within(stat('Total gastado')).getByText('4 gastos')).toBeInTheDocument()
    expect(within(stat('Gasto promedio')).getByText(money(2250))).toBeInTheDocument()
    expect(within(stat('Cuenta en la utilidad neta')).getByText(money(7800))).toBeInTheDocument()
    expect(within(stat('Cuenta en la utilidad neta')).getByText(`No cuenta: ${money(1200)}`)).toBeInTheDocument()
  })

  it('lists each category with its count, total and share, marking the ones that do not count', async () => {
    await renderTab()
    const table = screen.getByRole('table')

    const supplier = within(table).getByText('Pago a proveedor (mercancía)').closest('tr')
    expect(within(supplier).getByText('No cuenta en la utilidad neta')).toBeInTheDocument()
    expect(within(supplier).getByText(money(1200))).toBeInTheDocument()
    expect(within(supplier).getByText('13.3%')).toBeInTheDocument()

    const rent = within(table).getByText('Renta').closest('tr')
    expect(within(rent).queryByText('No cuenta en la utilidad neta')).not.toBeInTheDocument()
    expect(within(rent).getByText('2')).toBeInTheDocument()
    expect(screen.getByText('3 categorías con gastos')).toBeInTheDocument()
  })

  it('changes the grouping, with "Sin proveedor" by provider', async () => {
    await renderTab()

    fireEvent.click(within(screen.getByRole('group', { name: 'Ver por' })).getByRole('button', { name: 'Proveedor' }))

    await waitFor(() => expect(lastParams().get('group_by')).toBe('provider'))
    expect(await within(screen.getByRole('table')).findByText('Sin proveedor')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Proveedor' })).toBeInTheDocument()
  })

  it('offers the branch view and filter only to the central admin', async () => {
    await renderTab()

    expect(viewBy()).toEqual(['Categoría', 'Proveedor', 'Método de pago'])
    expect(screen.queryByRole('combobox', { name: 'Sucursal' })).not.toBeInTheDocument()
  })

  it('lets the central admin filter by branch, which removes the branch view', async () => {
    isCentralAdmin = true
    await renderTab()
    expect(viewBy()).toEqual(['Categoría', 'Sucursal', 'Proveedor', 'Método de pago'])

    await screen.findByRole('option', { name: 'Sucursal Norte' })
    fireEvent.change(screen.getByRole('combobox', { name: 'Sucursal' }), { target: { value: '2' } })

    await waitFor(() => expect(lastParams().get('branch_id')).toBe('2'))
    expect(viewBy()).toEqual(['Categoría', 'Proveedor', 'Método de pago'])
  })

  it('warns when the period starts before the first registered expense', async () => {
    mockApi({ firstExpenseDate: '2099-01-15' })
    await renderTab()

    expect(screen.getByText(/El primer gasto registrado es del 15 ene 2099/)).toBeInTheDocument()
  })

  it('does not warn when the period starts after the first expense', async () => {
    await renderTab()

    expect(screen.queryByText(/El primer gasto registrado/)).not.toBeInTheDocument()
  })

  it('says so when there are no expenses in the period', async () => {
    mockApi({
      data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
      summary: { total: 0, count: 0, average: null, inNetProfit: 0, outOfNetProfit: 0 }, firstExpenseDate: null,
    })
    render(<ExpensesTab />)

    expect(await screen.findByText('No hay gastos en este periodo')).toBeInTheDocument()
    expect(within(stat('Gasto promedio')).getByText('—')).toBeInTheDocument()
  })
})
