// src/components/Dashboard/Dashboard.test.jsx
// El Dashboard pide sus datos con el rango de los presets compartidos de
// utils/dateRanges.js (spec 04, T5).
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import useApi from '../../hooks/useApi'
import { getPresetRange } from '../../utils/dateRanges'
import Dashboard from './Dashboard'

vi.mock('../../hooks/useApi', () => ({ default: vi.fn() }))
vi.mock('../../services/api', () => ({
  default: { defaults: { baseURL: '/api' }, get: vi.fn(() => new Promise(() => {})) },
}))
vi.mock('../../context/UserContext', () => ({
  useUser: () => ({
    user: { username: 'supervisor', branch_id: 1 },
    isCentralAdmin: false,
    hasPermission: () => true,
  }),
}))

// Último endpoint que el Dashboard le pidió a useApi
const lastEndpoint = () => useApi.mock.calls.at(-1)[0]

const expectedEndpoint = (preset) => {
  const { start, end } = getPresetRange(preset, {})
  return `dashboard?start_date=${start}&end_date=${end}&preset=${preset}`
}

describe('Dashboard date presets', () => {
  beforeEach(() => {
    // jsdom no trae matchMedia; el Dashboard lo usa para detectar móvil
    window.matchMedia = vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    useApi.mockReset()
    useApi.mockReturnValue({ data: null, isLoading: true, error: null, refetch: vi.fn() })
  })

  it('starts on today and asks for the range of each shared preset', () => {
    render(<MemoryRouter><Dashboard /></MemoryRouter>)

    expect(lastEndpoint()).toBe(expectedEndpoint('today'))

    fireEvent.click(screen.getAllByRole('tab', { name: 'Esta semana' })[0])
    expect(lastEndpoint()).toBe(expectedEndpoint('week'))

    fireEvent.click(screen.getAllByRole('tab', { name: 'Este mes' })[0])
    expect(lastEndpoint()).toBe(expectedEndpoint('month'))
  })
})
