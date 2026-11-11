// src/components/Reports/tabs/PurchasesTab.test.jsx
// Pestaña Compras de Reportes con la API simulada (spec 16, T4 y T7).
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import api from '../../../services/api'
import { fmtRangeLabel, getPresetRange } from '../../../utils/dateRanges'
import PurchasesTab from './PurchasesTab'

let isCentralAdmin = false
let permissions = []

vi.mock('../../../services/api', () => ({ default: { get: vi.fn() } }))
vi.mock('../../../context/UserContext', () => ({
  useUser: () => ({
    isCentralAdmin,
    hasPermission: (module, action) => permissions.includes(`${module}.${action}`),
  }),
}))

const money = (n) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })

const PAGINATION = (total) => ({ page: 1, limit: 20, total, totalPages: 1 })

const PROVIDER_REPORT = {
  data: [
    { groupId: 4, name: 'Pepsi',   isActive: true,  count: 2, total: 540, share: 67.5, average: 270, lastPurchaseDate: '2026-10-10' },
    { groupId: 5, name: 'Bimbo',   isActive: true,  count: 1, total: 200, share: 25,   average: 200, lastPurchaseDate: '2026-10-05' },
    { groupId: 6, name: 'Antiguo', isActive: false, count: 1, total: 60,  share: 7.5,  average: 60,  lastPurchaseDate: '2026-10-08' },
  ],
  pagination: PAGINATION(3),
  summary: { total: 800, count: 4, average: 200, providers: 3 },
  firstPurchaseDate: '2026-01-05',
}

const PRODUCT_REPORT = {
  ...PROVIDER_REPORT,
  data: [
    { groupId: 10, name: 'Refresco 600 ml', sku: 'REF-600', uom: 'pza', isActive: true, quantity: 50, count: 2, total: 540, share: 67.5, averageCost: 10.8 },
    { groupId: 11, name: 'Azúcar a granel', sku: 'AZU', uom: 'kg', isActive: false, quantity: 1.5, count: 1, total: 60, share: 7.5, averageCost: 40 },
  ],
  pagination: PAGINATION(2),
}

const BRANCH_REPORT = {
  ...PROVIDER_REPORT,
  data: [
    { groupId: 1, name: 'Sucursal Central', count: 4, total: 800, share: 80, average: 200 },
    { groupId: 2, name: 'Sucursal Norte',   count: 1, total: 200, share: 20, average: 200 },
  ],
  pagination: PAGINATION(2),
}

const mockApi = (overrides = {}) => {
  api.get.mockImplementation((url) => {
    if (url.startsWith('branches')) {
      return Promise.resolve({ data: { data: [{ branch_id: 1, name: 'Sucursal Central' }, { branch_id: 2, name: 'Sucursal Norte' }] } })
    }
    const groupBy = new URLSearchParams(url.split('?')[1]).get('group_by')
    const report = { provider: PROVIDER_REPORT, product: PRODUCT_REPORT, branch: BRANCH_REPORT }[groupBy]
    return Promise.resolve({ data: { ...report, ...overrides } })
  })
}

const lastParams = () => {
  const url = api.get.mock.calls.map(([u]) => u).filter(u => u.startsWith('reports/purchases')).at(-1)
  return new URLSearchParams(url.split('?')[1])
}

const renderTab = async () => {
  render(<PurchasesTab />)
  return screen.findByRole('table')
}

const stat = (label) => screen.getByText(label, { selector: '.rpt-stat__label' }).closest('.rpt-stat')
const viewByGroup = () => screen.getByRole('group', { name: 'Ver por' })
const viewBy = () => within(viewByGroup()).getAllByRole('button').map(b => b.textContent)
const clickViewBy = (name) => fireEvent.click(within(viewByGroup()).getByRole('button', { name }))
const headers = () => screen.getAllByRole('columnheader').map(h => h.textContent)

describe('PurchasesTab', () => {
  beforeEach(() => {
    isCentralAdmin = false
    permissions = ['reports.purchases', 'reports.expenses']
    api.get.mockReset()
    mockApi()
  })

  it('starts on the current month, by provider, 20 per page', async () => {
    await renderTab()
    const { start, end } = getPresetRange('month', {})
    const params = lastParams()

    expect(screen.getByRole('tab', { name: 'Este mes' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText(fmtRangeLabel(start, end))).toBeInTheDocument()
    expect(params.get('start_date')).toBe(start)
    expect(params.get('end_date')).toBe(end)
    expect(params.get('group_by')).toBe('provider')
    expect(params.get('limit')).toBe('20')
    expect(params.has('include_expenses')).toBe(false)
    expect(params.has('branch_id')).toBe(false)
  })

  it('shows the total, the count, the average and the providers', async () => {
    await renderTab()

    expect(within(stat('Total comprado')).getByText(money(800))).toBeInTheDocument()
    expect(within(stat('Total comprado')).getByText('4 compras')).toBeInTheDocument()
    expect(within(stat('Compra promedio')).getByText(money(200))).toBeInTheDocument()
    expect(within(stat('Proveedores')).getByText('3')).toBeInTheDocument()
  })

  it('lists each provider with its purchases, total, share, average and last purchase, marking the inactive ones', async () => {
    const table = await renderTab()

    expect(headers()).toEqual(['Proveedor', 'Compras', 'Total', '% del total', 'Compra promedio', 'Última compra'])
    const pepsi = within(table).getByText('Pepsi').closest('tr')
    expect(within(pepsi).getByText('2')).toBeInTheDocument()
    expect(within(pepsi).getByText(money(540))).toBeInTheDocument()
    expect(within(pepsi).getByText('67.5%')).toBeInTheDocument()
    expect(within(pepsi).getByText(money(270))).toBeInTheDocument()
    expect(within(pepsi).getByText('10 oct 2026')).toBeInTheDocument()
    expect(within(pepsi).queryByText('Inactivo')).not.toBeInTheDocument()
    expect(within(within(table).getByText('Antiguo').closest('tr')).getByText('Inactivo')).toBeInTheDocument()
    expect(screen.getByText('3 proveedores con compras')).toBeInTheDocument()
  })

  it('lists each product with its SKU, quantity, purchases, total and average cost, marking the inactive ones', async () => {
    await renderTab()

    clickViewBy('Producto')

    await waitFor(() => expect(lastParams().get('group_by')).toBe('product'))
    const table = await screen.findByRole('table')
    const soda = (await within(table).findByText('Refresco 600 ml')).closest('tr')
    expect(headers()).toEqual(['Producto', 'Cantidad', 'Compras', 'Total', '% del total', 'Costo promedio'])
    expect(within(soda).getByText('REF-600')).toBeInTheDocument()
    expect(within(soda).getByText('50 pza')).toBeInTheDocument()
    expect(within(soda).getByText(money(10.8))).toBeInTheDocument()
    const sugar = within(table).getByText('Azúcar a granel').closest('tr')
    expect(within(sugar).getByText('1.5 kg')).toBeInTheDocument()
    expect(within(sugar).getByText('Inactivo')).toBeInTheDocument()
    expect(screen.getByText('2 productos con compras')).toBeInTheDocument()
  })

  it('offers the branch view and filter only to the central admin', async () => {
    await renderTab()

    expect(viewBy()).toEqual(['Proveedor', 'Producto'])
    expect(screen.queryByRole('combobox', { name: 'Sucursal' })).not.toBeInTheDocument()
  })

  it('lets the central admin see by branch, and filtering by a branch removes that view', async () => {
    isCentralAdmin = true
    await renderTab()
    expect(viewBy()).toEqual(['Proveedor', 'Producto', 'Sucursal'])

    clickViewBy('Sucursal')
    await waitFor(() => expect(lastParams().get('group_by')).toBe('branch'))
    expect(await screen.findByRole('columnheader', { name: 'Sucursal' })).toBeInTheDocument()
    expect(within(screen.getByRole('table')).getByText('Sucursal Norte')).toBeInTheDocument()

    await screen.findByRole('option', { name: 'Sucursal Norte' })
    fireEvent.change(screen.getByRole('combobox', { name: 'Sucursal' }), { target: { value: '2' } })

    await waitFor(() => expect(lastParams().get('branch_id')).toBe('2'))
    expect(lastParams().get('group_by')).toBe('provider')
    expect(viewBy()).toEqual(['Proveedor', 'Producto'])
  })

  it('shows only purchases: no "Sumar", even with reports.expenses (requisito 24)', async () => {
    await renderTab()

    expect(screen.queryByRole('group', { name: 'Sumar' })).not.toBeInTheDocument()
    expect(screen.queryByText('Compras y gastos')).not.toBeInTheDocument()
    expect(screen.queryByText('Gastos')).not.toBeInTheDocument()
    expect(lastParams().has('include_expenses')).toBe(false)
  })

  it('warns when the period starts before the first registered purchase', async () => {
    mockApi({ firstPurchaseDate: '2099-01-15' })
    await renderTab()

    expect(screen.getByText(
      'La primera compra registrada es del 15 ene 2099. Las entradas de mercancía anteriores no tienen costo ni proveedor, así que no están en este reporte.'
    )).toBeInTheDocument()
  })

  it('does not warn when the period starts after the first purchase', async () => {
    await renderTab()

    expect(screen.queryByText(/La primera compra registrada/)).not.toBeInTheDocument()
  })

  it('says so when there are no purchases in the period', async () => {
    mockApi({
      data: [], pagination: PAGINATION(0),
      summary: { total: 0, count: 0, average: null, providers: 0 }, firstPurchaseDate: null,
    })
    render(<PurchasesTab />)

    expect(await screen.findByText('No hay compras en este periodo')).toBeInTheDocument()
    expect(within(stat('Compra promedio')).getByText('—')).toBeInTheDocument()
  })

})

// Aviso que se cierra (spec 16, T6 y T7)
describe('PurchasesTab notices', () => {
  const FIRST = /La primera compra registrada/
  const close = (text) =>
    fireEvent.click(within(screen.getByText(text).closest('.rpt-note')).getByRole('button', { name: 'Cerrar aviso' }))

  beforeEach(() => {
    isCentralAdmin = false
    permissions = ['reports.purchases', 'reports.expenses']
    api.get.mockReset()
    // La primera compra queda después de cualquier periodo: el aviso sale siempre
    mockApi({ firstPurchaseDate: '2099-01-15' })
  })

  it('closes the notice of the first purchase', async () => {
    await renderTab()

    close(FIRST)

    expect(screen.queryByText(FIRST)).not.toBeInTheDocument()
  })

  it('shows a closed notice again when the period changes', async () => {
    await renderTab()
    close(FIRST)

    fireEvent.click(screen.getByRole('tab', { name: 'Esta semana' }))

    expect(await screen.findByText(FIRST)).toBeInTheDocument()
  })

  it('shows a closed notice again when the central admin changes the branch', async () => {
    isCentralAdmin = true
    await renderTab()
    await screen.findByRole('option', { name: 'Sucursal Norte' })
    close(FIRST)

    fireEvent.change(screen.getByRole('combobox', { name: 'Sucursal' }), { target: { value: '2' } })

    expect(await screen.findByText(FIRST)).toBeInTheDocument()
  })

  it('keeps the notice closed when only the breakdown or the page changes', async () => {
    mockApi({ firstPurchaseDate: '2099-01-15', pagination: { page: 1, limit: 20, total: 30, totalPages: 2 } })
    await renderTab()
    close(FIRST)

    clickViewBy('Producto')
    await waitFor(() => expect(lastParams().get('group_by')).toBe('product'))
    fireEvent.click(screen.getByRole('button', { name: 'Página siguiente' }))
    await waitFor(() => expect(lastParams().get('page')).toBe('2'))

    await screen.findByRole('table')
    expect(screen.queryByText(FIRST)).not.toBeInTheDocument()
  })

  it('shows the closed notice again when the tab opens again', async () => {
    const { unmount } = render(<PurchasesTab />)
    await screen.findByText(FIRST)
    close(FIRST)
    unmount()

    render(<PurchasesTab />)

    expect(await screen.findByText(FIRST)).toBeInTheDocument()
  })
})
