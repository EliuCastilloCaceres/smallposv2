// src/components/Pos/modals/CashMovementsModal.test.jsx
// Movimientos de caja del POS con la API simulada (spec 12, T2 y T7, y spec
// 14, T3 y T8): las etiquetas, las opciones según los permisos, el retiro
// como withdrawal, y el gasto y la compra pagados desde la caja del POS.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import api from '../../../services/api'
import CashMovementsModal from './CashMovementsModal'

let permissions = []
const createCashMovement = vi.fn()
const fetchRegisterStatus = vi.fn()
const notifyStockChanged = vi.fn()

vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }))
vi.mock('../../../context/UserContext', () => ({
  useUser: () => ({ hasPermission: (module, action) => permissions.includes(`${module}.${action}`) }),
}))
vi.mock('../../../context/PosContext', () => ({
  usePos: () => ({
    activeRegister: { name: 'Caja 1' }, activeRegisterId: 1, branchId: 1,
    fetchRegisterStatus, createCashMovement, notifyStockChanged,
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
    { movement_type: 'purchase',        amount: 25, description: 'Compra #4: Pepsi' },
    { movement_type: 'purchase_refund', amount: 15, description: 'Reingreso de la compra #4' },
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
    expect(within(row('Compra')).getByText(`-${money(25)}`)).toHaveClass('pos-mov--out')
    expect(within(row('Reingreso de compra')).getByText(`+${money(15)}`)).toHaveClass('pos-mov--in')
  })

  it('offers Ingreso, Retiro and Gasto to a user with expenses.create', async () => {
    await openForm()

    expect(typeButtons()).toEqual(['Ingreso', 'Retiro', 'Gasto'])
  })

  it('offers Compra to a user with purchases.create', async () => {
    permissions = ['pos.use', 'expenses.create', 'purchases.create']
    await openForm()

    expect(typeButtons()).toEqual(['Ingreso', 'Retiro', 'Gasto', 'Compra'])
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

  describe('purchase from the POS', () => {
    const PURCHASE_OPTIONS = {
      payment_methods: [{ payment_method_id: 9, code: 'card', name: 'Tarjeta' }, { payment_method_id: 8, code: 'cash', name: 'Efectivo' }],
      providers:       [{ provider_id: 4, name: 'Pepsi' }],
      registers:       [{ cash_register_id: 1, name: 'Caja 1', branch_id: 1 }],
    }
    const SODA = {
      product_id: 20, name: 'Coca-Cola 600 ml', sku: 'COC-600', uom: 'pza', purchase_price: 12.5,
      is_variable: false, stock: 0, variants: [],
    }

    beforeEach(() => {
      permissions = ['pos.use', 'purchases.create']
      api.get.mockImplementation((url) => Promise.resolve({
        data: { data: url === 'purchases/products' ? [SODA] : PURCHASE_OPTIONS },
      }))
      api.post.mockResolvedValue({ data: { data: { purchase_id: 31 } } })
    })

    it('registers a purchase paid from the POS register, shows it in the list and reloads the stock', async () => {
      const afterPurchase = {
        summary: { ...SUMMARY, total_out: 365, expected_close: -245 },
        movements: [...STATUS.movements, { movement_type: 'purchase', amount: 300, description: 'Compra #31: Pepsi' }],
      }
      await openForm()
      fetchRegisterStatus.mockResolvedValue(afterPurchase)

      fireEvent.click(screen.getByRole('button', { name: /Compra/ }))
      const dialog = await screen.findByRole('dialog', { name: 'Nueva compra' })
      expect(api.get).toHaveBeenCalledWith('purchases/options?branch_id=1')
      expect(within(dialog).getByText('Se paga en efectivo desde Caja 1, con fecha de hoy.')).toBeInTheDocument()
      expect(within(dialog).queryByLabelText(/Método de pago/)).not.toBeInTheDocument()

      fireEvent.change(within(dialog).getByLabelText(/Proveedor/), { target: { value: '4' } })
      const search = within(dialog).getByLabelText('Buscar producto')
      fireEvent.change(search, { target: { value: 'COC-600' } })
      fireEvent.keyDown(search, { key: 'Enter' })
      fireEvent.change(await within(dialog).findByLabelText('Cantidad de Coca-Cola 600 ml'), { target: { value: '24' } })
      fireEvent.click(within(dialog).getByRole('button', { name: /Registrar compra/ }))

      await waitFor(() => expect(api.post).toHaveBeenCalled())
      const [url, form] = api.post.mock.calls[0]
      const sent = Object.fromEntries(form.entries())
      expect(url).toBe('purchases')
      expect({ ...sent, items: JSON.parse(sent.items) }).toEqual({
        provider_id: '4', payment_method_id: '8', paid_from_register: 'true', cash_register_id: '1',
        items: [{ product_id: 20, variant_id: null, quantity: 24, unit_cost: 12.5 }],
      })
      expect(await screen.findByText('Compra #31: Pepsi')).toBeInTheDocument()
      expect(notifyStockChanged).toHaveBeenCalledOnce()
      expect(screen.queryByRole('dialog', { name: 'Nueva compra' })).not.toBeInTheDocument()
      expect(createCashMovement).not.toHaveBeenCalled()
    })

    it('closes the purchase form without registering anything', async () => {
      await openForm()
      fireEvent.click(screen.getByRole('button', { name: /Compra/ }))
      const dialog = await screen.findByRole('dialog', { name: 'Nueva compra' })

      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))

      expect(screen.queryByRole('dialog', { name: 'Nueva compra' })).not.toBeInTheDocument()
      expect(api.post).not.toHaveBeenCalled()
      expect(notifyStockChanged).not.toHaveBeenCalled()
    })
  })
})
