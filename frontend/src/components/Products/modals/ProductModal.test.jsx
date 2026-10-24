// src/components/Products/modals/ProductModal.test.jsx
// El margen en vivo del formulario usa la fórmula compartida (spec 06, T2).
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ProductModal from './ProductModal'

// imageUrl.js lee api.defaults.baseURL al importarse
vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), defaults: { baseURL: '/api' } } }))

const renderForm = (purchasePrice, salePrice) => {
  render(<ProductModal product={null} categories={[]} providers={[]} onSaved={() => {}} onClose={() => {}} />)
  fireEvent.change(screen.getByLabelText(/Precio de compra/), { target: { value: purchasePrice } })
  fireEvent.change(screen.getByLabelText(/Precio de venta/), { target: { value: salePrice } })
}

const marginBox = () => screen.queryByText(/^Margen:/)?.closest('.prd-margin') ?? null

describe('ProductModal live margin', () => {
  it('shows the shared margin, rounded without floating point drift, with its level', () => {
    renderForm('87.65', '100')

    expect(marginBox()).toHaveTextContent('Margen: 12.4%')
    expect(marginBox()).toHaveTextContent('Margen bajo')
  })

  it('keeps the loss warning for a negative margin', () => {
    renderForm('112.5', '100')

    expect(marginBox()).toHaveTextContent('Margen: -12.5%')
    expect(marginBox()).toHaveTextContent('Vendiendo a pérdida')
  })

  it('hides the margin without cost or without sale price', () => {
    renderForm('0', '100')
    expect(marginBox()).toBeNull()

    fireEvent.change(screen.getByLabelText(/Precio de compra/), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText(/Precio de venta/), { target: { value: '' } })
    expect(marginBox()).toBeNull()
  })
})
