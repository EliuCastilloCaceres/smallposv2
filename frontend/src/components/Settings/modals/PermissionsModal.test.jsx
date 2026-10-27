// src/components/Settings/modals/PermissionsModal.test.jsx
// Etiquetas del módulo de gastos en la pantalla de permisos (spec 12, T3).
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import PermissionsModal from './PermissionsModal'

vi.mock('../../../services/api', () => ({ default: { put: vi.fn() } }))

const EXPENSES = [
  { permission_id: 101, module: 'expenses', action: 'read',       description: 'Ver gastos' },
  { permission_id: 102, module: 'expenses', action: 'create',     description: 'Registrar gastos' },
  { permission_id: 103, module: 'expenses', action: 'cancel',     description: 'Cancelar gastos' },
  { permission_id: 104, module: 'expenses', action: 'categories', description: 'Administrar las categorías de gasto' },
]

describe('PermissionsModal', () => {
  it('shows the expenses module as "Gastos" and its categories action as "Categorías"', () => {
    render(
      <PermissionsModal
        role={{ role_id: 3, name: 'supervisor', permissions: [] }}
        allPermissions={{ flat: EXPENSES, grouped: { expenses: EXPENSES } }}
        onSaved={vi.fn()}
        onClose={vi.fn()}
      />
    )

    expect(screen.getByText('Gastos')).toBeInTheDocument()
    expect(screen.getByText('Ver')).toBeInTheDocument()
    expect(screen.getByText('Crear')).toBeInTheDocument()
    expect(screen.getByText('Cancelar', { selector: '.set-card__name' })).toBeInTheDocument()
    expect(screen.getByText('Categorías')).toBeInTheDocument()
  })
})
