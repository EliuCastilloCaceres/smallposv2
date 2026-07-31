// src/hooks/useApi.js
// Reemplaza usePetition.js.
// Diferencias clave:
//  · Usa api.js (con interceptor de refresh) en lugar de axios directo
//  · Soporta re-fetch manual con refetch()
//  · Soporta parámetros dinámicos — si cambia el endpoint, re-fetcha
//  · No ejecuta el fetch si el endpoint es null (útil para fetches condicionales)

import { useState, useEffect, useCallback } from 'react'
import api from '../services/api'

const useApi = (endpoint, options = {}) => {
  const { immediate = true, params = null } = options

  const [data,      setData]      = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error,     setError]     = useState(null)

  const fetch = useCallback(async (overrideEndpoint = null) => {
    const url = overrideEndpoint ?? endpoint
    if (!url) return

    setIsLoading(true)
    setError(null)

    try {
      const response = await api.get(url, params ? { params } : undefined)
      setData(response.data.data)
      return response.data.data
    } catch (err) {
      setError(err.response?.data?.message ?? err.message)
      return null
    } finally {
      setIsLoading(false)
    }
  }, [endpoint, params])

  useEffect(() => {
    if (immediate) fetch()
  }, [endpoint]) // re-fetcha si cambia el endpoint

  return { data, isLoading, error, refetch: fetch, setData }
}

export default useApi
