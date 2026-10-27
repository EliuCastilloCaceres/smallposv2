// src/components/Expenses/modals/ExpenseDetailModal.test.jsx
// Detalle de un gasto y su cancelación con la API simulada (spec 12, T6),
// incluido el aviso cuando ya no se puede registrar el reingreso.
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import api from '../../../services/api'
import ExpenseDetailModal from './ExpenseDetailModal'

vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }))

const money = (n) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })

const EXPENSE = {
  expense_id: 5, expense_date: '2026-10-20', amount: 150, description: 'Garrafones', folio: 'T-99',
  status: 'active', branch_name: 'Sucursal Central', category_name: 'Servicios',
  payment_method_name: 'Efectivo', provider_name: 'Pepsi', has_receipt: true, receipt_name: 'ticket.png',
  created_at: '2026-10-20T16:00:00Z', created_by_name: 'Ana López', paid_from_register: true,
  cash_movement: { cash_movement_id: 40, session_id: 12, register_name: 'Caja 1', session_open: true },
  cancel_reason: null, cancelled_at: null, cancelled_by_name: null, refund_registered: false,
}

const CANCELLED = {
  ...EXPENSE, status: 'cancelled', cancel_reason: 'No se compró',
  cancelled_at: '2026-10-20T17:00:00Z', cancelled_by_name: 'Beto Ruiz', refund_registered: true,
}

const renderDetail = async ({ expense = EXPENSE, canCancel = true } = {}) => {
  api.get.mockResolvedValue({ data: { data: expense } })
  const onCancelled = vi.fn()
  render(<ExpenseDetailModal expenseId={expense.expense_id} canCancel={canCancel} onCancelled={onCancelled} onClose={vi.fn()} />)
  await screen.findByText('Garrafones')
  return { onCancelled }
}

describe('ExpenseDetailModal', () => {
  beforeEach(() => { vi.clearAllMocks() })
  afterEach(() => { vi.restoreAllMocks() })

  it('shows the data of the expense, who registered it and its cash movement', async () => {
    await renderDetail()

    expect(api.get).toHaveBeenCalledWith('expenses/5')
    expect(screen.getByText(money(150))).toBeInTheDocument()
    expect(screen.getByText('Servicios')).toBeInTheDocument()
    expect(screen.getByText('Pepsi')).toBeInTheDocument()
    expect(screen.getByText('T-99')).toBeInTheDocument()
    expect(screen.getByText(/Ana López/)).toBeInTheDocument()
    expect(screen.getByText(/Caja 1 · sesión #12 \(abierta\)/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Ver comprobante/ })).toBeInTheDocument()
  })

  it('cancels with a reason and registers the refund while the session is open', async () => {
    api.post.mockResolvedValue({ data: { data: { expense: CANCELLED, refund: 'registered' } } })
    const { onCancelled } = await renderDetail()

    fireEvent.click(screen.getByRole('button', { name: /Cancelar gasto/ }))
    fireEvent.change(screen.getByLabelText(/Motivo de la cancelación/), { target: { value: ' No se compró ' } })
    fireEvent.click(screen.getByRole('button', { name: /Confirmar cancelación/ }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('expenses/5/cancel', { reason: 'No se compró' }))
    expect(await screen.findByRole('status')).toHaveTextContent(`Se registró el reingreso de ${money(150)} en Caja 1.`)
    expect(screen.getByText('Beto Ruiz')).toBeInTheDocument()
    expect(screen.getByText('Registrado')).toBeInTheDocument()
    expect(onCancelled).toHaveBeenCalledWith(CANCELLED)
    expect(screen.queryByRole('button', { name: /Cancelar gasto/ })).not.toBeInTheDocument()
  })

  it('warns that the refund was not registered when the session was already closed', async () => {
    const closed = { ...EXPENSE, cash_movement: { ...EXPENSE.cash_movement, session_open: false } }
    api.post.mockResolvedValue({ data: { data: { expense: { ...CANCELLED, ...closed, status: 'cancelled', refund_registered: false }, refund: 'session_closed' } } })
    await renderDetail({ expense: closed })

    fireEvent.click(screen.getByRole('button', { name: /Cancelar gasto/ }))
    expect(screen.getByText('La sesión de caja ya se cerró: no se registrará el reingreso.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/Motivo de la cancelación/), { target: { value: 'Error' } })
    fireEvent.click(screen.getByRole('button', { name: /Confirmar cancelación/ }))

    expect(await screen.findByRole('status')).toHaveTextContent(
      'La sesión de caja ya se cerró, así que no se registró el reingreso. ' +
      'Si el dinero regresó, regístralo como Ingreso manual en la caja abierta.'
    )
  })

  it('requires the reason before cancelling', async () => {
    await renderDetail()

    fireEvent.click(screen.getByRole('button', { name: /Cancelar gasto/ }))
    fireEvent.click(screen.getByRole('button', { name: /Confirmar cancelación/ }))

    expect(screen.getByRole('alert')).toHaveTextContent('Escribe el motivo de la cancelación')
    expect(api.post).not.toHaveBeenCalled()
  })

  it('hides "Cancelar gasto" without expenses.cancel', async () => {
    await renderDetail({ canCancel: false })

    expect(screen.queryByRole('button', { name: /Cancelar gasto/ })).not.toBeInTheDocument()
  })

  it('shows the cancellation of a cancelled expense, without the cancel button', async () => {
    await renderDetail({ expense: CANCELLED })

    expect(screen.getAllByText('Cancelado').length).toBeGreaterThan(0)
    expect(screen.getByText('No se compró')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Cancelar gasto/ })).not.toBeInTheDocument()
  })

  it('opens the receipt in a new tab', async () => {
    const tab = { location: { href: '' }, close: vi.fn() }
    vi.spyOn(window, 'open').mockReturnValue(tab)
    URL.createObjectURL = vi.fn(() => 'blob:comprobante')
    await renderDetail()
    api.get.mockResolvedValue({ data: new Blob(['png']) })

    fireEvent.click(screen.getByRole('button', { name: /Ver comprobante/ }))

    await waitFor(() => expect(tab.location.href).toBe('blob:comprobante'))
    expect(api.get).toHaveBeenLastCalledWith('expenses/5/receipt', { responseType: 'blob' })
  })
})
