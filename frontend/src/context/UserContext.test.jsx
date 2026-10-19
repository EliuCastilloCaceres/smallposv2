// src/context/UserContext.test.jsx
import { StrictMode } from 'react'
import axios from 'axios'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import api from '../services/api'
import { UserContextProvider, useUser } from './UserContext'

// axios lo usa services/session.js (refresh); api.js se reemplaza entero
// para no cargar sus interceptores.
vi.mock('axios', () => ({ default: { post: vi.fn() } }))
vi.mock('../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }))

const Probe = () => {
  const { user, isLoading } = useUser()
  if (isLoading) return <p>loading</p>
  return <p>{user ? `user:${user.username}` : 'no-user'}</p>
}

// Como en main.jsx: con StrictMode, React corre dos veces los efectos al
// montar en desarrollo, que es lo que provocaba el doble refresh.
const renderApp = () => render(
  <StrictMode>
    <UserContextProvider>
      <Probe />
    </UserContextProvider>
  </StrictMode>
)

describe('UserContextProvider session check', () => {
  beforeEach(() => {
    axios.post.mockReset()
    api.get.mockReset()
    sessionStorage.clear()
  })

  it('sends a single refresh under StrictMode and loads the user', async () => {
    axios.post.mockResolvedValue({ data: { accessToken: 'token-1' } })
    api.get.mockResolvedValue({ data: { data: { username: 'superadmin' } } })

    renderApp()

    expect(await screen.findByText('user:superadmin')).toBeInTheDocument()
    expect(axios.post).toHaveBeenCalledOnce()
    expect(axios.post).toHaveBeenCalledWith('/api/auth/refresh', {}, { withCredentials: true })
    expect(api.get).toHaveBeenCalledWith('auth/me')
    expect(sessionStorage.getItem('accessToken')).toBe('token-1')
  })

  it('leaves no user when the refresh fails', async () => {
    sessionStorage.setItem('accessToken', 'stale-token')
    axios.post.mockRejectedValue(new Error('401'))

    renderApp()

    expect(await screen.findByText('no-user')).toBeInTheDocument()
    expect(axios.post).toHaveBeenCalledOnce()
    expect(api.get).not.toHaveBeenCalled()
    expect(sessionStorage.getItem('accessToken')).toBeNull()
  })

  it('leaves no user when loading the profile fails', async () => {
    axios.post.mockResolvedValue({ data: { accessToken: 'token-1' } })
    api.get.mockRejectedValue(new Error('500'))

    renderApp()

    expect(await screen.findByText('no-user')).toBeInTheDocument()
    expect(sessionStorage.getItem('accessToken')).toBeNull()
  })
})
