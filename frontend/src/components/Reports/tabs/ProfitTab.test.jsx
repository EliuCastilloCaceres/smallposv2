// src/components/Reports/tabs/ProfitTab.test.jsx
// Pestaña Ventas y utilidad con la API simulada (spec 04, T5).
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import api from '../../../services/api'
import { getPresetRange } from '../../../utils/dateRanges'
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
  ],
  pagination: { page: 1, limit: 20, total: 3, totalPages: 1 },
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

  it('shows the KPIs and the rows of the API response', async () => {
    const table = await renderTab()

    expect(screen.getByText('Ventas netas').nextSibling).toHaveTextContent(money(290))
    expect(screen.getByText('Costo de lo vendido').nextSibling).toHaveTextContent(money(80))
    expect(screen.getByText('Utilidad bruta').nextSibling).toHaveTextContent(money(210))
    expect(screen.getByText('Margen', { selector: '.rpt-kpi__label' }).nextSibling).toHaveTextContent('72.4%')

    const playera = within(table).getByText('Playera').closest('tr')
    expect(playera).toHaveTextContent(money(200))
    expect(playera).toHaveTextContent(money(120))
    expect(playera).toHaveTextContent('60.0%')
  })

  it('shows "—" as the margin of a row with no net sales', async () => {
    const table = await renderTab()

    const cells = within(within(table).getByText('Devuelto').closest('tr')).getAllByRole('cell')
    expect(cells.at(-1)).toHaveTextContent('—')
  })

  it('warns about sales without cost and flags the rows that include them', async () => {
    const table = await renderTab()

    expect(screen.getByRole('status')).toHaveTextContent(`1 línea de venta sin costo suma ${money(90)}`)
    expect(within(within(table).getByText('Queso').closest('tr')).getByText('Sin costo')).toBeInTheDocument()
    expect(within(within(table).getByText('Playera').closest('tr')).queryByText('Sin costo')).toBeNull()
  })

  it('starts with "exclude sales without cost" off and sends it when turned on', async () => {
    await renderTab()
    const toggle = screen.getByRole('button', { name: /Excluir ventas sin costo/ })

    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(lastProfitParams().has('exclude_no_cost')).toBe(false)

    fireEvent.click(toggle)

    await waitFor(() => expect(lastProfitParams().get('exclude_no_cost')).toBe('true'))
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows units only when grouping by product, and the product count otherwise', async () => {
    const table = await renderTab()

    expect(within(table).getByRole('columnheader', { name: 'Unidades' })).toBeInTheDocument()
    expect(within(table).getByText('1.5 kg')).toBeInTheDocument()

    fireEvent.change(screen.getByRole('combobox', { name: 'Agrupar por' }), { target: { value: 'category' } })

    const byCategory = await screen.findByRole('columnheader', { name: 'Productos' })
    expect(byCategory).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Unidades' })).toBeNull()
    expect(lastProfitParams().get('group_by')).toBe('category')
  })

  it('hides the branch selector and the branch grouping from a branch user', async () => {
    await renderTab()
    const groupOptions = within(screen.getByRole('combobox', { name: 'Agrupar por' }))
      .getAllByRole('option').map(o => o.textContent)

    expect(screen.queryByRole('combobox', { name: 'Sucursal' })).toBeNull()
    expect(groupOptions).toEqual(['Por producto', 'Por categoría', 'Por proveedor'])
  })

  it('shows the central admin the branch selector and the branch grouping in the consolidated view', async () => {
    isCentralAdmin = true

    await renderTab()
    const groupBy = screen.getByRole('combobox', { name: 'Agrupar por' })

    expect(screen.getByRole('combobox', { name: 'Sucursal' })).toBeInTheDocument()
    expect(within(groupBy).getByRole('option', { name: 'Por sucursal' })).toBeInTheDocument()

    // Con una sucursal elegida ya no es consolidado: se quita la agrupación
    await screen.findByRole('option', { name: 'Sucursal Norte' })
    fireEvent.change(screen.getByRole('combobox', { name: 'Sucursal' }), { target: { value: '2' } })
    await waitFor(() => expect(lastProfitParams().get('branch_id')).toBe('2'))
    expect(within(groupBy).queryByRole('option', { name: 'Por sucursal' })).toBeNull()
  })
})
