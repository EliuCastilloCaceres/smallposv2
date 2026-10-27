// src/components/Expenses/Expenses.test.jsx
// Módulo Gastos con la API simulada (spec 12, T6): filtros y sus parámetros,
// lista y estado cancelado, total de los activos y botones según permisos.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import api from '../../services/api'
import { getPresetRange } from '../../utils/dateRanges'
import Expenses from './Expenses'

let isCentralAdmin = false
let permissions = []

vi.mock('../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }))
vi.mock('../../context/UserContext', () => ({
  useUser: () => ({
    isCentralAdmin,
    hasPermission: (module, action) => permissions.includes(`${module}.${action}`),
  }),
}))

const money = (n) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })

const OPTIONS = {
  categories:      [{ expense_category_id: 1, name: 'Renta' }, { expense_category_id: 2, name: 'Servicios' }],
  payment_methods: [{ payment_method_id: 8, code: 'cash', name: 'Efectivo' }, { payment_method_id: 10, code: 'transfer', name: 'Transferencia Bancaria' }],
  providers:       [{ provider_id: 4, name: 'Pepsi' }],
  registers:       [{ cash_register_id: 1, name: 'Caja 1', branch_id: 1, branch_name: 'Sucursal Central' }],
  branches:        [{ branch_id: 1, name: 'Sucursal Central' }, { branch_id: 2, name: 'Sucursal Norte' }],
}

const LIST = {
  data: [
    { expense_id: 3, expense_date: '2026-10-20', category_name: 'Servicios', description: 'Garrafones', folio: 'T-99',
      provider_name: 'Pepsi', payment_method_name: 'Efectivo', paid_from_register: true, amount: 150,
      branch_id: 1, branch_name: 'Sucursal Central', has_receipt: true, status: 'active' },
    { expense_id: 2, expense_date: '2026-10-05', category_name: 'Servicios', description: 'Luz duplicada', folio: null,
      provider_name: null, payment_method_name: 'Transferencia Bancaria', paid_from_register: false, amount: 300,
      branch_id: 1, branch_name: 'Sucursal Central', has_receipt: false, status: 'cancelled' },
  ],
  pagination: { page: 1, limit: 20, total: 2, totalPages: 1 },
  summary:    { count: 3, total_amount: 8150 },
}

const mockApi = (list = LIST) => {
  api.get.mockImplementation((url) => {
    if (url === 'expenses/options') return Promise.resolve({ data: { data: OPTIONS } })
    return Promise.resolve({ data: list })
  })
}

// Parámetros de la última llamada a la lista
const lastParams = () => {
  const url = api.get.mock.calls.map(([u]) => u).filter(u => u.startsWith('expenses?')).at(-1)
  return new URLSearchParams(url.split('?')[1])
}

const renderPage = async () => {
  render(<Expenses />)
  await screen.findByRole('table')
}

describe('Expenses', () => {
  beforeEach(() => {
    isCentralAdmin = false
    permissions = ['expenses.read', 'expenses.create', 'expenses.cancel']
    api.get.mockReset()
    mockApi()
  })

  it('starts on the current month, with the active expenses, 20 per page', async () => {
    await renderPage()
    const { start, end } = getPresetRange('month', {})
    const params = lastParams()

    expect(screen.getByRole('tab', { name: 'Este mes' })).toHaveAttribute('aria-selected', 'true')
    expect(params.get('start_date')).toBe(start)
    expect(params.get('end_date')).toBe(end)
    expect(params.get('status')).toBe('active')
    expect(params.get('page')).toBe('1')
    expect(params.get('limit')).toBe('20')
    expect(params.has('branch_id')).toBe(false)
  })

  it('sends the period, category, method, provider and status filters', async () => {
    await renderPage()

    fireEvent.click(screen.getByRole('tab', { name: 'Hoy' }))
    fireEvent.change(screen.getByLabelText('Categoría'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Método de pago'), { target: { value: '8' } })
    fireEvent.change(screen.getByLabelText('Proveedor'), { target: { value: '4' } })
    fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'all' } })

    await waitFor(() => expect(lastParams().get('status')).toBe('all'))
    const params = lastParams()
    const { start, end } = getPresetRange('today', {})
    expect(params.get('start_date')).toBe(start)
    expect(params.get('end_date')).toBe(end)
    expect(params.get('category_id')).toBe('2')
    expect(params.get('payment_method_id')).toBe('8')
    expect(params.get('provider_id')).toBe('4')
  })

  it('searches by description or folio after the user stops typing', async () => {
    await renderPage()

    fireEvent.change(screen.getByLabelText('Buscar por descripción o folio'), { target: { value: ' luz ' } })

    await waitFor(() => expect(lastParams().get('search')).toBe('luz'))
  })

  it('shows the list with the cancelled expenses struck through and the total of the active ones', async () => {
    await renderPage()
    const table = screen.getByRole('table')

    const cancelled = within(table).getByText('Luz duplicada').closest('tr')
    expect(cancelled).toHaveClass('exp-row--cancelled')
    expect(within(cancelled).getByText('Cancelado')).toBeInTheDocument()

    const active = within(table).getByText('Garrafones').closest('tr')
    expect(active).not.toHaveClass('exp-row--cancelled')
    expect(within(active).getByText('Folio T-99')).toBeInTheDocument()
    expect(within(active).getByText('Desde caja')).toBeInTheDocument()
    expect(within(active).getByLabelText('Con comprobante')).toBeInTheDocument()

    expect(screen.getByText(money(8150))).toBeInTheDocument()
    expect(screen.getByText('3 gastos activos')).toBeInTheDocument()
  })

  it('shows the branch filter and column only to the central admin, in the consolidated view', async () => {
    await renderPage()
    expect(screen.queryByLabelText('Sucursal')).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Sucursal' })).not.toBeInTheDocument()
  })

  it('lets the central admin filter by branch', async () => {
    isCentralAdmin = true
    await renderPage()
    expect(screen.getByRole('columnheader', { name: 'Sucursal' })).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Sucursal'), { target: { value: '2' } })

    await waitFor(() => expect(lastParams().get('branch_id')).toBe('2'))
    expect(screen.queryByRole('columnheader', { name: 'Sucursal' })).not.toBeInTheDocument()
  })

  it('shows "Nuevo gasto" only with expenses.create', async () => {
    await renderPage()
    expect(screen.getByRole('button', { name: /Nuevo gasto/ })).toBeInTheDocument()
  })

  it('hides "Nuevo gasto" without expenses.create', async () => {
    permissions = ['expenses.read']
    await renderPage()
    expect(screen.queryByRole('button', { name: /Nuevo gasto/ })).not.toBeInTheDocument()
  })

  it('goes to the next page', async () => {
    api.get.mockReset()
    mockApi({ ...LIST, pagination: { page: 1, limit: 20, total: 25, totalPages: 2 } })
    await renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Página siguiente' }))

    await waitFor(() => expect(lastParams().get('page')).toBe('2'))
  })

  it('opens the detail of an expense', async () => {
    api.get.mockImplementation((url) => {
      if (url === 'expenses/options') return Promise.resolve({ data: { data: OPTIONS } })
      if (url === 'expenses/3') return Promise.resolve({ data: { data: { ...LIST.data[0], created_by_name: 'Ana', cash_movement: null } } })
      return Promise.resolve({ data: LIST })
    })
    await renderPage()

    fireEvent.click(within(screen.getByRole('table')).getByText('Garrafones'))

    expect(await screen.findByRole('dialog', { name: 'Gasto #3' })).toBeInTheDocument()
  })
})
