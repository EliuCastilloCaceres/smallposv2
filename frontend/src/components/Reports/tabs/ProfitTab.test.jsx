// src/components/Reports/tabs/ProfitTab.test.jsx
// Pestaña Ventas y utilidad con la API simulada (spec 04, T5; rediseño de la
// spec 08, T2).
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import api from '../../../services/api'
import { fmtRangeLabel, getPresetRange } from '../../../utils/dateRanges'
import ProfitTab from './ProfitTab'

let isCentralAdmin = false

vi.mock('../../../services/api', () => ({ default: { get: vi.fn() } }))
vi.mock('../../../context/UserContext', () => ({ useUser: () => ({ isCentralAdmin }) }))

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
