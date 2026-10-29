// src/components/Inventory/drawers/AdjustDrawer.test.jsx
// El ajuste individual ya no ofrece "Compra a proveedor": las compras se
// registran en el módulo Compras (spec 14, T4).
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import AdjustDrawer from './AdjustDrawer'

vi.mock('../../../services/api', () => ({ default: { post: vi.fn() } }))
vi.mock('../../../context/BranchContext', () => ({ useBranch: () => ({ selectedBranch: { branch_id: 1 } }) }))

const PRODUCT = { product_id: 5, name: 'Coca-Cola 600 ml', sku: 'COC-600', total_stock: 12, variants: [] }

describe('AdjustDrawer', () => {
  it('does not offer "Compra a proveedor" as a reason', () => {
    render(<AdjustDrawer product={PRODUCT} variant={null} onDone={vi.fn()} onClose={vi.fn()} />)

    const reasons = Array.from(screen.getByLabelText(/Motivo/).options).map(o => o.value)
    expect(reasons).toEqual([
      'Conteo físico', 'Merma', 'Producto dañado', 'Error de registro', 'Devolución de cliente', 'Otro',
    ])
  })
})
