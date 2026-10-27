// src/components/Settings/Settings.test.jsx
// La pestaña "Categorías de gasto" solo aparece con expenses.categories
// (spec 12, T4). Las pestañas se simulan: aquí solo importa cuáles se ven.
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Settings from './Settings'

let permissions = []

vi.mock('../../context/UserContext', () => ({
  useUser: () => ({
    user: { branch_id: null },
    isAdmin: true,
    isCentralAdmin: true,
    hasPermission: (module, action) => permissions.includes(`${module}.${action}`),
  }),
}))
vi.mock('./tabs/BranchesTab',          () => ({ default: () => <div>Sucursales</div> }))
vi.mock('./tabs/ReceiptTab',           () => ({ default: () => null }))
vi.mock('./tabs/CashTab',              () => ({ default: () => null }))
vi.mock('./tabs/CategoriesTab',        () => ({ default: () => null }))
vi.mock('./tabs/RolesTab',             () => ({ default: () => null }))
vi.mock('./tabs/PaymentMethodsTab',    () => ({ default: () => null }))
vi.mock('./tabs/ExpenseCategoriesTab', () => ({ default: () => null }))

describe('Settings tabs', () => {
  beforeEach(() => { permissions = ['settings.read'] })

  it('shows "Categorías de gasto" to a user with expenses.categories', () => {
    permissions.push('expenses.categories')

    render(<Settings />)

    expect(screen.getByRole('tab', { name: /Categorías de gasto/ })).toBeInTheDocument()
  })

  it('hides "Categorías de gasto" from a user without expenses.categories', () => {
    permissions.push('expenses.read', 'expenses.create', 'expenses.cancel')

    render(<Settings />)

    expect(screen.queryByRole('tab', { name: /Categorías de gasto/ })).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Roles/ })).toBeInTheDocument()
  })
})
