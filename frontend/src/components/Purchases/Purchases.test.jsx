// src/components/Purchases/Purchases.test.jsx
// Módulo Compras con la API simulada (spec 14, T7): filtros y sus
// parámetros, lista y estado cancelado, total de las activas y botones según
// permisos. También que la lista se vuelve a leer al guardar un comprobante
// desde el detalle (spec 15, T3).
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import api from '../../services/api'
import { getPresetRange } from '../../utils/dateRanges'
import Purchases from './Purchases'

let isCentralAdmin = false
let permissions = []

vi.mock('../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }))
vi.mock('../../context/UserContext', () => ({
  useUser: () => ({
    isCentralAdmin,
    hasPermission: (module, action) => permissions.includes(`${module}.${action}`),
  }),
}))

const money = (n) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })

const OPTIONS = {
  payment_methods: [{ payment_method_id: 8, code: 'cash', name: 'Efectivo' }, { payment_method_id: 10, code: 'transfer', name: 'Transferencia Bancaria' }],
  providers:       [{ provider_id: 4, name: 'Pepsi' }, { provider_id: 5, name: 'Bimbo' }],
  registers:       [{ cash_register_id: 1, name: 'Caja 1', branch_id: 1, branch_name: 'Sucursal Central' }],
  branches:        [{ branch_id: 1, name: 'Sucursal Central' }, { branch_id: 2, name: 'Sucursal Norte' }],
}

const LIST = {
  data: [
    { purchase_id: 3, purchase_date: '2026-10-20', provider_name: 'Pepsi', folio: 'F-100', item_count: 12,
      payment_method_name: 'Efectivo', paid_from_register: true, total: 1850,
      branch_id: 1, branch_name: 'Sucursal Central', has_receipt: true, status: 'active' },
    { purchase_id: 2, purchase_date: '2026-10-05', provider_name: 'Bimbo', folio: null, item_count: 1,
      payment_method_name: 'Transferencia Bancaria', paid_from_register: false, total: 300,
      branch_id: 1, branch_name: 'Sucursal Central', has_receipt: false, status: 'cancelled' },
  ],
  pagination: { page: 1, limit: 20, total: 2, totalPages: 1 },
  summary:    { count: 4, total_amount: 9150 },
}

const mockApi = (list = LIST) => {
  api.get.mockImplementation((url) => {
    if (url === 'purchases/options') return Promise.resolve({ data: { data: OPTIONS } })
    if (url.startsWith('purchases/')) return new Promise(() => {})
    return Promise.resolve({ data: list })
  })
}

// Parámetros de la última llamada a la lista
const lastParams = () => {
  const url = api.get.mock.calls.map(([u]) => u).filter(u => u.startsWith('purchases?')).at(-1)
  return new URLSearchParams(url.split('?')[1])
}

const renderPage = async () => {
  render(<Purchases />)
  await screen.findByRole('table')
}

describe('Purchases', () => {
  beforeEach(() => {
    isCentralAdmin = false
    permissions = ['purchases.read', 'purchases.create', 'purchases.cancel']
    api.get.mockReset()
    mockApi()
  })

  it('starts on the current month, with the active purchases, 20 per page', async () => {
    await renderPage()
    const { start, end } = getPresetRange('month', {})
    const params = lastParams()

    expect(screen.getByRole('tab', { name: 'Este mes' })).toHaveAttribute('aria-selected', 'true')
    expect(params.get('start_date')).toBe(start)
    expect(params.get('end_date')).toBe(end)
    expect(params.get('status')).toBe('active')
    expect(params.get('page')).toBe('1')
    expect(params.get('limit')).toBe('20')
  })

  it('sends the provider, the payment method, the status and the search', async () => {
    await renderPage()
    await waitFor(() => expect(screen.getByRole('option', { name: 'Pepsi' })).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText('Proveedor'), { target: { value: '4' } })
    fireEvent.change(screen.getByLabelText('Método de pago'), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'all' } })
    fireEvent.change(screen.getByLabelText('Buscar por folio, notas o producto'), { target: { value: ' coca ' } })

    await waitFor(() => expect(lastParams().get('search')).toBe('coca'))
    const params = lastParams()
    expect(params.get('provider_id')).toBe('4')
    expect(params.get('payment_method_id')).toBe('10')
    expect(params.get('status')).toBe('all')
    expect(screen.queryByLabelText('Sucursal')).not.toBeInTheDocument()
  })

  it('shows the total of the active purchases and each purchase, with the cancelled one marked', async () => {
    await renderPage()

    expect(screen.getByText(money(9150))).toBeInTheDocument()
    expect(screen.getByText('4 compras activas')).toBeInTheDocument()

    const rows = within(screen.getByRole('table', { name: 'Compras' })).getAllByRole('row').slice(1)
    expect(rows[0]).toHaveTextContent('Pepsi')
    expect(rows[0]).toHaveTextContent('Folio F-100')
    expect(rows[0]).toHaveTextContent('12 productos')
    expect(rows[0]).toHaveTextContent('Desde caja')
    expect(rows[0]).toHaveTextContent(money(1850))
    expect(within(rows[0]).getByLabelText('Con comprobante')).toBeInTheDocument()
    expect(rows[1]).toHaveClass('pur-row--cancelled')
    expect(rows[1]).toHaveTextContent('Cancelada')
    expect(rows[1]).toHaveTextContent('1 producto')
  })

  it('lets the central admin filter by branch, and shows the branch in the consolidated view', async () => {
    isCentralAdmin = true
    await renderPage()

    expect(within(screen.getByRole('table', { name: 'Compras' })).getByRole('columnheader', { name: 'Sucursal' })).toBeInTheDocument()

    await waitFor(() => expect(screen.getByRole('option', { name: 'Sucursal Norte' })).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText('Sucursal'), { target: { value: '2' } })

    await waitFor(() => expect(lastParams().get('branch_id')).toBe('2'))
  })

  it('shows "Nueva compra" only with purchases.create', async () => {
    permissions = ['purchases.read']
    await renderPage()

    expect(screen.queryByRole('button', { name: /Nueva compra/ })).not.toBeInTheDocument()
  })

  it('opens the form and the detail', async () => {
    await renderPage()

    fireEvent.click(screen.getByRole('button', { name: /Nueva compra/ }))
    expect(screen.getByRole('dialog', { name: 'Nueva compra' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))

    fireEvent.click(within(screen.getByRole('table', { name: 'Compras' })).getByText('Pepsi'))
    expect(screen.getByRole('dialog', { name: 'Compra #3' })).toBeInTheDocument()
  })

  it('says when there are no purchases', async () => {
    mockApi({ data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 }, summary: { count: 0, total_amount: 0 } })
    render(<Purchases />)

    expect(await screen.findByText('No hay compras con estos filtros')).toBeInTheDocument()
  })

  it('reloads the list after a receipt is added from the detail', async () => {
    const detail = { ...LIST.data[0], has_receipt: false, created_by_name: 'Ana', cash_movement: null, items: [] }
    api.get.mockImplementation((url) => {
      if (url === 'purchases/options') return Promise.resolve({ data: { data: OPTIONS } })
      if (url === 'purchases/3') return Promise.resolve({ data: { data: detail } })
      return Promise.resolve({ data: LIST })
    })
    api.put.mockResolvedValue({ data: { data: { ...detail, has_receipt: true } } })
    await renderPage()
    const listCalls = () => api.get.mock.calls.filter(([u]) => u.startsWith('purchases?')).length

    fireEvent.click(within(screen.getByRole('table', { name: 'Compras' })).getByText('Pepsi'))
    await screen.findByRole('button', { name: /Agregar comprobante/ })
    const before = listCalls()
    fireEvent.change(screen.getByLabelText('Archivo del comprobante'), {
      target: { files: [new File(['png'], 'ticket.png', { type: 'image/png' })] },
    })

    await waitFor(() => expect(listCalls()).toBe(before + 1))
  })
})
