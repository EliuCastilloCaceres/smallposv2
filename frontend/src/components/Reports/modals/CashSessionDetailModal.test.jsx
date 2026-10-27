// src/components/Reports/modals/CashSessionDetailModal.test.jsx
// Etiquetas de los movimientos en el detalle de Sesiones de caja (spec 12, T2).
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import api from '../../../services/api'
import CashSessionDetailModal from './CashSessionDetailModal'

vi.mock('../../../services/api', () => ({ default: { get: vi.fn() } }))

const SESSION = {
  registerName: 'Caja 1', branchName: 'Sucursal Central', cashierName: 'Ana', isOpen: false,
  openedAt: '2026-10-27T14:00:00Z', closedAt: '2026-10-27T22:00:00Z',
  openAmount: 100, expected: 105, closeAmount: 105, difference: 0,
  paymentBreakdown: [],
  stats: { totalOrders: 0, totalSales: 0, totalDiscounts: 0, avgTicket: 0, cancelledCount: 0, topProduct: null },
  productsSold: [],
  movements: [
    { movement_type: 'withdrawal',     amount: 40, description: 'Retiro en corte de caja' },
    { movement_type: 'expense',        amount: 20, description: 'Gasto #3: Servicios – Luz' },
    { movement_type: 'expense_refund', amount: 20, description: 'Reingreso del gasto #3' },
    { movement_type: 'legacy_expense', amount: 5,  description: 'PAGO DE PEPSI' },
  ],
}

describe('CashSessionDetailModal', () => {
  it('labels each movement type and colors it as an input or an output', async () => {
    api.get.mockResolvedValue({ data: { data: SESSION } })
    render(<CashSessionDetailModal sessionId={7} onClose={vi.fn()} />)

    const row = (label) => screen.getByText(label, { selector: '.rpt-detail-list__name' })
      .closest('.rpt-detail-list__row').querySelector('.rpt-detail-list__amt')

    expect(await screen.findByText('Retiro', { selector: '.rpt-detail-list__name' })).toBeInTheDocument()
    expect(row('Retiro')).toHaveClass('rpt-detail-list__amt--out')
    expect(row('Gasto')).toHaveClass('rpt-detail-list__amt--out')
    expect(row('Reingreso de gasto')).toHaveClass('rpt-detail-list__amt--in')
    expect(row('Salida de caja (histórico)')).toHaveClass('rpt-detail-list__amt--out')
  })
})
