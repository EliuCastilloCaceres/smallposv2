// src/components/Reports/tabs/RotationTab.test.jsx
// Pestaña Rotación de inventario con la API simulada (spec 10, T3 y T4).
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import api from '../../../services/api'
import RotationTab from './RotationTab'

let isCentralAdmin = false
let permissions = []

vi.mock('../../../services/api', () => ({ default: { get: vi.fn() } }))
vi.mock('../../../context/UserContext', () => ({
  useUser: () => ({ isCentralAdmin, hasPermission: (module, action) => permissions.includes(`${module}.${action}`) }),
}))
// El formulario de producto se prueba en Products; aquí solo importa qué
// producto recibe y qué pasa al guardar
vi.mock('../../Products/modals/ProductModal', () => ({
  default: ({ product, onSaved, onClose }) => (
    <div role="dialog" aria-label="Formulario de producto">
      <span>Editando {product.name}</span>
      <button onClick={() => onSaved(product)}>Guardar</button>
      <button onClick={onClose}>Cancelar</button>
    </div>
  ),
}))

const SUMMARY = {
  days: 30,
  today: '2026-10-27',
  products: 1293,
  neverSold: 301,
  units: [{ uom: 'pza', quantity: 7062 }, { uom: 'par', quantity: 535 }],
  costValue: 87388.36,
  saleValue: 299675.46,
  availableCostValue: 148615.02,
  share: 58.8,
  noCost: { products: 610, saleValue: 201487.5 },
}

const noSuggestions = (reason) => ({ transfer: null, discount: { reason }, promotion: [] })

const ROWS = [
  {
    branchId: 1, branchName: 'Sucursal Central', productId: 10, name: 'Arroz', sku: 'ARR-1', uom: 'pza',
    units: 10, costPrice: 20, salePrice: 30, costValue: 200, saleValue: 300,
    lastSale: '2026-09-26', neverSold: false, days: 31,
    suggestions: {
      transfer:  { branchId: 2, name: 'Sucursal Norte', sales: 2 },
      discount:  { reason: null, percent: 10, price: 30, suggestedPrice: 27, cappedByCost: false },
      promotion: [{ productId: 21, name: 'Azúcar' }, { productId: 22, name: 'Harina de trigo integral' }, { productId: 23, name: 'Sal' }],
    },
  },
  {
    branchId: 1, branchName: 'Sucursal Central', productId: 11, name: 'Lenteja', sku: 'Lenteja', uom: 'pza',
    units: 2, costPrice: 25, salePrice: 30, costValue: 50, saleValue: 60,
    lastSale: '2026-07-29', neverSold: false, days: 90,
    suggestions: {
      transfer:  null,
      discount:  { reason: null, percent: 16.67, price: 30, suggestedPrice: 25, cappedByCost: true },
      promotion: [{ productId: 21, name: 'Azúcar' }],
    },
  },
  {
    branchId: 1, branchName: 'Sucursal Central', productId: 12, name: 'Queso', sku: 'QUE-1', uom: 'kg',
    units: 2.5, costPrice: 0, salePrice: 100, costValue: 0, saleValue: 250,
    lastSale: null, neverSold: true, days: 46,
    suggestions: noSuggestions('no_cost'),
  },
  {
    branchId: 2, branchName: 'Sucursal Norte', productId: 13, name: 'Jabón', sku: 'JAB-1', uom: 'pza',
    units: 5, costPrice: 12, salePrice: 10, costValue: 60, saleValue: 50,
    lastSale: '2026-03-01', neverSold: false, days: 240,
    suggestions: noSuggestions('price_not_above_cost'),
  },
]

const REPORT = { data: ROWS, pagination: { page: 1, limit: 20, total: 1293, totalPages: 65 } }

const mockApi = ({ summary = SUMMARY, rows = ROWS } = {}) => {
  api.get.mockImplementation((url) => {
    if (url.startsWith('branches')) {
      return Promise.resolve({ data: { data: [{ branch_id: 1, name: 'Sucursal Central' }, { branch_id: 2, name: 'Sucursal Norte' }] } })
    }
    if (url.startsWith('categories')) {
      return Promise.resolve({ data: { data: [{ category_id: 2, name: 'Abarrotes' }, { category_id: 10, name: 'Recargas' }] } })
    }
    if (url.startsWith('providers')) {
      return Promise.resolve({ data: { data: [{ provider_id: 1, name: 'Proveedor generico' }, { provider_id: 7, name: 'Distribuidora Sur' }] } })
    }
    if (url.startsWith('products/')) {
      return Promise.resolve({ data: { data: { product_id: Number(url.split('/')[1]), name: 'Lenteja (detalle)', purchase_price: 25, sale_price: 30 } } })
    }
    return Promise.resolve({ data: { ...REPORT, data: rows, summary } })
  })
}

const rotationCalls = () => api.get.mock.calls.map(([u]) => u).filter(u => u.startsWith('reports/rotation'))

// Parámetros de la última llamada a reports/rotation
const lastParams = () => new URLSearchParams(rotationCalls().at(-1).split('?')[1])

const TABLE = 'Productos sin movimiento'

const renderTab = async () => {
  const view = render(<RotationTab />)
  await screen.findByRole('table', { name: TABLE })
  return view
}

const tableRow = (name) => within(screen.getByRole('table', { name: TABLE })).getByText(name).closest('tr')
const suggestionsOf = (name) => within(tableRow(name)).getByRole('list', { name: `Sugerencias para ${name}` })
const summaryCard = () => within(screen.getByRole('region', { name: 'Resumen de la rotación' }))
const stat = (label) => summaryCard().getByText(label).closest('.rpt-stat')
const daysButton = (label) => within(screen.getByRole('group', { name: 'Días sin venta' })).getByRole('button', { name: label })
const noCostToggle = () => screen.getByRole('button', { name: 'Productos sin costo' })
const headers = () => within(screen.getByRole('table', { name: TABLE })).getAllByRole('columnheader').map(th => th.textContent)

describe('RotationTab', () => {
  beforeEach(() => {
    isCentralAdmin = false
    permissions = ['reports.rotation', 'products.update']
    api.get.mockReset()
    mockApi()
  })

  it('starts with 30 days, sorted by cost value descending and without filters', async () => {
    await renderTab()
    const params = lastParams()

    expect(params.get('days')).toBe('30')
    expect(params.get('sort_by')).toBe('cost_value')
    expect(params.get('sort_dir')).toBe('desc')
    for (const name of ['exclude_no_cost', 'category_id', 'exclude_category_ids', 'provider_id', 'search', 'branch_id']) {
      expect(params.has(name)).toBe(false)
    }
    expect(daysButton('30 días')).toHaveAttribute('aria-pressed', 'true')
    expect(summaryCard().getByText(/^Existencias y precios al /)).not.toHaveTextContent('…')
  })

  describe('summary', () => {
    it('shows the stuck cost value as the main figure, with products, never sold, units, sale value and share', async () => {
      await renderTab()

      expect(stat('Valor detenido al costo')).toHaveTextContent('$87,388.36')
      expect(stat('Valor detenido al costo')).toHaveTextContent('1,293 productos sin venta en 30 días o más · 301 nunca vendidos')
      expect(stat('Valor detenido al costo')).toHaveTextContent('7,062 pza · 535 par')
      expect(stat('A precio de venta')).toHaveTextContent('$299,675.46')
      expect(stat('Parte del inventario')).toHaveTextContent('58.8%')
      expect(stat('Parte del inventario')).toHaveTextContent('del inventario al costo ($148,615.02)')
    })

    it('shows "—" as the share when the available inventory is worth 0', async () => {
      mockApi({ summary: { ...SUMMARY, availableCostValue: 0, share: null } })
      await renderTab()

      expect(stat('Parte del inventario')).toHaveTextContent('—')
    })
  })

  describe('products without cost', () => {
    it('counts them by default and offers to exclude them', async () => {
      await renderTab()

      expect(noCostToggle()).toHaveAttribute('aria-pressed', 'false')
      const note = summaryCard().getByText(/sin costo cuentan \$0/).closest('.rpt-note')
      expect(note).toHaveTextContent('610 productos sin costo cuentan $0 en el valor detenido; valen $201,487.50 a precio de venta y no tienen rebaja sugerida.')

      fireEvent.click(within(note).getByRole('button', { name: 'Excluirlos' }))

      await waitFor(() => expect(lastParams().get('exclude_no_cost')).toBe('true'))
      expect(noCostToggle()).toHaveAttribute('aria-pressed', 'true')
    })

    it('offers to include them again when excluded', async () => {
      await renderTab()
      fireEvent.click(noCostToggle())
      await waitFor(() => expect(lastParams().get('exclude_no_cost')).toBe('true'))

      const note = summaryCard().getByText(/No se están contando/).closest('.rpt-note')
      expect(note).toHaveTextContent('No se están contando 610 productos sin costo.')
      fireEvent.click(within(note).getByRole('button', { name: 'Incluirlos' }))

      await waitFor(() => expect(lastParams().has('exclude_no_cost')).toBe(false))
    })

    it('shows the cost value of a product without cost as $0.00 in orange', async () => {
      await renderTab()

      expect(within(tableRow('Queso')).getByTitle('Sin costo')).toHaveTextContent('$0.00')
    })
  })

  describe('list', () => {
    it('shows the general notice with the days of the period', async () => {
      await renderTab()

      expect(screen.getByRole('note')).toHaveTextContent(
        'Estos productos llevan 30 días o más sin venderse: ubícalos en un lugar más visible o promociónalos.'
      )
    })

    it('shows the last sale, "Nunca vendido", the days, the stock and the SKU only when it differs from the name', async () => {
      await renderTab()

      expect(tableRow('Arroz')).toHaveTextContent('26 sep 2026')
      expect(tableRow('Arroz')).toHaveTextContent('ARR-1')
      expect(tableRow('Lenteja').textContent.match(/Lenteja/g)).toHaveLength(1)
      expect(tableRow('Queso')).toHaveTextContent('Nunca vendido')
      expect(tableRow('Queso')).toHaveTextContent('2.5 kg')
      expect(within(tableRow('Jabón')).getAllByRole('cell')[2]).toHaveTextContent('240')
    })

    it('hides the branch column and selector from a branch user', async () => {
      await renderTab()

      expect(headers()).not.toContain('Sucursal')
      expect(screen.queryByRole('combobox', { name: 'Sucursal' })).toBeNull()
    })

    it('shows the branch column to the central admin until a branch is chosen', async () => {
      isCentralAdmin = true
      await renderTab()

      expect(headers()).toContain('Sucursal')
      expect(tableRow('Jabón')).toHaveTextContent('Sucursal Norte')

      await screen.findByRole('option', { name: 'Sucursal Norte' })
      fireEvent.change(screen.getByRole('combobox', { name: 'Sucursal' }), { target: { value: '2' } })

      await waitFor(() => expect(lastParams().get('branch_id')).toBe('2'))
      expect(headers()).not.toContain('Sucursal')
    })

    it('shows an empty state with the days when no product is stuck', async () => {
      mockApi({ rows: [], summary: { ...SUMMARY, days: 90, products: 0 } })
      render(<RotationTab />)

      expect(await screen.findByText('No hay productos sin venta en 90 días o más con estos filtros')).toBeInTheDocument()
    })
  })

  describe('suggestions', () => {
    it('shows the transfer, the discount and the promotion, in that order', async () => {
      await renderTab()
      const items = within(suggestionsOf('Arroz')).getAllByRole('listitem').map(li => li.textContent)

      expect(items).toEqual([
        'Traspasar a Sucursal Norte: 2 ventas en 30 días',
        'Rebajar de $30.00 a $27.00 (−10%)',
        'Promoción con: Azúcar, Harina de trigo integral y Sal',
      ])
    })

    it('shows the full name of a promoted product on hover', async () => {
      await renderTab()

      expect(within(suggestionsOf('Arroz')).getByTitle('Harina de trigo integral')).toBeInTheDocument()
    })

    it('says when the discount stops at the cost', async () => {
      await renderTab()

      expect(suggestionsOf('Lenteja')).toHaveTextContent('Rebajar de $30.00 a $25.00 (−16.7%), hasta el costo, sin utilidad')
    })

    it('explains why there is no discount and shows the location notice when nothing applies', async () => {
      await renderTab()

      expect(within(suggestionsOf('Queso')).getAllByRole('listitem').map(li => li.textContent)).toEqual([
        'Captura el costo para calcular la rebaja',
        'Ubícalo en un lugar más visible o promociónalo',
      ])
      expect(within(suggestionsOf('Jabón')).getAllByRole('listitem').map(li => li.textContent)).toEqual([
        'Sin rebaja: el precio no supera el costo',
        'Ubícalo en un lugar más visible o promociónalo',
      ])
    })

    it('has no buttons or links in the suggestions', async () => {
      await renderTab()

      for (const name of ['Arroz', 'Lenteja', 'Queso', 'Jabón']) {
        expect(within(suggestionsOf(name)).queryAllByRole('button')).toEqual([])
        expect(within(suggestionsOf(name)).queryAllByRole('link')).toEqual([])
      }
    })
  })

  describe('sorting', () => {
    it('sorts by a column from most to least and inverts on a second click', async () => {
      await renderTab()
      const daysHeader = () => within(screen.getByRole('table', { name: TABLE })).getByRole('button', { name: /Días sin venta/ })

      fireEvent.click(daysHeader())
      await waitFor(() => expect(lastParams().get('sort_by')).toBe('days'))
      expect(lastParams().get('sort_dir')).toBe('desc')

      fireEvent.click(daysHeader())
      await waitFor(() => expect(lastParams().get('sort_dir')).toBe('asc'))
    })

    it('sends the column and direction chosen in the mobile selector', async () => {
      await renderTab()

      fireEvent.change(screen.getByRole('combobox', { name: 'Ordenar' }), { target: { value: 'days:asc' } })

      await waitFor(() => expect(lastParams().get('sort_by')).toBe('days'))
      expect(lastParams().get('sort_dir')).toBe('asc')
    })
  })

  describe('filters', () => {
    it('sends the days chosen and goes back to page 1', async () => {
      await renderTab()
      fireEvent.click(screen.getByRole('button', { name: 'Página siguiente' }))
      await waitFor(() => expect(lastParams().get('page')).toBe('2'))

      fireEvent.click(daysButton('90 días'))

      await waitFor(() => expect(lastParams().get('days')).toBe('90'))
      expect(lastParams().get('page')).toBe('1')
    })

    it('sends each filter and goes back to page 1', async () => {
      await renderTab()
      await screen.findByRole('option', { name: 'Distribuidora Sur' })
      const goToPage2 = async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Página siguiente' }))
        await waitFor(() => expect(lastParams().get('page')).toBe('2'))
      }

      await goToPage2()
      fireEvent.change(screen.getByRole('combobox', { name: 'Proveedor' }), { target: { value: '7' } })
      await waitFor(() => expect(lastParams().get('provider_id')).toBe('7'))
      expect(lastParams().get('page')).toBe('1')

      await goToPage2()
      fireEvent.change(screen.getByRole('combobox', { name: 'Excluir categoría' }), { target: { value: '10' } })
      await waitFor(() => expect(lastParams().get('exclude_category_ids')).toBe('10'))
      expect(lastParams().get('page')).toBe('1')

      fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar' }), { target: { value: 'arroz' } })
      await waitFor(() => expect(lastParams().get('search')).toBe('arroz'))
    })

    it('clears and disables the excluded categories when a category is chosen', async () => {
      await renderTab()
      await within(screen.getByRole('combobox', { name: 'Excluir categoría' })).findByRole('option', { name: 'Recargas' })
      fireEvent.change(screen.getByRole('combobox', { name: 'Excluir categoría' }), { target: { value: '10' } })
      await waitFor(() => expect(lastParams().get('exclude_category_ids')).toBe('10'))

      fireEvent.change(screen.getByRole('combobox', { name: 'Categoría' }), { target: { value: '2' } })

      await waitFor(() => expect(lastParams().get('category_id')).toBe('2'))
      expect(lastParams().has('exclude_category_ids')).toBe(false)
      expect(screen.getByRole('combobox', { name: 'Excluir categoría' })).toBeDisabled()
    })

    it('counts the active filters on the mobile button', async () => {
      await renderTab()
      await screen.findByRole('option', { name: 'Distribuidora Sur' })

      fireEvent.change(screen.getByRole('combobox', { name: 'Proveedor' }), { target: { value: '7' } })
      fireEvent.click(noCostToggle())
      fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar' }), { target: { value: 'arroz' } })
      await waitFor(() => expect(lastParams().get('search')).toBe('arroz'))

      expect(screen.getByLabelText('3 activos')).toHaveTextContent('3')
    })
  })

  describe('editing products', () => {
    it('shows an edit button on each product', async () => {
      await renderTab()

      for (const name of ['Arroz', 'Lenteja', 'Queso', 'Jabón']) {
        expect(within(tableRow(name)).getByRole('button', { name: `Editar ${name}` })).toBeInTheDocument()
      }
    })

    it('hides the edit button without products.update', async () => {
      permissions = ['reports.rotation']
      await renderTab()

      expect(screen.queryByRole('button', { name: /^Editar / })).toBeNull()
    })

    it('opens the product form with the full product', async () => {
      await renderTab()

      fireEvent.click(within(tableRow('Lenteja')).getByRole('button', { name: 'Editar Lenteja' }))

      const form = await screen.findByRole('dialog', { name: 'Formulario de producto' })
      expect(api.get).toHaveBeenCalledWith('products/11')
      expect(form).toHaveTextContent('Editando Lenteja (detalle)')
    })

    it('closes the form and asks for the rotation again with the same parameters after saving', async () => {
      await renderTab()
      fireEvent.click(daysButton('60 días'))
      await waitFor(() => expect(lastParams().get('days')).toBe('60'))
      const before = rotationCalls()

      fireEvent.click(within(tableRow('Lenteja')).getByRole('button', { name: 'Editar Lenteja' }))
      fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Guardar' }))

      await waitFor(() => expect(rotationCalls()).toHaveLength(before.length + 1))
      expect(rotationCalls().at(-1)).toBe(before.at(-1))
      expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('closes the form without asking for the rotation again when cancelled', async () => {
      await renderTab()
      const before = rotationCalls().length

      fireEvent.click(within(tableRow('Lenteja')).getByRole('button', { name: 'Editar Lenteja' }))
      fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancelar' }))

      expect(screen.queryByRole('dialog')).toBeNull()
      expect(rotationCalls()).toHaveLength(before)
    })
  })
})
