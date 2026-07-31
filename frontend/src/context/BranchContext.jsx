// src/Context/BranchContext.jsx
import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { useUser } from './UserContext'
import api from '../services/api'

const STORAGE_KEY = 'selectedBranch'

const BranchContext = createContext()

export const BranchContextProvider = ({ children }) => {
  const { user, isAdmin } = useUser()

  // Inicializar desde sessionStorage si ya hay una selección previa
  const [selectedBranch, setSelectedBranch] = useState(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY)
      return stored ? JSON.parse(stored) : null
    } catch {
      return null
    }
  })

  const [branches,   setBranches]   = useState([])
  const [isLoading,  setIsLoading]  = useState(false)
  const [error,      setError]      = useState(null)

  // Si el usuario no es admin, su sucursal ES su branch_id — no necesita elegir
  // La cargamos automáticamente desde el objeto user para tenerla disponible en contexto
  useEffect(() => {
    if (!user) return

    if (!isAdmin) {
      // Usuario normal: su sucursal viene directamente del token
      setSelectedBranch({
        branch_id: user.branch_id,
        name:      user.branch_name ?? `Sucursal #${user.branch_id}`,
      })
      return
    }

    // Admin: cargar listado de sucursales activas para el picker
    setIsLoading(true)
    setError(null)
    api.get('branches?is_active=true&limit=100')
      .then(({ data }) => setBranches(data.data))
      .catch(() => setError('No se pudieron cargar las sucursales'))
      .finally(() => setIsLoading(false))
  }, [user, isAdmin])

  // Limpiar selección al hacer logout
  useEffect(() => {
    if (!user) {
      setSelectedBranch(null)
      setBranches([])
      sessionStorage.removeItem(STORAGE_KEY)
    }
  }, [user])

  const selectBranch = useCallback((branch) => {
    setSelectedBranch(branch)
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(branch))
    } catch { /* ignorar */ }
  }, [])

  const clearBranch = useCallback(() => {
    setSelectedBranch(null)
    sessionStorage.removeItem(STORAGE_KEY)
  }, [])

  return (
    <BranchContext.Provider value={{
      selectedBranch,
      branches,
      isLoading,
      error,
      selectBranch,
      clearBranch,
    }}>
      {children}
    </BranchContext.Provider>
  )
}

export const useBranch = () => useContext(BranchContext)
export default BranchContext
