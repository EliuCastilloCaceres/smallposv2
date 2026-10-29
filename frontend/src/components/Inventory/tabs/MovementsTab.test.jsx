// src/components/Inventory/tabs/MovementsTab.test.jsx
// Etiquetas de las entradas de una compra y de su cancelación en Movimientos
// de inventario (spec 14, T3).
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import api from '../../../services/api'
import MovementsTab from './MovementsTab'

vi.mock('../../../services/api', () => ({ default: { get: vi.fn() } }))

const movement = (id, operation_type, quantity, reason) => ({
  movement_id: id, operation_type, quantity, quantity_before: 10, quantity_after: 10 + quantity,
  reason, product_name: 'Coca-Cola 600 ml', product_sku: 'COC-600', created_at: '2026-10-28T15:00:00Z',
})

describe('MovementsTab', () => {
  it('labels the entries of a purchase as "Compra" and its reversal as "Compra cancelada"', async () => {
    api.get.mockResolvedValue({
      data: {
        data: [
          movement(1, 'purchase', 24, 'Compra #4 – Coca-Cola'),
          movement(2, 'purchase_cancelled', -24, 'Cancelación de la compra #4'),
        ],
        pagination: { total: 2, page: 1, totalPages: 1 },
      },
    })
    render(<MovementsTab branchId={1} />)

    const table = await screen.findByRole('table')
    expect(within(table).getByText('Compra', { selector: '.inv-op-badge' })).toHaveClass('inv-op--entry')
    expect(within(table).getByText('Compra cancelada', { selector: '.inv-op-badge' })).toHaveClass('inv-op--exit')
  })

  it('offers both purchase types in the type filter', async () => {
    api.get.mockResolvedValue({ data: { data: [], pagination: { total: 0, page: 1, totalPages: 1 } } })
    render(<MovementsTab branchId={1} />)

    await screen.findByText('No se encontraron movimientos en este período')
    expect(screen.getByRole('option', { name: 'Compra' })).toHaveValue('purchase')
    expect(screen.getByRole('option', { name: 'Compra cancelada' })).toHaveValue('purchase_cancelled')
  })
})
