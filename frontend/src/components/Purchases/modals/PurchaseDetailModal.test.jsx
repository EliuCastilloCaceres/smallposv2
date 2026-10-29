// src/components/Purchases/modals/PurchaseDetailModal.test.jsx
// Detalle de una compra y su cancelación con la API simulada (spec 14, T7):
// las líneas con el costo antes y después, la cancelación con motivo, los
// avisos del reingreso y del costo, el error de stock insuficiente y el
// comprobante después de guardar (spec 15, T3).
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import api from '../../../services/api'
import PurchaseDetailModal from './PurchaseDetailModal'

vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }))

const money = (n) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })

const PURCHASE = {
  purchase_id: 7, purchase_date: '2026-10-28', total: 328, folio: 'F-100', notes: 'Faltó una caja',
  status: 'active', branch_name: 'Sucursal Central', provider_name: 'Pepsi', payment_method_name: 'Efectivo',
  has_receipt: true, receipt_name: 'factura.png',
  receipt_uploaded_by_name: 'Carla Díaz', receipt_uploaded_at: '2026-10-28T16:05:00Z', created_at: '2026-10-28T16:00:00Z', created_by_name: 'Ana López',
  paid_from_register: true,
  cash_movement: { cash_movement_id: 40, session_id: 12, register_name: 'Caja 1', session_open: true },
  cancel_reason: null, cancelled_at: null, cancelled_by_name: null, refund_registered: false,
  items: [
    { purchase_item_id: 1, product_name: 'Coca-Cola 600 ml', variant_label: null, uom: 'pza',
      quantity: 24, unit_cost: 9.5, subtotal: 228, cost_before: 8, cost_after: 9 },
    { purchase_item_id: 2, product_name: 'Playera básica', variant_label: 'CH', uom: 'pza',
      quantity: 2, unit_cost: 50, subtotal: 100, cost_before: 50, cost_after: 50 },
  ],
}

const CANCELLED = {
  ...PURCHASE, status: 'cancelled', cancel_reason: 'Factura duplicada',
  cancelled_at: '2026-10-28T17:00:00Z', cancelled_by_name: 'Beto Ruiz', refund_registered: true,
}

const NO_RECEIPT = {
  ...PURCHASE, has_receipt: false, receipt_name: null, receipt_uploaded_by_name: null, receipt_uploaded_at: null,
}

const renderDetail = async ({ purchase = PURCHASE, canCancel = true, canAttach = false } = {}) => {
  api.get.mockResolvedValue({ data: { data: purchase } })
  const onCancelled = vi.fn()
  const onReceiptSaved = vi.fn()
  render(
    <PurchaseDetailModal purchaseId={purchase.purchase_id} canCancel={canCancel} canAttach={canAttach}
      onCancelled={onCancelled} onReceiptSaved={onReceiptSaved} onClose={vi.fn()} />
  )
  await screen.findByText('Pepsi')
  return { onCancelled, onReceiptSaved }
}

const chooseReceipt = (file) =>
  fireEvent.change(screen.getByLabelText('Archivo del comprobante'), { target: { files: [file] } })

const cancelWith = (reason) => {
  fireEvent.click(screen.getByRole('button', { name: /Cancelar compra/ }))
  fireEvent.change(screen.getByLabelText(/Motivo de la cancelación/), { target: { value: reason } })
  fireEvent.click(screen.getByRole('button', { name: /Confirmar cancelación/ }))
}

describe('PurchaseDetailModal', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('shows the purchase, its lines with the cost before and after, and its cash movement', async () => {
    await renderDetail()

    expect(api.get).toHaveBeenCalledWith('purchases/7')
    expect(screen.getByText(money(328))).toBeInTheDocument()
    expect(screen.getByText('F-100')).toBeInTheDocument()
    expect(screen.getByText('Faltó una caja')).toBeInTheDocument()
    expect(screen.getByText(/Ana López/)).toBeInTheDocument()
    expect(screen.getByText(/Caja 1 · sesión #12 \(abierta\)/)).toBeInTheDocument()

    const lines = within(screen.getByRole('list', { name: 'Productos de la compra' })).getAllByRole('listitem')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toHaveTextContent('Coca-Cola 600 ml')
    expect(lines[0]).toHaveTextContent(`24 pza × ${money(9.5)}`)
    expect(lines[0]).toHaveTextContent(`${money(8)} → ${money(9)}`)
    expect(lines[0]).toHaveTextContent(money(228))
    expect(lines[1]).toHaveTextContent('Playera básica · CH')
    expect(screen.getByRole('button', { name: /Ver comprobante/ })).toBeInTheDocument()
  })

  it('cancels with a reason and registers the refund while the session is open', async () => {
    api.post.mockResolvedValue({ data: { data: { purchase: CANCELLED, refund: 'registered' } } })
    const { onCancelled } = await renderDetail()

    cancelWith(' Factura duplicada ')

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('purchases/7/cancel', { reason: 'Factura duplicada' }))
    expect(await screen.findByText(`Se registró el reingreso de ${money(328)} en Caja 1.`)).toBeInTheDocument()
    expect(screen.getByText('Beto Ruiz')).toBeInTheDocument()
    expect(screen.getByText('El costo de los productos no se revirtió. Si quedó mal, corrígelo en Productos.')).toBeInTheDocument()
    expect(onCancelled).toHaveBeenCalledWith(CANCELLED)
    expect(screen.queryByRole('button', { name: /Cancelar compra/ })).not.toBeInTheDocument()
  })

  it('warns when the session was already closed and there was no refund', async () => {
    api.post.mockResolvedValue({
      data: { data: { purchase: { ...CANCELLED, refund_registered: false }, refund: 'session_closed' } },
    })
    await renderDetail({ purchase: { ...PURCHASE, cash_movement: { ...PURCHASE.cash_movement, session_open: false } } })

    cancelWith('Error')

    expect(await screen.findByText(/La sesión de caja ya se cerró, así que no se registró el reingreso/)).toBeInTheDocument()
    expect(screen.getByText('Sin reingreso (la sesión ya estaba cerrada)')).toBeInTheDocument()
  })

  it('shows the message when there is not enough stock to revert the purchase', async () => {
    api.post.mockRejectedValue({
      response: { status: 409, data: { message: 'No hay stock suficiente de «Playera básica (CH)» para revertir la compra.' } },
    })
    const { onCancelled } = await renderDetail()

    cancelWith('Error')

    expect(await screen.findByRole('alert')).toHaveTextContent('No hay stock suficiente de «Playera básica (CH)» para revertir la compra.')
    expect(onCancelled).not.toHaveBeenCalled()
  })

  it('asks for the reason before cancelling', async () => {
    await renderDetail()

    cancelWith('  ')

    expect(await screen.findByRole('alert')).toHaveTextContent('Escribe el motivo de la cancelación')
    expect(api.post).not.toHaveBeenCalled()
  })

  it('shows a cancelled purchase with who cancelled it, and without the cancel button', async () => {
    await renderDetail({ purchase: CANCELLED, canCancel: true })

    expect(screen.getByText('Cancelada')).toBeInTheDocument()
    expect(screen.getByText('Factura duplicada')).toBeInTheDocument()
    expect(screen.getByText('Registrado')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Cancelar compra/ })).not.toBeInTheDocument()
  })

  it('hides the cancel button without purchases.cancel', async () => {
    await renderDetail({ canCancel: false })

    expect(screen.queryByRole('button', { name: /Cancelar compra/ })).not.toBeInTheDocument()
  })

  describe('receipt after saving', () => {
    it('shows who uploaded the receipt and when', async () => {
      await renderDetail()

      expect(screen.getByText(/Subido por Carla Díaz · /)).toBeInTheDocument()
    })

    it('offers "Agregar comprobante" for an active purchase without one, with purchases.create', async () => {
      await renderDetail({ purchase: NO_RECEIPT, canAttach: true })

      expect(screen.getByText('Sin comprobante')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Agregar comprobante/ })).toBeInTheDocument()
    })

    it('offers "Reemplazar" when the purchase already has a receipt', async () => {
      await renderDetail({ canAttach: true })

      expect(screen.getByRole('button', { name: /Reemplazar/ })).toBeInTheDocument()
    })

    it('does not offer to change the receipt without purchases.create', async () => {
      await renderDetail({ purchase: NO_RECEIPT })

      expect(screen.queryByRole('button', { name: /Agregar comprobante/ })).not.toBeInTheDocument()
    })

    it('does not offer to change the receipt of a cancelled purchase', async () => {
      await renderDetail({ purchase: { ...CANCELLED, has_receipt: false }, canAttach: true })

      expect(screen.queryByRole('button', { name: /Agregar comprobante/ })).not.toBeInTheDocument()
    })

    it('replaces the receipt after confirming, updates the detail and asks the list to reload', async () => {
      const saved = {
        ...PURCHASE, receipt_name: 'factura-buena.pdf',
        receipt_uploaded_by_name: 'Beto Ruiz', receipt_uploaded_at: '2026-10-28T20:00:00Z',
      }
      api.put.mockResolvedValue({ data: { data: saved } })
      const { onReceiptSaved } = await renderDetail({ canAttach: true })

      chooseReceipt(new File(['%PDF'], 'factura-buena.pdf', { type: 'application/pdf' }))
      const confirm = within(screen.getByText(/¿Reemplazar el comprobante\?/).closest('.cfd-modal'))
      fireEvent.click(confirm.getByRole('button', { name: 'Reemplazar' }))

      expect(await screen.findByRole('status')).toHaveTextContent('Comprobante guardado.')
      expect(api.put.mock.calls[0][0]).toBe('purchases/7/receipt')
      expect(screen.getByText(/Subido por Beto Ruiz · /)).toBeInTheDocument()
      expect(onReceiptSaved).toHaveBeenCalledWith(saved)
    })
  })
})
