// src/components/App.test.jsx
// El menú muestra Reportes con cualquier permiso de reportes (spec 04, T4).
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

  it('hides Reportes from a user without report permissions', () => {
    renderMenu()

    expect(reportLinks()).toEqual([])
    expect(screen.getAllByRole('link', { name: /Dashboard/ }).length).toBeGreaterThan(0)
  })
})
