// src/components/Pos/printCorteReport.test.js
// Etiquetas de los movimientos en el reporte impreso del corte (spec 12, T2, y
// spec 14, T3).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { openCorteReportWindow } from './printCorteReport'

const REPORT = {
  branchName: 'Sucursal Central', registerName: 'Caja 1', cashierName: 'Ana',
  openedAt: '2026-10-27T14:00:00Z', closedAt: '2026-10-27T22:00:00Z',
  openAmount: 100, expectedClose: 105, cashCounted: 105, withdrawAmt: 40, closeAmount: 65, difference: 0,
  paymentBreakdown: [{ payment_method_id: 8, code: 'cash', name: 'Efectivo', total: 0 }],
  productsSold: [],
  stats: { totalOrders: 0, avgTicket: 0, totalDiscounts: 0, cancelledCount: 0, topProduct: null },
  movements: [
    { movement_type: 'withdrawal',     amount: 40, description: 'Retiro en corte de caja', user_name: 'Ana', created_at: '2026-10-27T21:00:00Z' },
    { movement_type: 'expense',        amount: 20, description: 'Gasto #3: Servicios – Luz', user_name: 'Ana', created_at: '2026-10-27T18:00:00Z' },
    { movement_type: 'expense_refund', amount: 20, description: 'Reingreso del gasto #3', user_name: 'Ana', created_at: '2026-10-27T19:00:00Z' },
    { movement_type: 'legacy_expense', amount: 5,  description: 'PAGO DE PEPSI', user_name: 'Ana', created_at: '2026-10-27T15:00:00Z' },
    { movement_type: 'purchase',        amount: 25, description: 'Compra #4: Pepsi', user_name: 'Ana', created_at: '2026-10-27T16:00:00Z' },
    { movement_type: 'purchase_refund', amount: 25, description: 'Reingreso de la compra #4', user_name: 'Ana', created_at: '2026-10-27T17:00:00Z' },
  ],
}

// Abre el reporte con una ventana simulada y devuelve el HTML que escribió
const renderReport = (report) => {
  let html = ''
  vi.spyOn(window, 'open').mockReturnValue({
    document: { write: (content) => { html += content }, close: vi.fn() },
    focus: vi.fn(), print: vi.fn(), onload: null,
  })
  openCorteReportWindow(report)
  return html
}

describe('openCorteReportWindow', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('labels withdrawals, expenses, purchases, their refunds and legacy expenses', () => {
    const html = renderReport(REPORT)

    expect(html).toContain('<td>Retiro</td>')
    expect(html).toContain('<td>Gasto</td>')
    expect(html).toContain('<td>Reingreso de gasto</td>')
    expect(html).toContain('<td>Salida de caja (histórico)</td>')
    expect(html).toContain('<td>Compra</td>')
    expect(html).toContain('<td>Reingreso de compra</td>')
    expect(html).not.toContain('Retiro manual')
  })
})
