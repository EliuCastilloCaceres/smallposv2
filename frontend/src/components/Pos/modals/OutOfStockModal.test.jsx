// src/components/Pos/modals/OutOfStockModal.test.jsx
// El producto agotado del POS ya no ofrece "Compra a proveedor": la compra se
// registra en Movimientos de caja → Compra (spec 14, T4).
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import OutOfStockModal from './OutOfStockModal'

vi.mock('../../../services/api', () => ({ default: { post: vi.fn() } }))
vi.mock('../../../context/PosContext', () => ({ usePos: () => ({ branchId: 1, addItem: vi.fn() }) }))

const TARGET = { product_id: 5, variant_id: null, name: 'Coca-Cola 600 ml', sku: 'COC-600', unit_price: 18, stock: 0 }

describe('OutOfStockModal', () => {
  it('does not offer "Compra a proveedor" as a reason', () => {
    render(<OutOfStockModal target={TARGET} onClose={vi.fn()} />)

    const select = screen.getByText('Motivo').closest('.pos-field').querySelector('select')
    expect(Array.from(select.options).map(o => o.value)).toEqual(['Conteo físico', 'Otro'])
  })
})
