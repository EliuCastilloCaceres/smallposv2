// src/components/App.test.jsx
// El menú muestra Reportes con cualquier permiso de reportes (spec 04, T4),
// Gastos solo con expenses.read (spec 12, T3) y Compras solo con
// purchases.read (spec 14, T2).
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

let permissions = []

vi.mock('../context/UserContext', () => ({
  useUser: () => ({
    user: { username: 'tester', role_name: 'supervisor', branch_id: 1 },
    isLoading: false,
    logout: vi.fn(),
    isCentralAdmin: false,
    hasPermission: (module, action) => permissions.includes(`${module}.${action}`),
  }),
}))
vi.mock('../context/BranchContext', () => ({ useBranch: () => ({ selectedBranch: { name: 'Sucursal Central' } }) }))

const renderMenu = () => render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>)

const reportLinks = () => screen.queryAllByRole('link', { name: /Reportes/ })
const expenseLinks = () => screen.queryAllByRole('link', { name: /Gastos/ })
const purchaseLinks = () => screen.queryAllByRole('link', { name: /Compras/ })

describe('App menu', () => {
  beforeEach(() => { permissions = ['dashboard.read'] })

  it('shows Reportes to a user with only reports.profit', () => {
    permissions.push('reports.profit')

    renderMenu()

    expect(reportLinks().length).toBeGreaterThan(0)
    expect(reportLinks()[0]).toHaveAttribute('href', '/reports')
  })

  it('shows Reportes to a user with only reports.basic', () => {
    permissions.push('reports.basic')

    renderMenu()

    expect(reportLinks().length).toBeGreaterThan(0)
  })

  it('shows Reportes to a user with only reports.trend', () => {
    permissions.push('reports.trend')

    renderMenu()

    expect(reportLinks().length).toBeGreaterThan(0)
  })

  it('shows Reportes to a user with only reports.inventory', () => {
    permissions.push('reports.inventory')

    renderMenu()

    expect(reportLinks().length).toBeGreaterThan(0)
  })

  it('shows Reportes to a user with only reports.rotation', () => {
    permissions.push('reports.rotation')

    renderMenu()

    expect(reportLinks().length).toBeGreaterThan(0)
  })

  it('shows Reportes to a user with only reports.expenses', () => {
    permissions.push('reports.expenses')

    renderMenu()

    expect(reportLinks().length).toBeGreaterThan(0)
  })

  it('hides Reportes from a user without report permissions', () => {
    renderMenu()

    expect(reportLinks()).toEqual([])
    expect(screen.getAllByRole('link', { name: /Dashboard/ }).length).toBeGreaterThan(0)
  })

  it('shows Gastos to a user with expenses.read', () => {
    permissions.push('expenses.read')

    renderMenu()

    expect(expenseLinks().length).toBeGreaterThan(0)
    expect(expenseLinks()[0]).toHaveAttribute('href', '/expenses')
  })

  it('hides Gastos from a user who can only register expenses, like a cashier', () => {
    permissions.push('expenses.create')

    renderMenu()

    expect(expenseLinks()).toEqual([])
  })

  it('shows Compras to a user with purchases.read', () => {
    permissions.push('purchases.read')

    renderMenu()

    expect(purchaseLinks().length).toBeGreaterThan(0)
    expect(purchaseLinks()[0]).toHaveAttribute('href', '/purchases')
  })

  it('hides Compras from a user who can only register purchases, like a cashier', () => {
    permissions.push('purchases.create')

    renderMenu()

    expect(purchaseLinks()).toEqual([])
  })
})
