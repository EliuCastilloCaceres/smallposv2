// src/components/Reports/Reports.test.jsx
// Acceso al módulo de Reportes según los permisos de reportes (spec 04, T4).
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Reports from './Reports'

let permissions = []

vi.mock('../../context/UserContext', () => ({
  useUser: () => ({ hasPermission: (module, action) => permissions.includes(`${module}.${action}`) }),
}))
// El contenido de cada pestaña se prueba aparte
vi.mock('./tabs/CashSessionsTab', () => ({ default: () => <p>contenido sesiones</p> }))
vi.mock('./tabs/ProfitTab',       () => ({ default: () => <p>contenido utilidad</p> }))
vi.mock('./tabs/TrendTab',        () => ({ default: () => <p>contenido tendencia</p> }))
vi.mock('./tabs/InventoryTab',    () => ({ default: () => <p>contenido inventario</p> }))
vi.mock('./tabs/RotationTab',     () => ({ default: () => <p>contenido rotación</p> }))

const renderReports = () => render(
  <MemoryRouter initialEntries={['/reports']}>
    <Routes>
      <Route path="/" element={<p>inicio</p>} />
      <Route path="/reports" element={<Reports />} />
    </Routes>
  </MemoryRouter>
)

const tabNames = () => screen.queryAllByRole('tab').map(tab => tab.textContent)

describe('Reports module access', () => {
  beforeEach(() => { permissions = [] })

  it('sends a user without report permissions to the home page', () => {
    permissions = ['dashboard.read', 'inventory.read']

    renderReports()

    expect(screen.getByText('inicio')).toBeInTheDocument()
    expect(tabNames()).toEqual([])
  })

  it('shows both tabs with both permissions and opens on cash sessions', () => {
    permissions = ['reports.basic', 'reports.profit']

    renderReports()

    expect(tabNames()).toEqual(['Sesiones de caja', 'Ventas y utilidad'])
    expect(screen.getByText('contenido sesiones')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Ventas y utilidad' }))
    expect(screen.getByText('contenido utilidad')).toBeInTheDocument()
  })

  it('shows only cash sessions with reports.basic', () => {
    permissions = ['reports.basic']

    renderReports()

    expect(tabNames()).toEqual(['Sesiones de caja'])
    expect(screen.getByText('contenido sesiones')).toBeInTheDocument()
  })

  it('opens on the profit tab when it is the only one allowed', () => {
    permissions = ['reports.profit']

    renderReports()

    expect(tabNames()).toEqual(['Ventas y utilidad'])
    expect(screen.getByText('contenido utilidad')).toBeInTheDocument()
  })

  it('shows the three tabs with every report permission, trend last', () => {
    permissions = ['reports.basic', 'reports.profit', 'reports.trend']

    renderReports()

    expect(tabNames()).toEqual(['Sesiones de caja', 'Ventas y utilidad', 'Tendencia de ventas'])
    fireEvent.click(screen.getByRole('tab', { name: 'Tendencia de ventas' }))
    expect(screen.getByText('contenido tendencia')).toBeInTheDocument()
  })

  it('opens on the trend tab when it is the only one allowed', () => {
    permissions = ['reports.trend']

    renderReports()

    expect(tabNames()).toEqual(['Tendencia de ventas'])
    expect(screen.getByText('contenido tendencia')).toBeInTheDocument()
  })

  it('shows the rotation tab last with every report permission', () => {
    permissions = ['reports.basic', 'reports.profit', 'reports.trend', 'reports.inventory', 'reports.rotation']

    renderReports()

    expect(tabNames()).toEqual([
      'Sesiones de caja', 'Ventas y utilidad', 'Tendencia de ventas', 'Valuación de inventario', 'Rotación de inventario',
    ])
    fireEvent.click(screen.getByRole('tab', { name: 'Valuación de inventario' }))
    expect(screen.getByText('contenido inventario')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Rotación de inventario' }))
    expect(screen.getByText('contenido rotación')).toBeInTheDocument()
  })

  it('opens on the inventory tab for a storekeeper with only reports.inventory', () => {
    permissions = ['inventory.read', 'reports.inventory']

    renderReports()

    expect(tabNames()).toEqual(['Valuación de inventario'])
    expect(screen.getByText('contenido inventario')).toBeInTheDocument()
  })

  it('opens on the rotation tab when it is the only one allowed', () => {
    permissions = ['inventory.read', 'reports.rotation']

    renderReports()

    expect(tabNames()).toEqual(['Rotación de inventario'])
    expect(screen.getByText('contenido rotación')).toBeInTheDocument()
  })
})
