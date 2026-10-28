// src/components/Reports/tabs/ProfitTab.test.jsx
// Pestaña Ventas y utilidad con la API simulada (spec 04, T5; rediseño de la
// spec 08, T2).
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import api from '../../../services/api'
import { fmtRangeLabel, getPresetRange } from '../../../utils/dateRanges'
import ProfitTab from './ProfitTab'

let isCentralAdmin = false
let permissions = []

vi.mock('../../../services/api', () => ({ default: { get: vi.fn() } }))
vi.mock('../../../context/UserContext', () => ({
  useUser: () => ({ isCentralAdmin, hasPermission: (module, action) => permissions.includes(`${module}.${action}`) }),
}))

const money = (n) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })

const PRODUCT_REPORT = {
  data: [
    { groupId: 1, name: 'Playera', sku: 'PL-1', units: 2, uom: 'pza', netSales: 200, cost: 80, profit: 120, margin: 60, noCost: { lines: 0, netSales: 0 } },
    { groupId: 2, name: 'Queso', sku: 'QS-1', units: 1.5, uom: 'kg', netSales: 90, cost: 0, profit: 90, margin: 100, noCost: { lines: 1, netSales: 90 } },
    { groupId: 3, name: 'Devuelto', sku: 'DV-1', units: 0, uom: 'pza', netSales: 0, cost: 0, profit: 0, margin: null, noCost: { lines: 0, netSales: 0 } },
    { groupId: 4, name: 'Hielo', sku: 'hielo', units: 3, uom: 'pza', netSales: 0, cost: 0, profit: 0, margin: null, noCost: { lines: 0, netSales: 0 } },
  ],
  pagination: { page: 1, limit: 20, total: 690, totalPages: 35 },
  summary: { netSales: 290, cost: 80, profit: 210, margin: 72.41, noCost: { lines: 1, netSales: 90 } },
}

const CATEGORY_REPORT = {
  data: [
    { groupId: 2, name: 'Abarrotes', productCount: 2, netSales: 290, cost: 80, profit: 210, margin: 72.41, noCost: { lines: 1, netSales: 90 } },
  ],
  pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
  summary: PRODUCT_REPORT.summary,
}

// Responde según la ruta; reports/profit según la agrupación pedida
const mockApi = () => {
  api.get.mockImplementation((url) => {
    if (url.startsWith('branches')) {
      return Promise.resolve({ data: { data: [{ branch_id: 1, name: 'Sucursal Central' }, { branch_id: 2, name: 'Sucursal Norte' }] } })
    }
    if (url.startsWith('categories')) {
      return Promise.resolve({ data: { data: [{ category_id: 2, name: 'Abarrotes' }] } })
    }
    const params = new URLSearchParams(url.split('?')[1])
    return Promise.resolve({ data: params.get('group_by') === 'category' ? CATEGORY_REPORT : PRODUCT_REPORT })
  })
}

// Parámetros de la última llamada a reports/profit
const lastProfitParams = () => {
  const url = api.get.mock.calls.map(([u]) => u).filter(u => u.startsWith('reports/profit')).at(-1)
  return new URLSearchParams(url.split('?')[1])
}

const renderTab = async () => {
  render(<ProfitTab />)
  return screen.findByRole('table')
}

describe('ProfitTab', () => {
  beforeEach(() => {
    isCentralAdmin = false
    permissions = ['reports.profit']
    api.get.mockReset()
    mockApi()
  })

  it('starts on the current month, grouped by product and sorted by profit descending', async () => {
    await renderTab()
    const { start, end } = getPresetRange('month', {})
    const params = lastProfitParams()

    expect(screen.getByRole('tab', { name: 'Este mes' })).toHaveAttribute('aria-selected', 'true')
    expect(params.get('start_date')).toBe(start)
    expect(params.get('end_date')).toBe(end)
    expect(params.get('group_by')).toBe('product')
    expect(params.get('sort_by')).toBe('profit')
    expect(params.get('sort_dir')).toBe('desc')
  })

  it('shows the dates of the chosen period next to the presets', async () => {
    await renderTab()
    const { start, end } = getPresetRange('month', {})

    expect(within(screen.getByRole('region', { name: 'Filtros' })).getByText(fmtRangeLabel(start, end))).toBeInTheDocument()
  })

  it('shows the summary as sales − cost = profit, and the rows of the API response', async () => {
    const table = await renderTab()
    const summary = within(screen.getByRole('region', { name: 'Resumen de ventas y utilidad' }))

    expect(summary.getByText('Ventas netas').nextSibling).toHaveTextContent(money(290))
    expect(summary.getByText('Costo de lo vendido').nextSibling).toHaveTextContent(money(80))
    expect(summary.getByText('Utilidad bruta').nextSibling).toHaveTextContent(money(210))
    expect(summary.getByText('Margen 72.4%')).toBeInTheDocument()

    const playera = within(table).getByText('Playera').closest('tr')
    expect(playera).toHaveTextContent(money(200))
    expect(playera).toHaveTextContent(money(120))
    expect(playera).toHaveTextContent('60.0%')
    expect(screen.getByText('690 productos con ventas')).toBeInTheDocument()
  })

  it('shows "—" as the margin of a row with no net sales', async () => {
    const table = await renderTab()

    const cells = within(within(table).getByText('Devuelto').closest('tr')).getAllByRole('cell')
    expect(cells.at(-1)).toHaveTextContent('—')
  })

  it('does not repeat a SKU equal to the name', async () => {
    const table = await renderTab()

    expect(within(table).getByText('Playera').closest('tr')).toHaveTextContent('PL-1')
    expect(within(table).getByText('Hielo').closest('tr')).not.toHaveTextContent('hielo')
  })

  describe('sales without cost', () => {
    it('warns about them in the summary and excludes them from there', async () => {
      await renderTab()
      const notice = screen.getByRole('status')
      expect(notice).toHaveTextContent(`1 línea de venta sin costo suma ${money(90)} de venta neta`)

      fireEvent.click(within(notice).getByRole('button', { name: 'Excluirlas' }))

      await waitFor(() => expect(lastProfitParams().get('exclude_no_cost')).toBe('true'))
      expect(screen.getByRole('button', { name: 'Ventas sin costo' })).toHaveAttribute('aria-pressed', 'true')
    })

    it('starts with the filter off, and once on the summary offers to include them again', async () => {
      await renderTab()
      const toggle = screen.getByRole('button', { name: 'Ventas sin costo' })
      expect(toggle).toHaveAttribute('aria-pressed', 'false')
      expect(lastProfitParams().has('exclude_no_cost')).toBe(false)

      fireEvent.click(toggle)
      await waitFor(() => expect(lastProfitParams().get('exclude_no_cost')).toBe('true'))
      const notice = screen.getByRole('status')
      expect(notice).toHaveTextContent('No se están contando las ventas sin costo.')

      fireEvent.click(within(notice).getByRole('button', { name: 'Incluirlas' }))
      await waitFor(() => expect(lastProfitParams().has('exclude_no_cost')).toBe(false))
    })

    it('shows the cost of a row that includes them in orange, without a pill', async () => {
      const table = await renderTab()
      const queso = within(table).getByText('Queso').closest('tr')
      const cost = within(queso).getByText(money(0))

      expect(cost).toHaveClass('rpt-no-cost')
      expect(cost).toHaveAttribute('title', `Incluye 1 línea sin costo (${money(90)} de venta neta)`)
      expect(within(table).queryByText('Sin costo')).toBeNull()
      expect(within(within(table).getByText('Playera').closest('tr')).getByText(money(80))).not.toHaveClass('rpt-no-cost')
    })
  })

  describe('breakdown', () => {
    const viewBy = (name) => within(screen.getByRole('group', { name: 'Ver por' })).queryByRole('button', { name })
    const header = (name) => screen.getByRole('columnheader', { name: new RegExp(name) })

    it('shows units only when viewing by product, and the product count otherwise', async () => {
      const table = await renderTab()

      expect(within(table).getByRole('columnheader', { name: 'Unidades' })).toBeInTheDocument()
      expect(within(table).getByText('1.5 kg')).toBeInTheDocument()

      fireEvent.click(viewBy('Categoría'))

      const byCategory = await screen.findByRole('columnheader', { name: 'Productos' })
      expect(byCategory).toBeInTheDocument()
      expect(screen.queryByRole('columnheader', { name: 'Unidades' })).toBeNull()
      expect(lastProfitParams().get('group_by')).toBe('category')
      expect(viewBy('Categoría')).toHaveAttribute('aria-pressed', 'true')
    })

    it('sorts by a column header, from highest to lowest first, and inverts it on a second click', async () => {
      await renderTab()
      expect(header('Utilidad')).toHaveAttribute('aria-sort', 'descending')

      fireEvent.click(within(header('Venta neta')).getByRole('button'))
      await waitFor(() => expect(lastProfitParams().get('sort_by')).toBe('net_sales'))
      expect(lastProfitParams().get('sort_dir')).toBe('desc')

      fireEvent.click(within(header('Venta neta')).getByRole('button'))
      await waitFor(() => expect(lastProfitParams().get('sort_dir')).toBe('asc'))
      expect(header('Venta neta')).toHaveAttribute('aria-sort', 'ascending')
    })

    it('does not sort by cost', async () => {
      await renderTab()

      expect(within(header('Costo')).queryByRole('button')).toBeNull()
    })

    it('sorts with the mobile selector, which sends the column and the direction', async () => {
      await renderTab()

      fireEvent.change(screen.getByRole('combobox', { name: 'Ordenar' }), { target: { value: 'margin:asc' } })

      await waitFor(() => expect(lastProfitParams().get('sort_by')).toBe('margin'))
      expect(lastProfitParams().get('sort_dir')).toBe('asc')
    })

    it('goes back to page 1 when a filter changes', async () => {
      await renderTab()

      fireEvent.click(screen.getByRole('button', { name: 'Página siguiente' }))
      await waitFor(() => expect(lastProfitParams().get('page')).toBe('2'))
      fireEvent.change(screen.getByRole('combobox', { name: 'Categoría' }), { target: { value: '2' } })

      await waitFor(() => expect(lastProfitParams().get('category_id')).toBe('2'))
      expect(lastProfitParams().get('page')).toBe('1')
    })

    it('hides the branch selector and the branch view from a branch user', async () => {
      await renderTab()

      expect(screen.queryByRole('combobox', { name: 'Sucursal' })).toBeNull()
      expect(within(screen.getByRole('group', { name: 'Ver por' })).getAllByRole('button').map(b => b.textContent))
        .toEqual(['Producto', 'Categoría', 'Proveedor'])
    })

    it('shows the central admin the branch selector and the branch view in the consolidated view', async () => {
      isCentralAdmin = true

      await renderTab()

      expect(screen.getByRole('combobox', { name: 'Sucursal' })).toBeInTheDocument()
      expect(viewBy('Sucursal')).toBeInTheDocument()

      // Con una sucursal elegida ya no es consolidado: se quita la agrupación
      await screen.findByRole('option', { name: 'Sucursal Norte' })
      fireEvent.change(screen.getByRole('combobox', { name: 'Sucursal' }), { target: { value: '2' } })
      await waitFor(() => expect(lastProfitParams().get('branch_id')).toBe('2'))
      expect(viewBy('Sucursal')).toBeNull()
    })
  })
})

// Utilidad neta (spec 13, T5)
describe('ProfitTab net profit', () => {
  const NET = { expenses: 150, netProfit: 60, netMargin: 20.69, firstExpenseDate: '2026-01-05' }
  const BRANCH_REPORT = {
    data: [
      { groupId: 1, name: 'Sucursal Central', productCount: 2, netSales: 290, cost: 80, profit: 210, margin: 72.41,
        noCost: { lines: 0, netSales: 0 }, net: { expenses: 100, netProfit: 110 } },
      { groupId: 3, name: 'Sucursal Sur', productCount: 0, netSales: 0, cost: 0, profit: 0, margin: null,
        noCost: { lines: 0, netSales: 0 }, net: { expenses: 50, netProfit: -50 } },
    ],
    pagination: { page: 1, limit: 20, total: 2, totalPages: 1 },
    summary: { ...PRODUCT_REPORT.summary, net: NET },
  }

  // Igual que mockApi, pero reports/profit trae la utilidad neta
  const mockNetApi = (net = NET) => {
    api.get.mockImplementation((url) => {
      if (url.startsWith('branches')) {
        return Promise.resolve({ data: { data: [{ branch_id: 1, name: 'Sucursal Central' }, { branch_id: 2, name: 'Sucursal Norte' }] } })
      }
      if (url.startsWith('categories')) {
        return Promise.resolve({ data: { data: [{ category_id: 2, name: 'Abarrotes' }] } })
      }
      const params = new URLSearchParams(url.split('?')[1])
      if (params.get('category_id')) return Promise.resolve({ data: CATEGORY_REPORT })
      if (params.get('group_by') === 'branch') return Promise.resolve({ data: BRANCH_REPORT })
      return Promise.resolve({ data: { ...PRODUCT_REPORT, summary: { ...PRODUCT_REPORT.summary, net } } })
    })
  }

  const stat = (label) => screen.getByText(label, { selector: '.rpt-stat__label' }).closest('.rpt-stat')

  beforeEach(() => {
    isCentralAdmin = false
    permissions = ['reports.profit', 'reports.expenses']
    api.get.mockReset()
  })

  it('continues the summary as gross profit − expenses = net profit, with the net margin as the main figure', async () => {
    mockNetApi()
    await renderTab()

    expect(within(stat('Gastos')).getByText(money(150))).toBeInTheDocument()
    expect(within(stat('Utilidad neta')).getByText(money(60))).toBeInTheDocument()
    expect(within(stat('Utilidad neta')).getByText('Margen neto 20.7%')).toBeInTheDocument()
    expect(stat('Utilidad neta')).toHaveClass('rpt-stat--hero')
    expect(stat('Utilidad bruta')).not.toHaveClass('rpt-stat--hero')
  })

  it('keeps the summary as today when the API sends no net profit', async () => {
    mockApi()
    await renderTab()

    expect(screen.queryByText('Utilidad neta')).not.toBeInTheDocument()
    expect(stat('Utilidad bruta')).toHaveClass('rpt-stat--hero')
  })

  it('shows the expenses and the net profit of each branch', async () => {
    isCentralAdmin = true
    mockNetApi()
    await renderTab()

    fireEvent.click(within(screen.getByRole('group', { name: 'Ver por' })).getByRole('button', { name: 'Sucursal' }))

    const south = (await screen.findByText('Sucursal Sur', { selector: 'td span' })).closest('tr')
    expect(screen.getByRole('columnheader', { name: 'Gastos' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Utilidad neta' })).toBeInTheDocument()
    expect(within(south).getByText(money(50))).toBeInTheDocument()
    expect(within(south).getByText(money(-50))).toHaveClass('rpt-diff--neg')
    expect(screen.getByText('2 sucursales con ventas o gastos')).toBeInTheDocument()
  })

  it('explains why there is no net profit with a category filter, and removes the filter', async () => {
    mockNetApi()
    await renderTab()

    await screen.findByRole('option', { name: 'Abarrotes' })
    fireEvent.change(screen.getByRole('combobox', { name: 'Categoría' }), { target: { value: '2' } })

    expect(await screen.findByText(/La utilidad neta se calcula con todas las categorías/)).toBeInTheDocument()
    expect(screen.queryByText('Utilidad neta', { selector: '.rpt-stat__label' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Quitar el filtro' }))
    await waitFor(() => expect(lastProfitParams().has('category_id')).toBe(false))
  })

  it('does not explain the category filter to a user without reports.expenses', async () => {
    permissions = ['reports.profit']
    mockApi()
    await renderTab()

    await screen.findByRole('option', { name: 'Abarrotes' })
    fireEvent.change(screen.getByRole('combobox', { name: 'Categoría' }), { target: { value: '2' } })

    await waitFor(() => expect(lastProfitParams().get('category_id')).toBe('2'))
    expect(screen.queryByText(/La utilidad neta se calcula/)).not.toBeInTheDocument()
  })

  it('warns when the period starts before the first registered expense', async () => {
    mockNetApi({ ...NET, firstExpenseDate: '2099-01-15' })
    await renderTab()

    expect(await screen.findByText(/El primer gasto registrado es del 15 ene 2099/)).toBeInTheDocument()
  })

  it('warns when there are no expenses yet', async () => {
    mockNetApi({ expenses: 0, netProfit: 210, netMargin: 72.41, firstExpenseDate: null })
    await renderTab()

    expect(await screen.findByText(/Todavía no hay gastos registrados/)).toBeInTheDocument()
  })

  it('does not warn when the period starts after the first expense', async () => {
    mockNetApi()
    await renderTab()

    expect(screen.queryByText(/El primer gasto registrado/)).not.toBeInTheDocument()
  })
})
