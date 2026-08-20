// src/Context/PosContext.jsx
// Estado global del POS:
//  · Sucursal activa (vía BranchContext) y sesión de caja (abrir/cerrar)
//  · Catálogo de apoyo: métodos de pago, categorías visibles en esta sucursal
//  · Carritos suspendidos (hasta 4 simultáneos + 1 activo)
//  · Carrito activo con sus productos, descuento, cliente, nota
//
// [NUEVO] Persistencia del carrito activo + suspendidos en localStorage.
// Antes vivían solo en memoria del reducer: si la ruta /pos se desmontaba
// (ej. "Salir temporalmente" del UserMenu, que navega a /dashboard), el
// carrito se perdía. Ahora se guarda por sucursal y se restaura al volver,
// igual que ya se hacía con la sesión de caja.

import { createContext, useCallback, useContext, useEffect, useReducer, useRef, useState } from 'react'
import { useBranch } from './BranchContext'
import { useUser } from './UserContext'
import api from '../services/api'

// ─── Estado inicial de un carrito ─────────────────────────────────────────────
const newCart = (id) => ({
  id,
  label:      `Carrito ${id}`,
  items:      [],       // [{ product_id, variant_id, name, sku, image, unit_price, purchase_price, quantity, subtotal, stock }]
  customerId: 1,        // cliente genérico por defecto
  discount:   { type: '$', amount: 0, applied: 0 },
  note:       '',
  createdAt:  Date.now(),
})

// ─── Reducer del carrito activo ───────────────────────────────────────────────
const cartReducer = (state, action) => {
  switch (action.type) {

    case 'ADD_ITEM': {
      const { item } = action
      const key = item.variant_id ?? item.product_id
      const existingIdx = state.items.findIndex(
        i => (i.variant_id ?? i.product_id) === key
      )
      if (existingIdx >= 0) {
        // Ya existe — incrementar si hay stock
        const existing = state.items[existingIdx]
        if (existing.quantity >= item.stock) return state // no incrementar
        const updated = {
          ...existing,
          quantity: existing.quantity + 1,
          subtotal: existing.unit_price * (existing.quantity + 1),
        }
        const items = [...state.items]
        items[existingIdx] = updated
        return { ...state, items }
      }
      // Producto nuevo
      const newItem = { ...item, quantity: 1, subtotal: item.unit_price }
      return { ...state, items: [...state.items, newItem] }
    }

    case 'REMOVE_ITEM': {
      const key = action.variantId ?? action.productId
      return {
        ...state,
        items: state.items.filter(i => (i.variant_id ?? i.product_id) !== key),
      }
    }

    case 'UPDATE_QTY': {
      const key = action.variantId ?? action.productId
      const items = state.items.map(i => {
        if ((i.variant_id ?? i.product_id) !== key) return i
        // [FIX] Mínimo relajado a 0.001 (en vez de 1) para soportar productos
        // que se venden por kilo/litro/metro con cantidades decimales.
        const qty = Math.max(0.001, Math.min(action.qty, i.stock))
        return { ...i, quantity: qty, subtotal: i.unit_price * qty }
      })
      return { ...state, items }
    }

    case 'UPDATE_PRICE': {
      const key = action.variantId ?? action.productId
      const items = state.items.map(i => {
        if ((i.variant_id ?? i.product_id) !== key) return i
        return { ...i, unit_price: action.price, subtotal: action.price * i.quantity }
      })
      return { ...state, items }
    }

    case 'SET_DISCOUNT':
      return { ...state, discount: action.discount }

    case 'REMOVE_DISCOUNT':
      return { ...state, discount: { type: '$', amount: 0, applied: 0 } }

    case 'SET_NOTE':
      return { ...state, note: action.note }

    case 'SET_CUSTOMER':
      return { ...state, customerId: action.customerId }

    case 'CLEAR':
      return { ...state, items: [], discount: { type: '$', amount: 0, applied: 0 }, note: '', customerId: 1 }

    case 'LOAD':
      return { ...action.cart }

    default:
      return state
  }
}

// ─── Persistencia local de la sesión de caja (sobrevive a un refresh) ────────
const REGISTER_STORAGE_KEY = 'pos_register_session'

const readStoredSession = (branchId) => {
  try {
    const raw = localStorage.getItem(REGISTER_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed?.branchId === branchId ? parsed : null
  } catch {
    return null
  }
}

const writeStoredSession = (data) => {
  try { localStorage.setItem(REGISTER_STORAGE_KEY, JSON.stringify(data)) } catch { /* noop */ }
}

const clearStoredSession = () => {
  try { localStorage.removeItem(REGISTER_STORAGE_KEY) } catch { /* noop */ }
}

// ─── [NUEVO] Persistencia del carrito activo + suspendidos ───────────────────
// Se guarda por sucursal — si cambias de sucursal no se restaura (sus items
// apuntarían a stock de otro lugar).
const CART_STORAGE_KEY = 'pos_cart_session'

const readStoredCartState = (branchId) => {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed?.branchId === branchId ? parsed : null
  } catch {
    return null
  }
}

const writeStoredCartState = (data) => {
  try { localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(data)) } catch { /* noop */ }
}

const clearStoredCartState = () => {
  try { localStorage.removeItem(CART_STORAGE_KEY) } catch { /* noop */ }
}

// ─── Contexto ─────────────────────────────────────────────────────────────────
const PosContext = createContext()

export const PosContextProvider = ({ children }) => {
  const { selectedBranch } = useBranch()
  const branchId = selectedBranch?.branch_id ?? null
  const { user } = useUser()

  // [NUEVO] Hidratar carrito activo + suspendidos desde localStorage al montar
  // (mismo branchId). Si no hay nada guardado, arranca vacío como antes.
  const initialStored = readStoredCartState(branchId)

  // Carts suspendidos: array de snapshots completos del carrito
  const [suspendedCarts,  setSuspendedCarts]  = useState(initialStored?.suspendedCarts ?? [])

  const [cart, dispatch] = useReducer(cartReducer, initialStored?.cart ?? newCart(1))

  // ─── Caja / sesión ──────────────────────────────────────────────────────────
  const [registers,        setRegisters]        = useState([])
  const [registersLoading, setRegistersLoading] = useState(false)
  const [activeRegisterId, setActiveRegisterId] = useState(null)
  const [sessionId,        setSessionId]        = useState(null)
  const [registerError,    setRegisterError]    = useState(null)

  // ─── Catálogo de apoyo ───────────────────────────────────────────────────────
  const [paymentMethods,     setPaymentMethods]     = useState([])
  const [visibleCategories,  setVisibleCategories]  = useState([])

  const prevBranchId = useRef(branchId)

  // ─── Totales derivados ─────────────────────────────────────────────────────
  const subtotal = cart.items.reduce((s, i) => s + i.subtotal, 0)
  const total    = Math.max(0, subtotal - cart.discount.applied)

  // ─── [NUEVO] Persistir carrito activo + suspendidos en cada cambio ─────────
  useEffect(() => {
    if (!branchId) return
    writeStoredCartState({ branchId, cart, suspendedCarts })
  }, [branchId, cart, suspendedCarts])

  // ─── Métodos de pago (catálogo global, se carga una sola vez) ──────────────
  useEffect(() => {
    api.get('payment-methods?is_active=true')
      .then(({ data }) => setPaymentMethods(data.data ?? []))
      .catch(() => {})
  }, [])

  // ─── Categorías visibles en esta sucursal ──────────────────────────────────
  useEffect(() => {
    if (!branchId) { setVisibleCategories([]); return }
    api.get(`categories/branch/${branchId}/visible`)
      .then(({ data }) => setVisibleCategories(data.data ?? []))
      .catch(() => setVisibleCategories([]))
  }, [branchId])

  // ─── Cajas de la sucursal + intentar reanudar sesión abierta ───────────────
  const fetchRegisters = useCallback(async () => {
    if (!branchId) return
    setRegistersLoading(true)
    try {
      const { data } = await api.get(`cash-registers?branch_id=${branchId}`)
      const list = data.data ?? []
      setRegisters(list)

      // Reanudar sesión si el registro sigue abierto con el mismo session_id
      // que quedó guardado localmente Y esa sesión fue abierta por el
      // usuario que está logueado ahora mismo.
      // [FIX] El chequeo de session_id por sí solo NO bastaba: si un
      // usuario A abre caja y sale sin hacer corte ni logout limpio, y
      // luego un usuario B inicia sesión en el mismo navegador, el
      // localStorage seguía teniendo ese registerId/sessionId y este
      // código lo adoptaba para B sin validar que fuera suyo — B terminaba
      // directo en la pantalla de venta de la caja de A. Ahora se exige
      // además que `opened_by_user_id` coincida con el usuario actual.
      const stored = readStoredSession(branchId)
      if (stored) {
        const match = list.find(r =>
          r.cash_register_id === stored.registerId &&
          r.is_open &&
          r.session_id === stored.sessionId &&
          r.opened_by_user_id === user?.user_id
        )
        if (match) {
          setActiveRegisterId(match.cash_register_id)
          setSessionId(match.session_id)
        } else {
          clearStoredSession()
          setActiveRegisterId(null)
          setSessionId(null)
        }
      }
      return list
    } catch (err) {
      setRegisterError(err.response?.data?.message ?? 'Error al cargar las cajas')
      return []
    } finally {
      setRegistersLoading(false)
    }
  }, [branchId, user?.user_id])

  useEffect(() => {
    // Al cambiar de sucursal: recargar cajas y, si no es la primera carga,
    // limpiar carrito activo/suspendidos — sus items apuntan a stock de la
    // sucursal anterior y ya no son válidos.
    if (prevBranchId.current !== branchId && prevBranchId.current !== undefined) {
      dispatch({ type: 'CLEAR' })
      setSuspendedCarts([])
      setActiveRegisterId(null)
      setSessionId(null)
      clearStoredCartState()  // [NUEVO]
    }
    prevBranchId.current = branchId
    fetchRegisters()
  }, [branchId, fetchRegisters])

  const activeRegister = registers.find(r => r.cash_register_id === activeRegisterId) ?? null
  const isRegisterOpen = !!activeRegisterId && !!sessionId

  const openRegister = useCallback(async (registerId, openAmount) => {
    setRegisterError(null)
    try {
      const { data } = await api.patch(`cash-registers/${registerId}/open?branch_id=${branchId}`, { openAmount })
      setActiveRegisterId(registerId)
      setSessionId(data.data.sessionId)
      writeStoredSession({ branchId, registerId, sessionId: data.data.sessionId })
      await fetchRegisters()
      return true
    } catch (err) {
      setRegisterError(err.response?.data?.message ?? 'Error al abrir la caja')
      return false
    }
  }, [branchId, fetchRegisters])

  // [NUEVO] Unirse a una caja que YA está abierta con una sesión activa —
  // caso típico: el mismo usuario entra desde otro dispositivo (PC y luego
  // celular). No llama a /open (esa caja ya está abierta), solo adopta
  // localmente ese registerId/sessionId, igual que hace fetchRegisters al
  // reanudar desde localStorage — la diferencia es que aquí no depende de
  // que este dispositivo ya tuviera esa sesión guardada.
  const joinRegister = useCallback((registerId, sessionId) => {
    setActiveRegisterId(registerId)
    setSessionId(sessionId)
    writeStoredSession({ branchId, registerId, sessionId })
  }, [branchId])

  const closeRegister = useCallback(async (cashCounted, withdrawAmt = 0) => {
    if (!activeRegisterId) return null
    setRegisterError(null)
    try {
      const { data } = await api.patch(`cash-registers/${activeRegisterId}/close?branch_id=${branchId}`, { cashCounted, withdrawAmt })
      clearStoredSession()
      setActiveRegisterId(null)
      setSessionId(null)
      dispatch({ type: 'CLEAR' })
      setSuspendedCarts([])
      clearStoredCartState()  // [NUEVO]
      await fetchRegisters()
      return data.data // { openAmount, expectedClose, cashCounted, withdrawAmt, closeAmount, difference }
    } catch (err) {
      setRegisterError(err.response?.data?.message ?? 'Error al cerrar la caja')
      return null
    }
  }, [activeRegisterId, branchId, fetchRegisters])   // [FIX] Agregado branchId al dependency array

  // [FIX] Agregado branchId al dependency array + try/catch para manejar errores
  const fetchRegisterStatus = useCallback(async () => {
    if (!activeRegisterId) return null
    try {
      const { data } = await api.get(`cash-registers/${activeRegisterId}/status?branch_id=${branchId}`)
      return data.data // { session, movements, summary }
    } catch (err) {
      setRegisterError(err.response?.data?.message ?? 'Error al obtener estado de la caja')
      return null
    }
  }, [activeRegisterId, branchId])

  // [FIX] Agregado branchId al dependency array
  const createCashMovement = useCallback(async ({ movementType, amount, description }) => {
    if (!activeRegisterId) throw new Error('No hay una caja abierta')
    const { data } = await api.post(`cash-registers/${activeRegisterId}/movements?branch_id=${branchId}`, {
      movementType, amount, description,
    })
    return data.data
  }, [activeRegisterId, branchId])

  // ─── Acciones del carrito activo ──────────────────────────────────────────
  const addItem = useCallback((item) => {
    dispatch({ type: 'ADD_ITEM', item })
  }, [])

  const removeItem    = (productId, variantId) => dispatch({ type: 'REMOVE_ITEM', productId, variantId })
  const updateQty     = (productId, variantId, qty) => dispatch({ type: 'UPDATE_QTY', productId, variantId, qty })
  const updatePrice   = (productId, variantId, price) => dispatch({ type: 'UPDATE_PRICE', productId, variantId, price })
  const setDiscount   = (discount) => dispatch({ type: 'SET_DISCOUNT', discount })
  const removeDiscount = () => dispatch({ type: 'REMOVE_DISCOUNT' })
  const setNote       = (note) => dispatch({ type: 'SET_NOTE', note })
  const setCustomer   = (customerId) => dispatch({ type: 'SET_CUSTOMER', customerId })
  const clearCart     = () => dispatch({ type: 'CLEAR' })

  // ─── Suspender carrito activo ─────────────────────────────────────────────
  // [FIX] El carrito que se suspende conserva su propio id/label tal cual.
  // El nuevo carrito activo (vacío) necesita un id NUEVO y único — antes
  // `clearCart()` solo vaciaba items pero dejaba el mismo `id`, lo que
  // provocaba que dos carritos (el suspendido y el nuevo activo) compartieran
  // id y rompieran el orden estable de las pestañas.
  const suspendCart = useCallback((label) => {
    if (cart.items.length === 0) return false
    if (suspendedCarts.length >= 4) return false // máximo 4 suspendidos + 1 activo

    const snapshot = { ...cart, suspendedAt: Date.now() }
    const nextId   = Math.max(cart.id, ...suspendedCarts.map(c => c.id), 0) + 1

    setSuspendedCarts(prev => [...prev, snapshot])
    dispatch({ type: 'LOAD', cart: { ...newCart(nextId), label: label || `Carrito ${nextId}` } })
    return true
  }, [cart, suspendedCarts])

  // ─── Recuperar carrito suspendido ─────────────────────────────────────────
  // [FIX] Antes, si el carrito activo estaba vacío al cambiar de pestaña, el
  // slot se ELIMINABA del arreglo (filter), recorriendo las demás pestañas
  // hacia la izquierda — esto hacía que las pestañas "saltaran" de posición
  // al moverse entre carritos. Ahora SIEMPRE se reemplaza en el mismo índice
  // (incluso si queda un carrito vacío como placeholder), así las pestañas
  // conservan su posición y solo cambia cuál está resaltada como activa.
  const resumeCart = useCallback((index) => {
    const suspended = suspendedCarts[index]
    if (!suspended) return

    const currentSnapshot = { ...cart, suspendedAt: Date.now() }
    setSuspendedCarts(prev => {
      const updated = [...prev]
      updated[index] = currentSnapshot
      return updated
    })

    dispatch({ type: 'LOAD', cart: suspended })
  }, [cart, suspendedCarts])

  // ─── Eliminar carrito suspendido ──────────────────────────────────────────
  const discardSuspended = useCallback((index) => {
    setSuspendedCarts(prev => prev.filter((_, i) => i !== index))
  }, [])

  // ─── Completar venta ────────────────────────────────────────────────────
  // [NUEVO] El carrito recién cobrado NO se deja como pestaña vacía — si hay
  // carritos suspendidos, se promueve a activo el de menor id (el que
  // aparece más a la izquierda en las pestañas). Si al promoverlo (o de
  // entrada) queda un SOLO carrito en total, se renumera a "Carrito 1" —
  // [FIX] antes solo se reiniciaba en el caso de cero suspendidos; si había
  // exactamente uno y se promovía, conservaba el id/label que tenía mientras
  // coexistía con otros (ej. "Carrito 2"), aunque ya fuera el único activo.
  const completeSale = useCallback(() => {
    if (suspendedCarts.length === 0) {
      dispatch({ type: 'LOAD', cart: newCart(1) })
      return
    }
    const [next, ...rest] = [...suspendedCarts].sort((a, b) => a.id - b.id)
    if (rest.length === 0) {
      // Era el único suspendido — al promoverlo se vuelve el único carrito
      // total, así que se renumera igual que en el caso de cero suspendidos.
      setSuspendedCarts([])
      dispatch({ type: 'LOAD', cart: { ...next, id: 1, label: 'Carrito 1' } })
      return
    }
    setSuspendedCarts(rest)
    dispatch({ type: 'LOAD', cart: next })
  }, [suspendedCarts])

  return (
    <PosContext.Provider value={{
      // Sucursal
      branchId,
      // Catálogo de apoyo
      paymentMethods, visibleCategories,
      // Caja / sesión
      registers, registersLoading, activeRegister, activeRegisterId, sessionId,
      isRegisterOpen, registerError,
      fetchRegisters, openRegister, joinRegister, closeRegister, fetchRegisterStatus, createCashMovement,
      // Carrito activo
      cart, subtotal, total,
      addItem, removeItem, updateQty, updatePrice,
      setDiscount, removeDiscount, setNote, setCustomer, clearCart,
      // Carritos suspendidos
      suspendedCarts, suspendCart, resumeCart, discardSuspended, completeSale,
    }}>
      {children}
    </PosContext.Provider>
  )
}

export const usePos = () => useContext(PosContext)
export default PosContext