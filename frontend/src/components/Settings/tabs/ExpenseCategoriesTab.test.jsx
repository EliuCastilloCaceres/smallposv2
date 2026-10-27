// src/components/Settings/tabs/ExpenseCategoriesTab.test.jsx
// Pestaña de categorías de gasto con la API simulada (spec 12, T4).
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import api from '../../../services/api'
import ExpenseCategoriesTab from './ExpenseCategoriesTab'

vi.mock('../../../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn() },
}))

const RENTA     = { expense_category_id: 1, name: 'Renta', counts_in_net_profit: 1, is_active: 1, expense_count: 3 }
const MERCANCIA = { expense_category_id: 7, name: 'Pago a proveedor (mercancía)', counts_in_net_profit: 0, is_active: 1, expense_count: 1 }
const VIEJA     = { expense_category_id: 9, name: 'Vieja', counts_in_net_profit: 1, is_active: 0, expense_count: 0 }

const card = (name) => screen.getByText(name, { selector: '.set-card__name' }).closest('.set-card')

describe('ExpenseCategoriesTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue({ data: { data: [RENTA, MERCANCIA, VIEJA] } })
  })

  it('lists the categories with their net profit mark and expense count', async () => {
    render(<ExpenseCategoriesTab />)

    expect(await screen.findByText('Renta')).toBeInTheDocument()
    expect(within(card('Renta')).getByText('Cuenta en la utilidad neta')).toBeInTheDocument()
    expect(within(card('Renta')).getByText('3 gastos')).toBeInTheDocument()
    expect(within(card('Pago a proveedor (mercancía)')).getByText('No cuenta en la utilidad neta')).toBeInTheDocument()
    expect(card('Vieja')).toHaveClass('set-card--inactive')
    expect(api.get).toHaveBeenCalledWith('expense-categories')
  })

  it('creates a category that does not count in the net profit', async () => {
    api.post.mockResolvedValue({ data: { data: { expense_category_id: 10, name: 'Fletes', counts_in_net_profit: 0, is_active: 1, expense_count: 0 } } })
    render(<ExpenseCategoriesTab />)

    fireEvent.click(await screen.findByRole('button', { name: /Nueva categoría/ }))
    fireEvent.change(screen.getByLabelText(/Nombre/), { target: { value: ' Fletes ' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /Cuenta en la utilidad neta/ }))
    fireEvent.click(screen.getByRole('button', { name: /Crear categoría/ }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('expense-categories', { name: 'Fletes', counts_in_net_profit: false }))
    expect(await screen.findByText('Fletes')).toBeInTheDocument()
  })

  it('edits the name of a category', async () => {
    api.put.mockResolvedValue({ data: { data: { ...RENTA, name: 'Renta del local' } } })
    render(<ExpenseCategoriesTab />)

    fireEvent.click(await screen.findByRole('button', { name: 'Editar Renta' }))
    fireEvent.change(screen.getByLabelText(/Nombre/), { target: { value: 'Renta del local' } })
    fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/ }))

    await waitFor(() => expect(api.put).toHaveBeenCalledWith('expense-categories/1', { name: 'Renta del local', counts_in_net_profit: true }))
    expect(await screen.findByText('Renta del local')).toBeInTheDocument()
  })

  it('deactivates a category after confirming, and activates one without asking', async () => {
    api.patch
      .mockResolvedValueOnce({ data: { data: { ...RENTA, is_active: 0 } } })
      .mockResolvedValueOnce({ data: { data: { ...VIEJA, is_active: 1 } } })
    render(<ExpenseCategoriesTab />)

    fireEvent.click(await screen.findByRole('button', { name: 'Desactivar Renta' }))
    fireEvent.click(screen.getByRole('button', { name: 'Desactivar' }))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('expense-categories/1/status', { is_active: false }))
    await waitFor(() => expect(card('Renta')).toHaveClass('set-card--inactive'))

    fireEvent.click(screen.getByRole('button', { name: 'Activar Vieja' }))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('expense-categories/9/status', { is_active: true }))
  })

  it('shows the error of a repeated name', async () => {
    api.post.mockRejectedValue({ response: { data: { message: 'Ya existe una categoría de gasto con ese nombre' } } })
    render(<ExpenseCategoriesTab />)

    fireEvent.click(await screen.findByRole('button', { name: /Nueva categoría/ }))
    fireEvent.change(screen.getByLabelText(/Nombre/), { target: { value: 'renta' } })
    fireEvent.click(screen.getByRole('button', { name: /Crear categoría/ }))

    expect(await screen.findByText('Ya existe una categoría de gasto con ese nombre')).toBeInTheDocument()
  })
})
