// src/components/Products/modals/ProductDetailModal.test.jsx
// El detalle del producto usa el margen compartido con la tabla (spec 06, T2).
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import api from '../../../services/api'
import ProductDetailModal from './ProductDetailModal'

// imageUrl.js lee api.defaults.baseURL al importarse
vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), defaults: { baseURL: '/api' } } }))

const renderDetail = async (prices) => {
  api.get.mockResolvedValue({
    data: { data: { product_id: 7, name: 'Agua natural', is_active: 1, is_variable: 0, ...prices } },
  })
  render(<ProductDetailModal productId={7} canEdit={false} onClose={() => {}} onEdit={() => {}} />)
  await screen.findByText('Agua natural')
  return screen.getByText('Margen').closest('.prd-detail__row')
}

describe('ProductDetailModal margin', () => {
  beforeEach(() => { api.get.mockReset() })

  it('shows the shared margin with one decimal', async () => {
    const row = await renderDetail({ purchase_price: 87.65, sale_price: 100 })

    expect(row).toHaveTextContent('12.4%')
  })

  it('shows "—" instead of 100.0% for a product without cost', async () => {
    const row = await renderDetail({ purchase_price: 0, sale_price: 25 })

    expect(row).toHaveTextContent('—')
    expect(row).not.toHaveTextContent('%')
  })

  it('shows "—" instead of an invalid value with a sale price of 0', async () => {
    const row = await renderDetail({ purchase_price: 10, sale_price: 0 })

    expect(row).toHaveTextContent('—')
    expect(row).not.toHaveTextContent(/NaN|Infinity/)
  })
})
