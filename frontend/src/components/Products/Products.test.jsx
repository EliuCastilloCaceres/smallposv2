// src/components/Products/Products.test.jsx
// Costo, margen y filtro "Sin costo" en la tabla de Productos (spec 06, T3).
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import api from '../../services/api'
import Products from './Products'

let permissions = []

// imageUrl.js lee api.defaults.baseURL al importarse
vi.mock('../../services/api', () => ({ default: { get: vi.fn(), defaults: { baseURL: '/api' } } }))
vi.mock('../../context/UserContext', () => ({
  useUser: () => ({
    user: { username: 'tester' },
    isAdmin: false,
    hasPermission: (module, action) => permissions.includes(`${module}.${action}`),
  }),
}))

const product = (product_id, name, purchase_price, sale_price) => ({
  product_id, name, purchase_price, sale_price, sku: null, uom: 'pza', image: null,
  category_name: null, provider_name: null, is_variable: 0, is_active: 1,
})

const PRODUCTS = [
  product(1, 'Galletas',     60,    100),
  product(2, 'Agua natural', 0,     25),
  product(3, 'Refresco',     112.5, 100),
]

const mockApi = () => {
  api.get.mockImplementation((url) => {
    if (url.startsWith('categories')) return Promise.resolve({ data: { data: [{ category_id: 5, name: 'Bebidas' }] } })
    if (url.startsWith('providers'))  return Promise.resolve({ data: { data: [] } })
    return Promise.resolve({ data: { data: PRODUCTS, pagination: { total: 25, page: 1, limit: 20, totalPages: 2 } } })
  })
}

// Parámetros de la última llamada a products
const lastProductsParams = () => {
  const url = api.get.mock.calls.map(([u]) => u).filter(u => u.startsWith('products?')).at(-1)
  return new URLSearchParams(url.split('?')[1])
}

const renderProducts = async () => {
  const view = render(<Products />)
  await screen.findByRole('table')
  return view
}

const tableRow = (name) => within(screen.getByRole('table')).getByText(name).closest('tr')

describe('Products cost and margin', () => {
  beforeEach(() => {
    permissions = ['products.read']
    api.get.mockReset()
    mockApi()
  })

  it('shows Costo before Precio venta and Margen after it, to a user with only products.read', async () => {
    await renderProducts()
    const headers = within(screen.getByRole('table')).getAllByRole('columnheader').map(th => th.textContent)

    expect(headers).toEqual(['Producto', 'Categoría', 'Proveedor', 'UM', 'Costo', 'Precio venta', 'Margen', 'Estado'])
    expect(tableRow('Galletas')).toHaveTextContent('$60.00$100.0040.0%')
  })

  it('shows a cost of 0 as $0.00 in orange and "—" as its margin', async () => {
    await renderProducts()
    const row = tableRow('Agua natural')
    const cost = within(row).getByText('$0.00')

    expect(cost).toHaveClass('prd-no-cost')
    expect(cost).toHaveAttribute('title', 'Sin costo')
    expect(row).toHaveTextContent('—')
    expect(within(tableRow('Galletas')).getByText('$60.00')).toBeInTheDocument()
    expect(within(tableRow('Galletas')).queryByTitle('Sin costo')).toBeNull()
  })

  it('shows a negative margin in red', async () => {
    await renderProducts()

    expect(within(tableRow('Refresco')).getByText('-12.5%')).toHaveClass('prd-margin-value--negative')
    expect(within(tableRow('Galletas')).getByText('40.0%')).not.toHaveClass('prd-margin-value--negative')
  })

  it('shows the cost and the margin in the mobile cards', async () => {
    const { container } = await renderProducts()
    const card = (name) => within(container.querySelector('.prd-cards')).getByText(name).closest('.prd-card')

    expect(card('Galletas')).toHaveTextContent('Costo$60.00')
    expect(card('Galletas')).toHaveTextContent('Margen40.0%')
    expect(within(card('Agua natural')).getByText('$0.00')).toHaveClass('prd-no-cost')
    expect(card('Agua natural')).toHaveTextContent('Margen—')
  })

  it('sends no_cost=true, goes back to page 1 and combines with the other filters', async () => {
    const { container } = await renderProducts()
    expect(lastProductsParams().has('no_cost')).toBe(false)

    fireEvent.click(container.querySelector('.prd-pagination button:last-child'))
    await waitFor(() => expect(lastProductsParams().get('page')).toBe('2'))

    fireEvent.change(screen.getByDisplayValue('Todas las categorías'), { target: { value: '5' } })
    await waitFor(() => expect(lastProductsParams().get('category_id')).toBe('5'))

    fireEvent.change(screen.getByDisplayValue('Con y sin costo'), { target: { value: 'true' } })
    await waitFor(() => expect(lastProductsParams().get('no_cost')).toBe('true'))
    expect(lastProductsParams().get('page')).toBe('1')
    expect(lastProductsParams().get('category_id')).toBe('5')
  })
})
