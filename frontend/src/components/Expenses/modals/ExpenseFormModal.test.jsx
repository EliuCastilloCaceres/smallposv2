// src/components/Expenses/modals/ExpenseFormModal.test.jsx
// Formulario de nuevo gasto con la API simulada (spec 12, T6): "Pagado desde
// caja" solo con Efectivo y con la caja, y lo que se manda.
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import api from '../../../services/api'
import { todayInAppTimezone } from '../../../utils/dateRanges'
import ExpenseFormModal from './ExpenseFormModal'

vi.mock('../../../services/api', () => ({ default: { post: vi.fn() } }))

const OPTIONS = {
  categories:      [{ expense_category_id: 1, name: 'Renta' }, { expense_category_id: 2, name: 'Servicios' }],
  payment_methods: [{ payment_method_id: 8, code: 'cash', name: 'Efectivo' }, { payment_method_id: 10, code: 'transfer', name: 'Transferencia Bancaria' }],
  providers:       [{ provider_id: 4, name: 'Pepsi' }],
  registers:       [
    { cash_register_id: 1, name: 'Caja 1', branch_id: 1 },
    { cash_register_id: 5, name: 'Caja Norte', branch_id: 2 },
  ],
  branches:        [{ branch_id: 1, name: 'Sucursal Central' }, { branch_id: 2, name: 'Sucursal Norte' }],
}
const BRANCH_OPTIONS = { ...OPTIONS, registers: [OPTIONS.registers[0]], branches: undefined }

const renderForm = ({ options = BRANCH_OPTIONS, isCentralAdmin = false } = {}) => {
  const onSaved = vi.fn()
  render(<ExpenseFormModal options={options} isCentralAdmin={isCentralAdmin} onSaved={onSaved} onClose={vi.fn()} />)
  return { onSaved }
}

const change = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } })

const fillRequired = () => {
  change(/Categoría/, '2')
  change(/Monto/, '150.5')
  change(/Descripción/, ' Garrafones ')
}

// FormData de la última llamada a POST /expenses, como objeto
const sentForm = () => {
  const [url, form] = api.post.mock.calls.at(-1)
  expect(url).toBe('expenses')
  return Object.fromEntries(form.entries())
}

describe('ExpenseFormModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.post.mockResolvedValue({ data: { data: { expense_id: 9 } } })
  })

  it('offers "Pagado desde caja" only with Efectivo, and then asks for the register', () => {
    renderForm()

    change(/Método de pago/, '10')
    expect(screen.queryByRole('checkbox', { name: /Pagado desde caja/ })).not.toBeInTheDocument()

    change(/Método de pago/, '8')
    fireEvent.click(screen.getByRole('checkbox', { name: /Pagado desde caja/ }))

    // Con una sola caja abierta, ya viene elegida; la fecha queda en hoy
    expect(screen.getByLabelText(/^Caja/)).toHaveValue('1')
    expect(screen.getByLabelText(/Fecha del gasto/)).toBeDisabled()
    expect(screen.getByLabelText(/Fecha del gasto/)).toHaveValue(todayInAppTimezone())
  })

  it('drops "Pagado desde caja" when the method changes from Efectivo', () => {
    renderForm()
    change(/Método de pago/, '8')
    fireEvent.click(screen.getByRole('checkbox', { name: /Pagado desde caja/ }))

    change(/Método de pago/, '10')

    expect(screen.queryByLabelText(/^Caja/)).not.toBeInTheDocument()
    expect(screen.getByLabelText(/Fecha del gasto/)).not.toBeDisabled()
  })

  it('sends an expense paid from the register with its register', async () => {
    const { onSaved } = renderForm()
    fillRequired()
    change(/Método de pago/, '8')
    fireEvent.click(screen.getByRole('checkbox', { name: /Pagado desde caja/ }))

    fireEvent.click(screen.getByRole('button', { name: /Registrar gasto/ }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ expense_id: 9 }))
    expect(sentForm()).toEqual({
      expense_date: todayInAppTimezone(), expense_category_id: '2', amount: '150.5',
      description: 'Garrafones', payment_method_id: '8',
      paid_from_register: 'true', cash_register_id: '1',
    })
  })

  it('sends an expense of a past date with provider, folio and receipt', async () => {
    renderForm()
    fillRequired()
    change(/Método de pago/, '10')
    change(/Fecha del gasto/, '2026-10-01')
    change(/Proveedor/, '4')
    change(/Folio/, ' F-1 ')
    const file = new File(['%PDF-1.4'], 'factura.pdf', { type: 'application/pdf' })
    fireEvent.change(screen.getByLabelText(/Comprobante/), { target: { files: [file] } })

    fireEvent.click(screen.getByRole('button', { name: /Registrar gasto/ }))

    await waitFor(() => expect(api.post).toHaveBeenCalled())
    const sent = sentForm()
    expect(sent).toMatchObject({ expense_date: '2026-10-01', provider_id: '4', folio: 'F-1', payment_method_id: '10' })
    expect(sent.receipt.name).toBe('factura.pdf')
    expect(sent.paid_from_register).toBeUndefined()
  })

  it('rejects a receipt of more than 5 MB before sending it', () => {
    renderForm()
    const big = new File(['x'], 'foto.jpg', { type: 'image/jpeg' })
    Object.defineProperty(big, 'size', { value: 6 * 1024 * 1024 })

    fireEvent.change(screen.getByLabelText(/Comprobante/), { target: { files: [big] } })

    expect(screen.getByRole('alert')).toHaveTextContent('El comprobante no puede pesar más de 5 MB.')
  })

  it('asks the central admin for the branch and offers only its open registers', async () => {
    renderForm({ options: OPTIONS, isCentralAdmin: true })
    change(/Método de pago/, '8')
    expect(screen.getByRole('checkbox', { name: /Pagado desde caja/ })).toBeDisabled()

    change(/Sucursal/, '2')
    fireEvent.click(screen.getByRole('checkbox', { name: /Pagado desde caja/ }))
    fillRequired()
    fireEvent.click(screen.getByRole('button', { name: /Registrar gasto/ }))

    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(sentForm()).toMatchObject({ branch_id: '2', cash_register_id: '5', paid_from_register: 'true' })
  })

  it('shows the error of the backend', async () => {
    api.post.mockRejectedValue({ response: { data: { message: 'La categoría de gasto no existe o está inactiva' } } })
    renderForm()
    fillRequired()
    change(/Método de pago/, '10')

    fireEvent.click(screen.getByRole('button', { name: /Registrar gasto/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('La categoría de gasto no existe o está inactiva')
  })
})
