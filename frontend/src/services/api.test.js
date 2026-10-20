// src/services/api.test.js
import axios, { AxiosError } from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import api from './api'
import { refreshSession } from './session'

// Promesa que el test resuelve o rechaza cuando quiere, para simular un
// refresh que sigue en curso.
const deferred = () => {
  let resolve, reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

// Deja correr las promesas pendientes (interceptores, adapter) antes de
// seguir con el test.
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

const unauthorized = (config, code = 'UNAUTHORIZED') => Promise.reject(
  new AxiosError('Request failed with status code 401', AxiosError.ERR_BAD_REQUEST, config, null, {
    status: 401, statusText: 'Unauthorized', headers: {}, config, data: { code },
  })
)

const ok = (config) => Promise.resolve({
  status: 200, statusText: 'OK', headers: {}, config, data: { url: config.url },
})

// Simula al servidor: responde 200 solo si el request trae el token vigente.
// api.js se usa tal cual, con sus interceptores; solo se reemplaza el adapter
// que hace la petición HTTP. El refresh (services/session.js) usa axios.post
// directo, así que se espía aparte.
// El header se copia al momento de cada llamada: el interceptor reintenta con
// el MISMO objeto config, así que leerlo después mostraría el último valor.
let validToken
let sentAuthHeaders
const adapter = vi.fn((config) => {
  sentAuthHeaders.push(config.headers.Authorization)
  return config.headers.Authorization === `Bearer ${validToken}` ? ok(config) : unauthorized(config)
})

const authHeaders = () => sentAuthHeaders

describe('api response interceptor', () => {
  let logoutListener

  beforeEach(() => {
    api.defaults.adapter = adapter
    adapter.mockClear()
    sentAuthHeaders = []
    validToken = 'token-new'
    sessionStorage.clear()
    sessionStorage.setItem('accessToken', 'token-expired')
    vi.spyOn(axios, 'post')
    logoutListener = vi.fn()
    window.addEventListener('auth:logout', logoutListener)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    window.removeEventListener('auth:logout', logoutListener)
  })

  it('refreshes on 401 and retries the request with the new token', async () => {
    axios.post.mockResolvedValue({ data: { accessToken: 'token-new' } })

    const res = await api.get('products')

    expect(res.data.url).toBe('products')
    expect(axios.post).toHaveBeenCalledOnce()
    expect(axios.post).toHaveBeenCalledWith('/api/auth/refresh', {}, { withCredentials: true })
    expect(authHeaders()).toEqual(['Bearer token-expired', 'Bearer token-new'])
    expect(sessionStorage.getItem('accessToken')).toBe('token-new')
    expect(logoutListener).not.toHaveBeenCalled()
  })

  it('sends a single refresh when two requests get 401 at the same time', async () => {
    const refresh = deferred()
    axios.post.mockReturnValue(refresh.promise)

    const first  = api.get('products')
    const second = api.get('customers')
    await flush()
    refresh.resolve({ data: { accessToken: 'token-new' } })

    await expect(first).resolves.toMatchObject({ data: { url: 'products' } })
    await expect(second).resolves.toMatchObject({ data: { url: 'customers' } })
    expect(axios.post).toHaveBeenCalledOnce()
    expect(authHeaders().filter((h) => h === 'Bearer token-new')).toHaveLength(2)
  })

  it('reuses the session check refresh already in flight', async () => {
    const refresh = deferred()
    axios.post.mockReturnValue(refresh.promise)

    // Lo que hace UserContext al montar, mientras otra pantalla ya pide datos
    const sessionCheck = refreshSession()
    const request      = api.get('products')
    await flush()
    refresh.resolve({ data: { accessToken: 'token-new' } })

    await expect(sessionCheck).resolves.toBe('token-new')
    await expect(request).resolves.toMatchObject({ data: { url: 'products' } })
    expect(axios.post).toHaveBeenCalledOnce()
  })

  it('logs out and rejects the requests when the refresh fails', async () => {
    const refreshError = new Error('refresh 401')
    axios.post.mockRejectedValue(refreshError)

    const first  = api.get('products')
    const second = api.get('customers')

    await expect(first).rejects.toBe(refreshError)
    await expect(second).rejects.toBe(refreshError)
    expect(axios.post).toHaveBeenCalledOnce()
    expect(logoutListener).toHaveBeenCalled()
    expect(sessionStorage.getItem('accessToken')).toBeNull()
  })

  it('does not refresh on a 401 with INVALID_CREDENTIALS', async () => {
    adapter.mockImplementationOnce((config) => unauthorized(config, 'INVALID_CREDENTIALS'))

    await expect(api.post('auth/login', { username: 'x', password: 'y' }))
      .rejects.toMatchObject({ response: { status: 401 } })
    expect(axios.post).not.toHaveBeenCalled()
    expect(logoutListener).not.toHaveBeenCalled()
  })

  it('does not refresh again when the retried request also gets 401', async () => {
    axios.post.mockResolvedValue({ data: { accessToken: 'token-new' } })
    validToken = 'some-other-token'

    await expect(api.get('products')).rejects.toMatchObject({ response: { status: 401 } })
    expect(axios.post).toHaveBeenCalledOnce()
    expect(adapter).toHaveBeenCalledTimes(2)
  })
})
