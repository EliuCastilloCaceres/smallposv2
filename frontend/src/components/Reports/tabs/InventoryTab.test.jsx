// src/components/Reports/tabs/InventoryTab.test.jsx
// Pestaña Valuación de inventario con la API simulada (spec 07, T3).
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import api from '../../../services/api'
import InventoryTab from './InventoryTab'

let isCentralAdmin = false

vi.mock('../../../services/api', () => ({ default: { get: vi.fn() } }))
vi.mock('../../../context/UserContext', () => ({ useUser: () => ({ isCentralAdmin }) }))

const totals = (items, units, costValue, saleValue, margin) => ({
  items, units, costValue, saleValue, profit: saleValue - costValue, margin,
})

const NO_RESERVED = totals(0, [], 0, 0, null)

const SUMMARY = {
  available: totals(2177, [{ uom: 'pza', quantity: 17989 }, { uom: 'par', quantity: 600 }], 347926.59, 633796.46, 45.1),
  reserved:  totals(3, [{ uom: 'pza', quantity: 3 }], 340, 660, 48.48),
  total:     totals(2178, [{ uom: 'pza', quantity: 17992 }, { uom: 'par', quantity: 600 }], 348266.59, 634456.46, 45.11),
  noCost:    { items: 940, saleValue: 254570 },
  alerts: {
    noCost:    totals(940, [{ uom: 'pza', quantity: 7551 }], 0, 254570, 100),
    belowCost: totals(8, [{ uom: 'pza', quantity: 664 }], 38000, 1500, -2433.33),
    inactive:  totals(0, [], 0, 0, null),
  },
}

const PRODUCT_REPORT = {
  data: [
    { groupId: 1, name: 'Recarga500', sku: 'recarga500', units: 105, uom: 'pza', costValue: 49875, saleValue: 52710, profit: 2835, margin: 5.38, noCostItems: 0 },
    { groupId: 2, name: 'Bolsa de regalo', sku: 'BOL-1', units: 288, uom: 'pza', costValue: 21888, saleValue: 576, profit: -21312, margin: -3700, noCostItems: 0 },
    { groupId: 3, name: 'Queso', sku: 'QUE-1', units: 2.5, uom: 'kg', costValue: 0, saleValue: 250, profit: 250, margin: 100, noCostItems: 1 },
    { groupId: 4, name: 'Muestra', sku: null, units: 3, uom: null, costValue: 0, saleValue: 0, profit: 0, margin: null, noCostItems: 1 },
  ],
  pagination: { page: 1, limit: 20, total: 1967, totalPages: 99 },
  summary: SUMMARY,
}

const CATEGORY_REPORT = {
  data: [
    { groupId: 13, name: 'Recargas', items: 14, costValue: 189425.25, saleValue: 203515, profit: 14089.75, margin: 6.92, noCostItems: 0 },
    { groupId: null, name: 'Sin categoría', items: 3, costValue: 0, saleValue: 250, profit: 250, margin: 100, noCostItems: 2 },
  ],
  pagination: { page: 1, limit: 20, total: 2, totalPages: 1 },
  summary: SUMMARY,
}

const mockApi = (summary = SUMMARY) => {
  api.get.mockImplementation((url) => {
    if (url.startsWith('branches')) {
      return Promise.resolve({ data: { data: [{ branch_id: 1, name: 'Sucursal Central' }, { branch_id: 2, name: 'Sucursal Norte' }] } })
    }
    if (url.startsWith('categories')) {
      return Promise.resolve({ data: { data: [{ category_id: 2, name: 'Abarrotes' }, { category_id: 13, name: 'Recargas' }] } })
    }
    if (url.startsWith('providers')) {
      return Promise.resolve({ data: { data: [{ provider_id: 1, name: 'Proveedor generico' }, { provider_id: 7, name: 'Distribuidora Sur' }] } })
    }
    const params = new URLSearchParams(url.split('?')[1])
    const report = params.get('group_by') === 'category' ? CATEGORY_REPORT : PRODUCT_REPORT
    return Promise.resolve({ data: { ...report, summary } })
  })
}

// Parámetros de la última llamada a reports/inventory
const lastParams = () => {
  const url = api.get.mock.calls.map(([u]) => u).filter(u => u.startsWith('reports/inventory')).at(-1)
  return new URLSearchParams(url.split('?')[1])
}

const renderTab = async () => {
  const view = render(<InventoryTab />)
  await screen.findByRole('table', { name: 'Valuación por grupo' })
  return view
}

const tableRow = (name) =>
  within(screen.getByRole('table', { name: 'Valuación por grupo' })).getByText(name).closest('tr')

const summaryCard = () => within(screen.getByRole('region', { name: 'Resumen del inventario' }))
const stat = (label) => summaryCard().getByText(label).closest('.rpt-inv-stat')
const alertButton = (label) => within(screen.getByRole('region', { name: 'Revisar captura' })).getByText(label).closest('button')
const viewBy = (label) => within(screen.getByRole('group', { name: 'Ver por' })).getByRole('button', { name: label })
const noCostToggle = () => screen.getByRole('button', { name: 'Productos sin costo' })

describe('InventoryTab', () => {
  beforeEach(() => {
    isCentralAdmin = false
    api.get.mockReset()
    mockApi()
  })

  it('starts grouped by product, sorted by cost value descending and without filters', async () => {
    await renderTab()
    const params = lastParams()

    expect(params.get('group_by')).toBe('product')
    expect(params.get('sort_by')).toBe('cost_value')
    expect(params.get('sort_dir')).toBe('desc')
    for (const name of ['exclude_no_cost', 'alert', 'category_id', 'exclude_category_ids', 'provider_id', 'search', 'branch_id']) {
      expect(params.has(name)).toBe(false)
    }
    expect(viewBy('Producto')).toHaveAttribute('aria-pressed', 'true')
    expect(summaryCard().getByText(/^Existencias y precios al /)).not.toHaveTextContent('…')
  })

  describe('summary', () => {
    it('shows the cost value as the main figure, with items, units, sale value and profit', async () => {
      await renderTab()

      expect(stat('Valor del inventario al costo')).toHaveTextContent('$347,926.59')
      expect(stat('Valor del inventario al costo')).toHaveTextContent('2,177 artículos · 17,989 pza · 600 par')
      expect(stat('A precio de venta')).toHaveTextContent('$633,796.46')
      expect(stat('Utilidad estimada')).toHaveTextContent('$285,869.87Margen 45.1%')
    })

    it('shows the available values only once', async () => {
      await renderTab()

      expect(screen.getAllByText('$347,926.59')).toHaveLength(1)
    })

    it('shows "—" as the margin when the sale value is 0', async () => {
      mockApi({ ...SUMMARY, available: totals(0, [], 0, 0, null) })
      await renderTab()

      expect(stat('Utilidad estimada')).toHaveTextContent('Margen —')
    })

    it('shows the reserved stock and the total in store', async () => {
      await renderTab()

      expect(summaryCard().getByText('Apartado').parentElement).toHaveTextContent('3 artículos · 3 pza · $340.00 al costo · $660.00 a venta')
      expect(summaryCard().getByText('Total en tienda').parentElement).toHaveTextContent('2,178 artículos · 17,992 pza · 600 par · $348,266.59 al costo · $634,456.46 a venta')
    })

    it('says there are no active layaways and leaves out the total in store', async () => {
      mockApi({ ...SUMMARY, reserved: NO_RESERVED, total: SUMMARY.available })
      await renderTab()

      expect(summaryCard().getByText('Sin apartados activos')).toBeInTheDocument()
      expect(summaryCard().queryByText('Total en tienda')).toBeNull()
    })
  })

  describe('items without cost', () => {
    it('warns about them next to the profit and excludes them from there', async () => {
      await renderTab()
      const notice = summaryCard().getByRole('status')
      expect(notice).toHaveTextContent('La utilidad incluye 940 artículos sin costo, que valen $254,570.00 a precio de venta')

      fireEvent.click(within(notice).getByRole('button', { name: 'Excluirlos' }))

      await waitFor(() => expect(lastParams().get('exclude_no_cost')).toBe('true'))
      expect(noCostToggle()).toHaveAttribute('aria-pressed', 'true')
    })

    it('starts with the filter off, and once on the summary offers to include them again', async () => {
      await renderTab()
      expect(noCostToggle()).toHaveAttribute('aria-pressed', 'false')

      fireEvent.click(noCostToggle())
      await waitFor(() => expect(lastParams().get('exclude_no_cost')).toBe('true'))
      const notice = summaryCard().getByRole('status')
      expect(notice).toHaveTextContent('No se están contando 940 artículos sin costo.')

      fireEvent.click(within(notice).getByRole('button', { name: 'Incluirlos' }))
      await waitFor(() => expect(lastParams().has('exclude_no_cost')).toBe(false))
    })

    it('shows the cost of a product without cost as $0.00 in orange', async () => {
      await renderTab()
      const cost = within(tableRow('Queso')).getByText('$0.00')

      expect(cost).toHaveClass('rpt-no-cost')
      expect(cost).toHaveAttribute('title', 'Sin costo')
      expect(within(tableRow('Recarga500')).getByText('$49,875.00')).not.toHaveClass('rpt-no-cost')
    })
  })

  describe('breakdown table', () => {
    it('shows units with their unit of measure only when viewed by product', async () => {
      await renderTab()
      const headers = () => within(screen.getByRole('table', { name: 'Valuación por grupo' }))
        .getAllByRole('columnheader').map(th => th.textContent)

      expect(headers()).toEqual(['Producto', 'Unidades', 'Valor al costo', 'Valor a venta', 'Utilidad', 'Margen'])
      expect(tableRow('Queso')).toHaveTextContent('2.5 kg')
      expect(tableRow('Muestra')).toHaveTextContent('3 sin unidad')
      expect(screen.getByText('1,967 productos')).toBeInTheDocument()

      fireEvent.click(viewBy('Categoría'))
      await screen.findByText('Recargas', { selector: '.rpt-table .rpt-folio' })

      expect(headers()).toEqual(['Categoría', 'Artículos', 'Valor al costo', 'Valor a venta', 'Utilidad', 'Margen'])
      expect(tableRow('Sin categoría')).toHaveTextContent('2 sin costo')
      expect(screen.getByText('2 categorías')).toBeInTheDocument()
    })

    it('does not repeat a SKU equal to the name', async () => {
      await renderTab()

      expect(tableRow('Recarga500')).not.toHaveTextContent('recarga500')
      expect(tableRow('Bolsa de regalo')).toHaveTextContent('BOL-1')
    })

    it('shows a negative margin in red', async () => {
      await renderTab()

      expect(within(tableRow('Bolsa de regalo')).getByText('-3,700.0%')).toHaveClass('rpt-margin--neg')
      expect(within(tableRow('Recarga500')).getByText('5.4%')).not.toHaveClass('rpt-margin--neg')
    })

    it('sorts by a column header, descending first, and inverts it on a second click', async () => {
      await renderTab()
      const header = (name) => screen.getByRole('columnheader', { name: new RegExp(name) })
      expect(header('Valor al costo')).toHaveAttribute('aria-sort', 'descending')

      fireEvent.click(within(header('Margen')).getByRole('button'))
      await waitFor(() => expect(lastParams().get('sort_by')).toBe('margin'))
      expect(lastParams().get('sort_dir')).toBe('desc')
      expect(header('Margen')).toHaveAttribute('aria-sort', 'descending')
      expect(header('Valor al costo')).toHaveAttribute('aria-sort', 'none')

      fireEvent.click(within(header('Margen')).getByRole('button'))
      await waitFor(() => expect(lastParams().get('sort_dir')).toBe('asc'))
      expect(header('Margen')).toHaveAttribute('aria-sort', 'ascending')
    })

    it('sorts with the mobile selector, which sends the column and the direction', async () => {
      await renderTab()

      fireEvent.change(screen.getByLabelText('Ordenar'), { target: { value: 'profit:asc' } })

      await waitFor(() => expect(lastParams().get('sort_by')).toBe('profit'))
      expect(lastParams().get('sort_dir')).toBe('asc')
    })

    it('hides the branch selector and the branch view from a branch user', async () => {
      await renderTab()

      expect(screen.queryByLabelText('Sucursal')).toBeNull()
      expect(within(screen.getByRole('group', { name: 'Ver por' })).queryByRole('button', { name: 'Sucursal' })).toBeNull()
    })

    it('shows the branch selector and the branch view to the central admin', async () => {
      isCentralAdmin = true
      await renderTab()

      expect(await screen.findByRole('option', { name: 'Sucursal Norte' })).toBeInTheDocument()
      expect(viewBy('Sucursal')).toBeInTheDocument()
    })
  })

  describe('filters', () => {
    it('sends each filter and goes back to page 1', async () => {
      await renderTab()

      fireEvent.click(screen.getByRole('button', { name: 'Página siguiente' }))
      await waitFor(() => expect(lastParams().get('page')).toBe('2'))
      fireEvent.change(screen.getByLabelText('Proveedor'), { target: { value: '7' } })
      await waitFor(() => expect(lastParams().get('provider_id')).toBe('7'))
      expect(lastParams().get('page')).toBe('1')

      fireEvent.click(screen.getByRole('button', { name: 'Página siguiente' }))
      await waitFor(() => expect(lastParams().get('page')).toBe('2'))
      fireEvent.change(screen.getByLabelText('Buscar'), { target: { value: ' TEN-27 ' } })
      await waitFor(() => expect(lastParams().get('search')).toBe('TEN-27'))
      expect(lastParams().get('page')).toBe('1')

      fireEvent.click(screen.getByRole('button', { name: 'Página siguiente' }))
      await waitFor(() => expect(lastParams().get('page')).toBe('2'))
      fireEvent.change(screen.getByLabelText('Categoría'), { target: { value: '2' } })
      await waitFor(() => expect(lastParams().get('category_id')).toBe('2'))
      expect(lastParams().get('page')).toBe('1')
    })

    it('excludes categories, goes back to page 1 and lets the exclusion be removed', async () => {
      await renderTab()

      fireEvent.click(screen.getByRole('button', { name: 'Página siguiente' }))
      await waitFor(() => expect(lastParams().get('page')).toBe('2'))
      fireEvent.change(screen.getByLabelText('Excluir categoría'), { target: { value: '13' } })
      await waitFor(() => expect(lastParams().get('exclude_category_ids')).toBe('13'))
      expect(lastParams().get('page')).toBe('1')

      fireEvent.change(screen.getByLabelText('Excluir categoría'), { target: { value: '2' } })
      await waitFor(() => expect(lastParams().get('exclude_category_ids')).toBe('13,2'))

      fireEvent.click(screen.getByRole('button', { name: 'Quitar exclusión de Recargas' }))
      await waitFor(() => expect(lastParams().get('exclude_category_ids')).toBe('2'))
    })

    it('clears the excluded categories and disables them when a category is chosen', async () => {
      await renderTab()
      fireEvent.change(screen.getByLabelText('Excluir categoría'), { target: { value: '13' } })
      await waitFor(() => expect(lastParams().get('exclude_category_ids')).toBe('13'))

      fireEvent.change(screen.getByLabelText('Categoría'), { target: { value: '2' } })

      await waitFor(() => expect(lastParams().get('category_id')).toBe('2'))
      expect(lastParams().has('exclude_category_ids')).toBe(false)
      expect(screen.getByLabelText('Excluir categoría')).toBeDisabled()
      expect(screen.queryByRole('button', { name: /Quitar exclusión/ })).toBeNull()
    })

    it('shows on the "Filtros" button how many filters are active', async () => {
      await renderTab()
      const button = screen.getByRole('button', { name: /^Filtros/ })
      expect(button).toHaveAttribute('aria-expanded', 'false')
      expect(within(button).queryByText(/\d/)).toBeNull()

      fireEvent.click(button)
      fireEvent.change(screen.getByLabelText('Proveedor'), { target: { value: '7' } })
      fireEvent.click(noCostToggle())

      expect(button).toHaveAttribute('aria-expanded', 'true')
      expect(within(button).getByText('2')).toBeInTheDocument()
    })
  })

  describe('review section', () => {
    it('views by product and sends the alert when an access is clicked, and "Ver todos" removes it', async () => {
      await renderTab()
      fireEvent.click(viewBy('Categoría'))
      await waitFor(() => expect(lastParams().get('group_by')).toBe('category'))

      fireEvent.click(alertButton('Precio menor al costo'))

      await waitFor(() => expect(lastParams().get('alert')).toBe('below_cost'))
      expect(lastParams().get('group_by')).toBe('product')
      expect(alertButton('Precio menor al costo')).toHaveAttribute('aria-pressed', 'true')
      const banner = within(screen.getByRole('region', { name: 'Desglose' })).getByRole('status')
      expect(banner).toHaveTextContent('Mostrando solo: Precio menor al costo. El resumen de arriba no cambia.')

      fireEvent.click(within(banner).getByRole('button', { name: 'Ver todos' }))
      await waitFor(() => expect(lastParams().has('alert')).toBe(false))
    })

    it('shows each access with its count and disables one at 0', async () => {
      await renderTab()

      expect(alertButton('Sin costo')).toHaveTextContent('940 artículos$254,570.00 a precio de venta')
      expect(alertButton('Precio menor al costo')).toHaveTextContent('8 artículos$38,000.00 al costo')
      expect(alertButton('Inactivos con stock')).toBeDisabled()
    })

    it('includes the items without cost again when "Sin costo" is clicked while they are excluded', async () => {
      await renderTab()
      fireEvent.click(noCostToggle())
      await waitFor(() => expect(lastParams().get('exclude_no_cost')).toBe('true'))

      fireEvent.click(alertButton('Sin costo'))

      await waitFor(() => expect(lastParams().get('alert')).toBe('no_cost'))
      expect(lastParams().has('exclude_no_cost')).toBe(false)
      expect(noCostToggle()).toHaveAttribute('aria-pressed', 'false')
    })

    it('drops the alert when viewing by something other than product', async () => {
      await renderTab()
      fireEvent.click(alertButton('Sin costo'))
      await waitFor(() => expect(lastParams().get('alert')).toBe('no_cost'))

      fireEvent.click(viewBy('Categoría'))

      await waitFor(() => expect(lastParams().get('group_by')).toBe('category'))
      expect(lastParams().has('alert')).toBe(false)
    })
  })
})
