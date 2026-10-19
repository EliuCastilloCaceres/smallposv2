// src/services/session.test.js
import axios from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { refreshSession } from './session'

vi.mock('axios', () => ({ default: { post: vi.fn() } }))

// Promesa que el test resuelve o rechaza cuando quiere, para simular un
// refresh que sigue en curso.
const deferred = () => {
  let resolve, reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

describe('refreshSession', () => {
  beforeEach(() => {
    axios.post.mockReset()
    sessionStorage.clear()
  })

  it('posts to the relative refresh route with credentials', async () => {
    axios.post.mockResolvedValue({ data: { accessToken: 'token-1' } })

    await refreshSession()

    expect(axios.post).toHaveBeenCalledWith('/api/auth/refresh', {}, { withCredentials: true })
  })

  it('shares one request between simultaneous calls', async () => {
    const request = deferred()
    axios.post.mockReturnValue(request.promise)

    const first  = refreshSession()
    const second = refreshSession()
    request.resolve({ data: { accessToken: 'token-1' } })

    await expect(first).resolves.toBe('token-1')
    await expect(second).resolves.toBe('token-1')
    expect(axios.post).toHaveBeenCalledOnce()
    expect(sessionStorage.getItem('accessToken')).toBe('token-1')
  })

  it('rejects every simultaneous call with the same error', async () => {
    const request = deferred()
    axios.post.mockReturnValue(request.promise)
    const error = new Error('401')

    const first  = refreshSession()
    const second = refreshSession()
    request.reject(error)

    await expect(first).rejects.toBe(error)
    await expect(second).rejects.toBe(error)
    expect(axios.post).toHaveBeenCalledOnce()
    expect(sessionStorage.getItem('accessToken')).toBeNull()
  })

  it('makes a new request once the previous one has finished', async () => {
    axios.post
      .mockResolvedValueOnce({ data: { accessToken: 'token-1' } })
      .mockResolvedValueOnce({ data: { accessToken: 'token-2' } })

    await expect(refreshSession()).resolves.toBe('token-1')
    await expect(refreshSession()).resolves.toBe('token-2')
    expect(axios.post).toHaveBeenCalledTimes(2)
    expect(sessionStorage.getItem('accessToken')).toBe('token-2')
  })

  it('makes a new request after a failed one', async () => {
    axios.post
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ data: { accessToken: 'token-2' } })

    await expect(refreshSession()).rejects.toThrow('network')
    await expect(refreshSession()).resolves.toBe('token-2')
    expect(axios.post).toHaveBeenCalledTimes(2)
  })
})
