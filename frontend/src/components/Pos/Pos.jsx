// src/components/Pos/Pos.jsx
import { useState, useEffect, useCallback, useRef } from 'react'
import { PosContextProvider, usePos } from '../../Context/PosContext'
import { useUser } from '../../Context/UserContext'
import BranchGate from '../Common/BranchGate'
import ConfirmDialog from '../Common/ConfirmDialog'
import RegisterGate from './RegisterGate'
import UserMenu from './UserMenu'
import CloseRegisterModal    from './modals/CloseRegisterModal'
import CashMovementsModal    from './modals/CashMovementsModal'
import CustomerModal         from './modals/CustomerModal'
import VariantPickerModal    from './modals/VariantPickerModal'
import PaymentModal          from './modals/PaymentModal'
import LayawayModal          from './modals/LayawayModal'
import CreditModal           from './modals/CreditModal'
import OutOfStockModal       from './modals/OutOfStockModal'
import api from '../../services/api'
import './pos.css'

const PAGE_SIZE = 24

const money = (n) => Number(n ?? 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })

// [NUEVO] Input numérico que permite borrarse por completo mientras se
// escribe (a diferencia de un input controlado atado directo al valor, que
// nunca deja quedar vacío). Al perder el foco: si quedó vacío, inválido o
// en 0, aplica `emptyFallback` (por defecto 1, pero el precio pasa el precio
// original del producto en vez de caer a 1) y lo confirma hacia arriba.
// [NUEVO] Enter confirma el valor (igual que el blur) y devuelve el foco al
// buscador vía `onEnterNext`, para no tener que tocar el mouse entre edición
// y edición.
const EditableNumber = ({ value, onCommit, emptyFallback = 1, maxValue, onEnterNext, onClamped, className, onKeyDown, ...rest }) => {
  const [local, setLocal] = useState(String(value))

  useEffect(() => { setLocal(String(value)) }, [value])

  const commit = () => {
    const n = Number(local)
    let final = (local.trim() === '' || isNaN(n) || n <= 0) ? emptyFallback : n
    // [NUEVO] Si hay un tope (stock disponible), lo que se tecleó por
    // encima se recorta directo al máximo — ej. tecleás 5 y solo hay 3,
    // queda en 3 sin depender de que el reducer lo corrija después.
    let wasClamped = false
    if (maxValue != null && final > maxValue) { final = maxValue; wasClamped = true }
    if (final !== value) onCommit(final)
    setLocal(String(final))
    if (wasClamped) onClamped?.()
  }

  const handleKeyDown = (e) => {
    onKeyDown?.(e)
    if (e.key === 'Enter') {
      e.preventDefault()
      e.currentTarget.blur() // dispara handleBlur → confirma el valor
      onEnterNext?.()
    }
  }

  return (
    <input
      {...rest}
      type="number"
      className={className}
      value={local}
      onChange={e => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={handleKeyDown}
    />
  )
}

// ── Combina /inventory/stock (stock + variantes + categoría) con /products
// (precio) para el mismo set de filtros. Ambos paginan sobre `products`
// con el mismo orden y los mismos filtros base, así que se cruzan por id. ──
const fetchMergedCatalog = async ({ branchId, search, categoryId, page = 1, limit = PAGE_SIZE }) => {
  const params = { page, limit, branch_id: branchId }
  if (search)     params.search      = search
  if (categoryId) params.category_id = categoryId

  const [stockRes, priceRes] = await Promise.all([
    api.get('inventory/stock', { params }),
    api.get('products', { params }),
  ])

  const priceMap = new Map((priceRes.data.data ?? []).map(p => [p.product_id, p]))

  const data = (stockRes.data.data ?? []).map(p => {
    const priceInfo = priceMap.get(p.product_id)
    return {
      ...p,
      sale_price:     priceInfo?.sale_price ?? 0,
      purchase_price: priceInfo?.purchase_price ?? 0,
    }
  })

  return { data, pagination: stockRes.data.pagination }
}

const PosInner = () => {
  const { isRegisterOpen, activeRegister } = usePos()
  const [closeModalOpen,     setCloseModalOpen]     = useState(false)
  const [movementsModalOpen, setMovementsModalOpen] = useState(false)

  // [FIX] Un solo return, con CloseRegisterModal siempre en la misma posición
  // del árbol (último hijo de .pos-root). Antes había dos returns distintos
  // según isRegisterOpen, y el modal quedaba en una posición distinta en
  // cada uno (después de header+SaleScreen vs. después de RegisterGate) —
  // React lo interpretaba como un componente diferente y lo desmontaba/
  // remontaba al cerrar la caja, perdiendo la pantalla de resultado y
  // disparando un fetchRegisterStatus() nuevo que ya fallaba (sin caja
  // activa), mostrando el error "No se pudo cargar el estado de la caja"
  // en vez del resumen del corte.
  return (
    <div className="pos-root">
      {!isRegisterOpen ? (
        <RegisterGate />
      ) : (
        <>
          <header className="pos-header">
            <span className="pos-header__register">
              <i className="bi bi-circle-fill" style={{ fontSize: 8, color: 'var(--pos-green)' }} />
              {activeRegister?.name}
            </span>
            <div className="pos-header__actions">
              <UserMenu
                onOpenMovements={() => setMovementsModalOpen(true)}
                onOpenClose={() => setCloseModalOpen(true)}
              />
            </div>
          </header>

          <SaleScreen />
        </>
      )}

      {closeModalOpen && <CloseRegisterModal onClose={() => setCloseModalOpen(false)} />}
      {movementsModalOpen && <CashMovementsModal onClose={() => setMovementsModalOpen(false)} />}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Pantalla de venta: buscador + grid (izq) + carrito (der)
// ═══════════════════════════════════════════════════════════════════════════
const SaleScreen = () => {
  const {
    branchId, cart, subtotal, total, visibleCategories,
    addItem, removeItem, updateQty, updatePrice, setNote, setDiscount, removeDiscount, clearCart,
    suspendedCarts, suspendCart, resumeCart, discardSuspended,
  } = usePos()

  // ── Grid / búsqueda ──
  const [search,     setSearch]     = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [gridItems,  setGridItems]  = useState([])
  const [pagination, setPagination] = useState({ total: 0, page: 1, totalPages: 1 })
  const [gridLoading, setGridLoading] = useState(true)
  const [gridError,   setGridError]   = useState(null)
  const [page,       setPage]       = useState(1)

  // ── Dropdown de resultados del buscador (también sirve como único modo en móvil) ──
  const [dropdownItems, setDropdownItems] = useState([])
  const [showDropdown,  setShowDropdown]  = useState(false)
  const [isSearching,   setIsSearching]   = useState(false)

  const searchRef      = useRef('')
  const catRef         = useRef('')
  const searchTimer    = useRef(null)
  const searchInputRef = useRef(null)

  // [NUEVO] Devuelve el foco al buscador después de agregar un producto —
  // setTimeout(0) para que corra después de que React termine de re-renderizar
  // (importante cuando el add viene de cerrar un modal, ej. VariantPicker u
  // OutOfStockModal).
  const focusSearch = () => setTimeout(() => searchInputRef.current?.focus(), 0)

  // ── Variant picker ──
  const [variantTarget, setVariantTarget] = useState(null) // producto variable elegido

  // ── Producto agotado ──
  const [outOfStockTarget, setOutOfStockTarget] = useState(null) // payload pendiente de agregar

  // ── Modales ──
  const [customerOpen, setCustomerOpen] = useState(false)
  const [paymentOpen,  setPaymentOpen]  = useState(false)
  const [layawayOpen,  setLayawayOpen]  = useState(false)
  const [creditOpen,   setCreditOpen]   = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [confirmDiscardIdx, setConfirmDiscardIdx] = useState(null)

  // ── Nota / descuento inline ──
  const [noteOpen,     setNoteOpen]     = useState(false)
  const [discountOpen, setDiscountOpen] = useState(false)
  const [discountType, setDiscountType] = useState(cart.discount.type)
  const [discountAmt,  setDiscountAmt]  = useState(cart.discount.amount || '')

  // ── Aviso transitorio cuando se intenta subir la cantidad de un item por
  // encima de su stock disponible (botón + o tecleando un valor mayor) ──
  const [qtyWarnKey, setQtyWarnKey] = useState(null)
  const qtyWarnTimer = useRef(null)
  const warnMaxStock = (key) => {
    setQtyWarnKey(key)
    clearTimeout(qtyWarnTimer.current)
    qtyWarnTimer.current = setTimeout(() => setQtyWarnKey(null), 2000)
  }

  const handleDecreaseQty = (item) => {
    // [FIX] Con stock 1 y cantidad 1, restar 1 daba 0, y el reducer lo
    // subía a 0.001 (piso pensado para teclear decimales de productos por
    // kg/l/m, no para el botón de restar) — nunca debe bajar de 1 así.
    updateQty(item.product_id, item.variant_id, Math.max(1, item.quantity - 1))
  }

  const handleIncreaseQty = (item) => {
    const key = item.variant_id ?? item.product_id
    if (item.quantity >= item.stock) {
      warnMaxStock(key)
      return
    }
    updateQty(item.product_id, item.variant_id, item.quantity + 1)
  }

  const fetchGrid = useCallback(async (currentPage = 1) => {
    if (!branchId) return
    setGridLoading(true)
    setGridError(null)
    try {
      const { data, pagination: pg } = await fetchMergedCatalog({
        branchId, search: searchRef.current, categoryId: catRef.current, page: currentPage,
      })
      setGridItems(data)
      setPagination(pg)
    } catch (err) {
      setGridError(err.response?.data?.message ?? 'Error al cargar productos')
    } finally {
      setGridLoading(false)
    }
  }, [branchId])

  useEffect(() => { fetchGrid(page) }, [page, fetchGrid])

  // Aplana un producto crudo a sus opciones seleccionables (una por variante) —
  // mismo patrón que BulkAdjustModal: cada variante es su propia opción, un
  // producto simple es una sola opción. Se usa SIEMPRE que se muestran
  // resultados seleccionables (tipeo y Enter), para nunca poder elegir el
  // producto padre "en crudo" cuando es variable.
  const flatten = (p) => p.is_variable
    ? (p.variants ?? []).map(v => ({ ...p, __variant: v }))
    : [{ ...p, __variant: null }]

  // Guard de secuencia: si el usuario escribe rápido, ignora respuestas de
  // búsquedas viejas que lleguen después de una más reciente.
  const dropdownSeq = useRef(0)

  // ── Dropdown de búsqueda (debounce) — funciona en desktop y móvil ──
  const runDropdownSearch = useCallback(async (q) => {
    if (!q.trim() || !branchId) { setDropdownItems([]); setShowDropdown(false); return }
    const mySeq = ++dropdownSeq.current
    setIsSearching(true)
    try {
      const { data } = await fetchMergedCatalog({ branchId, search: q.trim(), page: 1, limit: 8 })
      if (mySeq !== dropdownSeq.current) return // respuesta obsoleta, ignorar
      // [FIX] Aplanar SIEMPRE — antes se mostraba el producto crudo (con
      // is_variable=true) y al hacer clic se agregaba el padre al carrito
      // en vez de pedir la variante.
      setDropdownItems(data.flatMap(flatten))
      setShowDropdown(true)
    } catch {
      if (mySeq === dropdownSeq.current) setDropdownItems([])
    } finally {
      if (mySeq === dropdownSeq.current) setIsSearching(false)
    }
  }, [branchId])

  const handleSearchChange = (val) => {
    setSearch(val)
    searchRef.current = val
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      runDropdownSearch(val)
      setPage(prev => { if (prev === 1) { fetchGrid(1); return 1 } return 1 })
    }, 350)
  }

  // [FIX] Limpiar la búsqueda (botón X) ahora también resetea el ref y
  // refetchea el grid — antes el grid se quedaba pegado al último término
  // buscado porque searchRef.current nunca se limpiaba.
  const handleClearSearch = () => {
    setSearch('')
    searchRef.current = ''
    setShowDropdown(false)
    setDropdownItems([])
    clearTimeout(searchTimer.current)
    setPage(prev => { if (prev === 1) { fetchGrid(1); return 1 } return 1 })
    focusSearch()
  }

  // Enter en el buscador: comportamiento tipo lector de código de barras —
  // si el texto coincide exacto con un SKU (producto simple o variante), se
  // agrega directo al carrito sin necesidad de tocar nada más.
  const handleSearchKeyDown = async (e) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const q = search.trim()
    if (!q || !branchId) return

    clearTimeout(searchTimer.current)
    setIsSearching(true)
    let raw = []
    try {
      const { data } = await fetchMergedCatalog({ branchId, search: q, page: 1, limit: 8 })
      raw = data
    } catch { raw = [] } finally { setIsSearching(false) }

    const qLower = q.toLowerCase()

    const simpleMatch = raw.find(p => !p.is_variable && p.sku?.toLowerCase() === qLower)
    if (simpleMatch) { handleAddSimple(simpleMatch); handleClearSearch(); return }

    for (const p of raw) {
      if (!p.is_variable) continue
      const v = (p.variants ?? []).find(v => v.sku?.toLowerCase() === qLower)
      if (v) { handleAddVariant(p, v); handleClearSearch(); return }
    }

    // [FIX] SKU del padre variable: nunca se agrega el padre — se muestran
    // solo sus variantes (aplanadas) para que el cajero elija una.
    const parentMatch = raw.find(p => p.is_variable && p.sku?.toLowerCase() === qLower)
    setDropdownItems(parentMatch ? flatten(parentMatch) : raw.flatMap(flatten))
    setShowDropdown(true)
  }

  // ── Chequeo de stock antes de agregar: si es 0, abre el modal de
  // "producto agotado" en vez de agregarlo silenciosamente. ──
  const tryAddItem = (payload) => {
    if (Number(payload.stock) <= 0) {
      setOutOfStockTarget(payload)
      return
    }
    addItem(payload)
    focusSearch()
  }

  const handleAddSimple = (p) => {
    tryAddItem({
      product_id:     p.product_id,
      variant_id:     null,
      name:           p.name,
      sku:            p.sku,
      image:          p.image,
      unit_price:     p.sale_price,
      original_price: p.sale_price, // [NUEVO] fallback al borrar el precio editado
      purchase_price: p.purchase_price,
      stock:          p.total_stock,
    })
  }

  const handleAddVariant = (p, v) => {
    tryAddItem({
      product_id:     p.product_id,
      variant_id:     v.variant_id,
      name:           `${p.name} — ${v.label}`,
      sku:            v.sku || p.sku,
      image:          p.image,
      unit_price:     p.sale_price,
      original_price: p.sale_price, // [NUEVO] fallback al borrar el precio editado
      purchase_price: p.purchase_price,
      stock:          v.quantity,
    })
  }

  const handleProductClick = (p) => {
    if (p.is_variable) { setVariantTarget(p); return }
    handleAddSimple(p)
  }

  const handleDropdownPick = (flatItem) => {
    if (flatItem.__variant) handleAddVariant(flatItem, flatItem.__variant)
    else handleAddSimple(flatItem)
    handleClearSearch()
  }

  const handleCategoryClick = (catId) => {
    const val = categoryId === catId ? '' : catId
    setCategoryId(val)
    catRef.current = val
    setPage(prev => { if (prev === 1) { fetchGrid(1); return 1 } return 1 })
  }

  // ── Pestañas de carritos ──
  const handleNewCartTab = () => {
    if (cart.items.length > 0) suspendCart()
  }

  // ── Descuento inline ──
  const applyDiscount = () => {
    const amt = Number(discountAmt) || 0
    const applied = discountType === '%'
      ? +(subtotal * amt / 100).toFixed(2)
      : Math.min(amt, subtotal)
    setDiscount({ type: discountType, amount: amt, applied })
    setDiscountOpen(false)
  }

  const clearDiscountInline = () => {
    removeDiscount()
    setDiscountAmt('')
    setDiscountOpen(false)
  }

  // [FIX] Orden estable de pestañas: cada carrito conserva su `id` de por
  // vida (se preserva al suspender/reanudar), así que ordenar por id da una
  // posición fija sin importar cuál esté activo — antes la pestaña activa
  // siempre se pintaba primero, lo que hacía "saltar" el orden visualmente.
  const allCartTabs = [cart, ...suspendedCarts].sort((a, b) => a.id - b.id)

  return (
    <>
      {/* ── Buscador (siempre visible, único modo de agregar en móvil) ── */}
      <div className="pos-search-wrap">
        <div className="pos-search">
          <i className="bi bi-upc-scan pos-search__icon" />
          <input
            ref={searchInputRef}
            type="text"
            className="pos-search__input"
            placeholder="Buscar o escanear código de barras..."
            value={search}
            onChange={e => handleSearchChange(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            autoFocus
          />
          {isSearching && <span className="pos-spinner pos-spinner--dark pos-search__spinner" />}
          {search && (
            <button className="pos-search__clear" onClick={handleClearSearch}>
              <i className="bi bi-x" />
            </button>
          )}
        </div>

        {showDropdown && dropdownItems.length > 0 && (
          <div className="pos-search-dropdown">
            {dropdownItems.map(item => {
              const v = item.__variant
              const qty = v ? v.quantity : item.total_stock
              return (
                <button
                  key={v ? `${item.product_id}-${v.variant_id}` : `${item.product_id}-simple`}
                  type="button"
                  className="pos-search-dropdown__item"
                  onClick={() => handleDropdownPick(item)}
                >
                  <div className="pos-thumb-sm">
                    {item.image ? <img src={item.image} alt="" /> : <i className="bi bi-box-seam" />}
                  </div>
                  <div className="pos-search-dropdown__info">
                    <span className="pos-search-dropdown__name">{item.name}{v && ` — ${v.label}`}</span>
                    <span className="pos-search-dropdown__meta">{money(item.sale_price)} · stock {qty}</span>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="pos-body">
        {/* ── Grid (oculto en móvil) ── */}
        <div className="pos-grid-panel">
          {visibleCategories.length > 0 && (
            <div className="pos-cat-chips">
              <button
                className={`pos-cat-chip ${!categoryId ? 'pos-cat-chip--active' : ''}`}
                onClick={() => handleCategoryClick('')}
              >
                Todas
              </button>
              {visibleCategories.map(c => (
                <button
                  key={c.category_id}
                  className={`pos-cat-chip ${categoryId === String(c.category_id) ? 'pos-cat-chip--active' : ''}`}
                  onClick={() => handleCategoryClick(String(c.category_id))}
                  style={categoryId === String(c.category_id) && c.color ? { background: c.color, borderColor: c.color, color: '#fff' } : undefined}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}

          {gridError && (
            <div className="pos-alert pos-alert--error"><i className="bi bi-exclamation-circle" /><span>{gridError}</span></div>
          )}

          {gridLoading ? (
            <div className="pos-gate__empty"><span className="pos-spinner pos-spinner--dark" /><span>Cargando productos...</span></div>
          ) : gridItems.length === 0 ? (
            <div className="pos-gate__empty"><i className="bi bi-box-seam" /><span>No se encontraron productos</span></div>
          ) : (
            <>
              <div className="pos-product-grid">
                {gridItems.map(p => {
                  const noStock = Number(p.total_stock) <= 0
                  return (
                    <button
                      key={p.product_id}
                      type="button"
                      className="pos-product-card"
                      onClick={() => handleProductClick(p)}
                    >
                      <div className="pos-product-card__img">
                        {p.image ? <img src={p.image} alt={p.name} /> : <i className="bi bi-box-seam" />}
                        {!!p.is_variable && <span className="pos-product-card__variable"><i className="bi bi-layers" /></span>}
                      </div>
                      <span className="pos-product-card__name">{p.name}</span>
                      {p.sku && <span className="pos-product-card__sku">{p.sku}</span>}
                      <div className="pos-product-card__bottom">
                        <strong>{money(p.sale_price)}</strong>
                        <span className={`pos-stock-dot ${noStock ? 'pos-stock-dot--empty' : p.total_stock <= 5 ? 'pos-stock-dot--low' : 'pos-stock-dot--ok'}`}>
                          {p.total_stock}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>

              {pagination.totalPages > 1 && (
                <div className="pos-pagination">
                  <button className="pos-btn pos-btn--ghost" onClick={() => setPage(p => p - 1)} disabled={page === 1}>
                    <i className="bi bi-chevron-left" />
                  </button>
                  <span>Página {page} de {pagination.totalPages}</span>
                  <button className="pos-btn pos-btn--ghost" onClick={() => setPage(p => p + 1)} disabled={page === pagination.totalPages}>
                    <i className="bi bi-chevron-right" />
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Carrito ── */}
        <div className="pos-cart-panel">
          {/* Pestañas */}
          <div className="pos-cart-tabs">
            {allCartTabs.map(tab => {
              const isActive = tab.id === cart.id
              return (
                <div
                  key={tab.id}
                  className={`pos-cart-tab ${isActive ? 'pos-cart-tab--active' : ''}`}
                  onClick={() => {
                    if (isActive) return
                    const idx = suspendedCarts.findIndex(c => c.id === tab.id)
                    if (idx !== -1) resumeCart(idx)
                  }}
                >
                  <i className="bi bi-cart-fill" />
                  <span>{tab.label}</span>
                  {!isActive && (
                    <button
                      type="button"
                      className="pos-cart-tab__x"
                      onClick={e => {
                        e.stopPropagation()
                        const idx = suspendedCarts.findIndex(c => c.id === tab.id)
                        if (idx !== -1) setConfirmDiscardIdx(idx)
                      }}
                    >
                      <i className="bi bi-x" />
                    </button>
                  )}
                </div>
              )
            })}
            <button
              type="button"
              className="pos-cart-tab pos-cart-tab--new"
              onClick={handleNewCartTab}
              disabled={suspendedCarts.length >= 4}
              title={suspendedCarts.length >= 4 ? 'Máximo 4 carritos en espera' : 'Nuevo carrito'}
            >
              <i className="bi bi-plus-lg" />
            </button>
          </div>


          {/* Cliente */}
          <button type="button" className="pos-cart-customer" onClick={() => setCustomerOpen(true)}>
            <i className="bi bi-person-badge" />
            <span>{cart.customerId === 1 ? 'Público general' : `Cliente #${cart.customerId}`}</span>
            <i className="bi bi-chevron-right" style={{ marginLeft: 'auto', fontSize: 12 }} />
          </button>

          {/* Items */}
          <div className="pos-cart-items">
            {cart.items.length === 0 ? (
              <div className="pos-cart-empty">
                <i className="bi bi-cart" />
                <span>Busca o escanea un producto para agregarlo</span>
              </div>
            ) : cart.items.map(item => {
              const key = item.variant_id ?? item.product_id
              return (
                <div key={key} className="pos-cart-item">
                  {/* Fila 1: imagen + nombre + eliminar */}
                  <div className="pos-cart-item__row1">
                    <div className="pos-thumb-sm">
                      {item.image ? <img src={item.image} alt="" /> : <i className="bi bi-box-seam" />}
                    </div>
                    <div className="pos-cart-item__info">
                      <span className="pos-cart-item__name">{item.name}</span>
                    </div>
                    <button type="button" className="pos-cart-item__remove"
                      onClick={() => { removeItem(item.product_id, item.variant_id); focusSearch() }}>
                      <i className="bi bi-trash3" />
                    </button>
                  </div>

                  {/* Fila 2: precio editable + cantidad editable + subtotal — alineados, sin depender del ancho del nombre */}
                  <div className="pos-cart-item__row2">
                    <div className="pos-cart-item__price-group">
                      <span className="pos-cart-item__price-currency">$</span>
                      <EditableNumber
                        min="0" step="0.01" inputMode="decimal"
                        className="pos-cart-item__price-input"
                        value={item.unit_price}
                        emptyFallback={item.original_price ?? 1}
                        onCommit={(v) => updatePrice(item.product_id, item.variant_id, v)}
                        onEnterNext={focusSearch}
                      />
                      <span className="pos-cart-item__price">c/u</span>
                    </div>

                    <span className="pos-cart-item__spacer" />

                    <div className="pos-cart-item__qty">
                      <button type="button" onClick={() => handleDecreaseQty(item)}>
                        <i className="bi bi-dash" />
                      </button>
                      <EditableNumber
                        min="0.001" step="any" inputMode="decimal"
                        className="pos-cart-item__qty-input"
                        value={item.quantity}
                        maxValue={item.stock}
                        onCommit={(v) => updateQty(item.product_id, item.variant_id, v)}
                        onClamped={() => warnMaxStock(item.variant_id ?? item.product_id)}
                        onEnterNext={focusSearch}
                      />
                      <button type="button" onClick={() => handleIncreaseQty(item)}>
                        <i className="bi bi-plus" />
                      </button>
                      {qtyWarnKey === (item.variant_id ?? item.product_id) && (
                        <span className="pos-cart-item__qty-warn">Stock máximo: {item.stock}</span>
                      )}
                    </div>

                    <strong className="pos-cart-item__subtotal">{money(item.subtotal)}</strong>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Nota inline */}
          {noteOpen && (
            <div className="pos-cart-note">
              <textarea
                className="pos-cart-note__input"
                placeholder="Nota para esta venta..."
                value={cart.note}
                onChange={e => setNote(e.target.value)}
                rows={2}
                autoFocus
              />
            </div>
          )}

          {/* Descuento inline */}
          {discountOpen && (
            <div className="pos-cart-discount">
              <select className="pos-cart-discount__type" value={discountType} onChange={e => setDiscountType(e.target.value)}>
                <option value="$">$ Fijo</option>
                <option value="%">% Porcentaje</option>
              </select>
              <input
                type="number" min="0" step="0.01"
                className="pos-cart-discount__amount"
                value={discountAmt}
                onChange={e => setDiscountAmt(e.target.value)}
                placeholder="0"
              />
              <button type="button" className="pos-btn pos-btn--primary" onClick={applyDiscount}>Aplicar</button>
            </div>
          )}
          {cart.discount.applied > 0 && !discountOpen && (
            <div className="pos-cart-discount-applied">
              <span>
                Descuento{cart.discount.type === '%' ? `(-${cart.discount.amount}%)` : ''} aplicado: -{money(cart.discount.applied)}
              </span>
              <button type="button" onClick={clearDiscountInline}><i className="bi bi-x-lg" /> Quitar</button>
            </div>
          )}

          {/* Resumen */}
          <div className="pos-cart-summary">
            <div className="pos-cart-summary__row">
              <span>Subtotal</span><span>{money(subtotal)}</span>
            </div>
            {cart.discount.applied > 0 && (
              <div className="pos-cart-summary__row pos-mov--out">
                <span>Descuento{cart.discount.type === '%' ? `(-${cart.discount.amount}%)` : ''}</span>
                <span>-{money(cart.discount.applied)}</span>
              </div>
            )}
            <div className="pos-cart-summary__row pos-cart-summary__row--total">
              <span>Total</span><span>{money(total)}</span>
            </div>
          </div>

          {/* Acciones */}
          <div className="pos-cart-actions">
            <button type="button" className="pos-cart-action-btn" onClick={() => setConfirmClear(true)} disabled={cart.items.length === 0}>
              <i className="bi bi-trash3" /><span>Vaciar</span>
            </button>
            <button type="button" className={`pos-cart-action-btn ${cart.note ? 'pos-cart-action-btn--active' : ''}`} onClick={() => setNoteOpen(o => !o)}>
              <i className="bi bi-sticky" /><span>Nota</span>
            </button>
            <button type="button" className={`pos-cart-action-btn ${cart.discount.applied > 0 ? 'pos-cart-action-btn--active' : ''}`}
              onClick={() => setDiscountOpen(o => !o)} disabled={cart.items.length === 0}>
              <i className="bi bi-percent" /><span>Descuento</span>
            </button>
          </div>

          <div className="pos-cart-checkout-row" style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="pos-btn pos-btn--ghost pos-btn--lg"
              style={{ flexShrink: 0 }}
              onClick={() => setLayawayOpen(true)}
              disabled={cart.items.length === 0}
              title="Apartar — reserva el stock y cobra el resto después"
            >
              <i className="bi bi-bag-check" /> Apartar
            </button>
            <button
              type="button"
              className="pos-btn pos-btn--ghost pos-btn--lg"
              style={{ flexShrink: 0 }}
              onClick={() => setCreditOpen(true)}
              disabled={cart.items.length === 0}
              title="Crédito — completa la venta y deja el saldo a la cuenta del cliente"
            >
              <i className="bi bi-clock-history" /> Crédito
            </button>
            <button
              type="button"
              className="pos-btn pos-btn--primary pos-btn--lg pos-cart-pay-btn"
              style={{ flex: 1 }}
              onClick={() => setPaymentOpen(true)}
              disabled={cart.items.length === 0}
            >
              <i className="bi bi-cash-coin" /> Cobrar {money(total)}
            </button>
          </div>
        </div>
      </div>

      {/* ── Modales ── */}
      {variantTarget && (
        <VariantPickerModal
          product={variantTarget}
          onPick={(v) => { handleAddVariant(variantTarget, v); setVariantTarget(null); focusSearch() }}
          onClose={() => setVariantTarget(null)}
        />
      )}
      {customerOpen && <CustomerModal onClose={() => setCustomerOpen(false)} />}
      {paymentOpen && <PaymentModal onClose={() => setPaymentOpen(false)} onSaleCompleted={() => fetchGrid(page)} />}
      {layawayOpen && <LayawayModal onClose={() => setLayawayOpen(false)} onSaleCompleted={() => fetchGrid(page)} />}
      {creditOpen && <CreditModal onClose={() => setCreditOpen(false)} onSaleCompleted={() => fetchGrid(page)} />}
      {outOfStockTarget && (
        <OutOfStockModal
          target={outOfStockTarget}
          onClose={() => { setOutOfStockTarget(null); focusSearch() }}
          onStockAdded={() => fetchGrid(page)}
        />
      )}

      {confirmClear && (
        <ConfirmDialog
          title="Vaciar carrito"
          message="¿Quitar todos los productos del carrito actual? Esta acción no se puede deshacer."
          confirmLabel="Vaciar"
          variant="danger"
          onClose={() => setConfirmClear(false)}
          onConfirm={() => { clearCart(); setConfirmClear(false) }}
        />
      )}

      {confirmDiscardIdx !== null && (
        <ConfirmDialog
          title="Descartar carrito suspendido"
          message={`¿Descartar "${suspendedCarts[confirmDiscardIdx]?.label}"? Se perderán sus productos.`}
          confirmLabel="Descartar"
          variant="danger"
          onClose={() => setConfirmDiscardIdx(null)}
          onConfirm={() => { discardSuspended(confirmDiscardIdx); setConfirmDiscardIdx(null) }}
        />
      )}
    </>
  )
}

const POS = () => (
  <BranchGate
    title="Selecciona una sucursal"
    description="Elige la sucursal en la que vas a operar el punto de venta"
  >
    <PosContextProvider>
      <PosInner />
    </PosContextProvider>
  </BranchGate>
)

export default POS