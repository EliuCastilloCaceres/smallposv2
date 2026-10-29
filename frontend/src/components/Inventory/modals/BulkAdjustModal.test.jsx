// src/components/Inventory/modals/BulkAdjustModal.test.jsx
// El ajuste masivo ya no ofrece "Compra a proveedor": las compras se
// registran en el módulo Compras (spec 14, T4).
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import BulkAdjustModal from './BulkAdjustModal'

vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }))
vi.mock('../../../context/BranchContext', () => ({ useBranch: () => ({ selectedBranch: { branch_id: 1 } }) }))

describe('BulkAdjustModal', () => {
  it('does not offer "Compra a proveedor" as a reason', () => {
    render(<BulkAdjustModal onDone={vi.fn()} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Tabla editable/ }))

    const select = screen.getByText(/Motivo del ajuste/).closest('.inv-field').querySelector('select')
    const reasons = Array.from(select.options).map(o => o.value)
    expect(reasons).toEqual(['Conteo físico', 'Merma', 'Producto dañado', 'Error de registro', 'Otro'])
  })
})
