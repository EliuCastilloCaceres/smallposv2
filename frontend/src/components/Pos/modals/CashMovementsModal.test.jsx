// src/components/Pos/modals/CashMovementsModal.test.jsx
// Movimientos de caja del POS con la API simulada (spec 12, T2 y T7): las
// etiquetas, las tres opciones, el retiro como withdrawal y el gasto pagado
// desde la caja del POS.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import api from '../../../services/api'
import CashMovementsModal from './CashMovementsModal'

let permissions = []
const createCashMovement = vi.fn()
const fetchRegisterStatus = vi.fn()

vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }))
vi.mock('../../../context/UserContext', () => ({
  useUser: () => ({ hasPermission: (module, action) => permissions.includes(`${module}.${action}`) }),
}))
vi.mock('../../../context/PosContext', () => ({
  usePos: () => ({
    activeRegister: { name: 'Caja 1' }, activeRegisterId: 1, branchId: 1,
    fetchRegisterStatus, createCashMovement,
  }),
}))

const money = (n) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })

const SUMMARY = { open_amount: 100, total_in: 20, total_out: 65, expected_close: 55 }
const STATUS = {
  summary: SUMMARY,
  movements: [
    { movement_type: 'withdrawal',     amount: 40, description: 'Retiro para depósito' },
    { movement_type: 'expense',        amount: 20, description: 'Gasto #3: Servicios – Luz' },
    { movement_type: 'expense_refund', amount: 20, description: 'Reingreso del gasto #3' },
    { movement_type: 'legacy_expense', amount: 5,  description: 'PAGO DE PEPSI' },
  ],
}

const OPTIONS = {
  categories:      [{ expense_category_id: 2, name: 'Servicios' }, { expense_category_id: 7, name: 'Pago a proveedor (mercancía)' }],
  payment_methods: [{ payment_method_id: 9, code: 'card', name: 'Tarjeta' }, { payment_method_id: 8, code: 'cash', name: 'Efectivo' }],
  providers:       [{ provider_id: 4, name: 'Pepsi' }],
  registers:       [{ cash_register_id: 1, name: 'Caja 1', branch_id: 1 }],
}

const row = (label) => screen.getByText(label, { selector: '.pos-cashmov-row__type' }).closest('.pos-cashmov-row')

const openForm = async () => {
  render(<CashMovementsModal onClose={vi.fn()} />)
  fireEvent.click(await screen.findByRole('button', { name: /Registrar ingreso/ }))
}

const typeButtons = () =>
  within(screen.getByRole('group', { name: 'Tipo de movimiento' })).getAllByRole('button').map(b => b.textContent.trim())

describe('CashMovementsModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    permissions = ['pos.use', 'expenses.create']
    fetchRegisterStatus.mockResolvedValue(STATUS)
    createCashMovement.mockResolvedValue({ cashMovementId: 50 })
    api.get.mockResolvedValue({ data: { data: OPTIONS } })
    api.post.mockResolvedValue({ data: { data: { expense_id: 12 } } })
  })

  it('labels each movement type of the session, with its sign', async () => {
    render(<CashMovementsModal onClose={vi.fn()} />)
    await screen.findByText('Retiro', { selector: '.pos-cashmov-row__type' })

    expect(within(row('Retiro')).getByText(`-${money(40)}`)).toHaveClass('pos-mov--out')
    expect(within(row('Gasto')).getByText(`-${money(20)}`)).toHaveClass('pos-mov--out')
    expect(within(row('Reingreso de gasto')).getByText(`+${money(20)}`)).toHaveClass('pos-mov--in')
    expect(within(row('Salida de caja (histórico)')).getByText(`-${money(5)}`)).toHaveClass('pos-mov--out')
  })

  it('offers Ingreso, Retiro and Gasto to a user with expenses.create', async () => {
    await openForm()

    expect(typeButtons()).toEqual(['Ingreso', 'Retiro', 'Gasto'])
  })

  it('offers only Ingreso and Retiro without expenses.create', async () => {
    permissions = ['pos.use']
    await openForm()

    expect(typeButtons()).toEqual(['Ingreso', 'Retiro'])
  })

  it('registers a withdrawal as a withdrawal', async () => {
    await openForm()

    fireEvent.click(screen.getByRole('button', { name: /Retiro/ }))
    fireEvent.change(screen.getByLabelText('Monto'), { target: { value: '40' } })
    fireEvent.change(screen.getByLabelText(/Descripción/), { target: { value: 'Retiro para depósito' } })
    fireEvent.click(screen.getByRole('button', { name: /Registrar$/ }))

    await waitFor(() => expect(createCashMovement).toHaveBeenCalledWith({
      movementType: 'withdrawal', amount: 40, description: 'Retiro para depósito',
    }))
    expect(api.post).not.toHaveBeenCalled()
  })

  it('registers an expense paid from the POS register and shows it in the list', async () => {
    const afterExpense = {
      summary: { ...SUMMARY, total_out: 215.5, expected_close: -95.5 },
      movements: [...STATUS.movements, { movement_type: 'expense', amount: 150.5, description: 'Gasto #12: Servicios – Garrafones' }],
    }
    await openForm()
    fetchRegisterStatus.mockResolvedValue(afterExpense)

    fireEvent.click(screen.getByRole('button', { name: /Gasto/ }))
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('expenses/options?branch_id=1'))
    fireEvent.change(await screen.findByLabelText('Categoría'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Monto'), { target: { value: '150.5' } })
    fireEvent.change(screen.getByLabelText('Descripción'), { target: { value: ' Garrafones ' } })
    fireEvent.change(screen.getByLabelText(/Proveedor/), { target: { value: '4' } })
    fireEvent.change(screen.getByLabelText(/Folio/), { target: { value: 'T-1' } })
    const photo = new File(['jpg'], 'ticket.jpg', { type: 'image/jpeg' })
    fireEvent.change(screen.getByLabelText(/Comprobante/), { target: { files: [photo] } })
    fireEvent.click(screen.getByRole('button', { name: /Registrar$/ }))

    await waitFor(() => expect(api.post).toHaveBeenCalled())
    const [url, form] = api.post.mock.calls[0]
    expect(url).toBe('expenses')
    expect(Object.fromEntries(form.entries())).toEqual({
      branch_id: '1', expense_category_id: '2', amount: '150.5', description: 'Garrafones',
      payment_method_id: '8', provider_id: '4', folio: 'T-1',
      paid_from_register: 'true', cash_register_id: '1', receipt: expect.any(File),
    })
    expect(createCashMovement).not.toHaveBeenCalled()
    expect(await screen.findByText('Gasto #12: Servicios – Garrafones')).toBeInTheDocument()
  })

  it('asks for the category and the description of an expense before sending it', async () => {
    await openForm()
    fireEvent.click(screen.getByRole('button', { name: /Gasto/ }))
    await screen.findByRole('option', { name: 'Servicios' })
    fireEvent.change(screen.getByLabelText('Monto'), { target: { value: '50' } })

    fireEvent.click(screen.getByRole('button', { name: /Registrar$/ }))
    expect(screen.getByRole('alert')).toHaveTextContent('Elige la categoría del gasto')

    fireEvent.change(screen.getByLabelText('Categoría'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: /Registrar$/ }))
    expect(screen.getByRole('alert')).toHaveTextContent('Escribe la descripción del gasto')
    expect(api.post).not.toHaveBeenCalled()
  })

  it('shows the error of the backend for an expense', async () => {
    api.post.mockRejectedValue({ response: { data: { message: 'La caja no tiene una sesión abierta en esta sucursal' } } })
    await openForm()
    fireEvent.click(screen.getByRole('button', { name: /Gasto/ }))
    fireEvent.change(await screen.findByLabelText('Categoría'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Monto'), { target: { value: '50' } })
    fireEvent.change(screen.getByLabelText('Descripción'), { target: { value: 'Agua' } })

    fireEvent.click(screen.getByRole('button', { name: /Registrar$/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('La caja no tiene una sesión abierta en esta sucursal')
  })
})
