// src/components/Inventory/modals/TransferModal.jsx
import { useState, useEffect, useRef } from 'react'
import { useUser } from '../../../Context/UserContext'
import api from '../../../services/api'
import { useBranch } from '../../../context/BranchContext'
import { StockBadge } from '../tabs/StockTab'

const STEPS = { FORM: 'form', RESULT: 'result' }

const TransferModal = ({ onSaved, onClose }) => {
  const { user } = useUser()
  const { selectedBranch } = useBranch()

  const [step,     setStep]     = useState(STEPS.FORM)
  const [branches, setBranches] = useState([])
  const [toBranchId, setToBranchId] = useState('')
  const [notes,    setNotes]    = useState('')

  const [isSaving, setIsSaving] = useState(false)
  const [error,    setError]    = useState(null)
  const [result,   setResult]   = useState(null)

  // Carrito — mismo patrón que BulkAdjustModal
  const [cartItems,     setCartItems]     = useState([])   // { key, product_id, variant_id, name, variantLabel, sku, image, currentStock, quantity }
  const [query,         setQuery]         = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [isSearching,   setIsSearching]   = useState(false)
  const [showDropdown,  setShowDropdown]  = useState(false)
  const searchTimer = useRef(null)

  // Cargar sucursales destino (todas excepto la propia)
  useEffect(() => {
    if (!selectedBranch.branch_id) return
    api.get('branches?is_active=true')
      .then(({ data }) => {
        setBranches(data.data.filter(b => b.branch_id !== selectedBranch.branch_id))
      })
      .catch(() => {})
  }, [selectedBranch.branch_id])

  // Aplana productos "crudos" del backend a opciones seleccionables — cada
  // variante es su propia opción, igual que en StockTab/BulkAdjustModal.
  const flattenResults = (rawList) => rawList.flatMap(p =>
    p.is_variable
      ? (p.variants ?? []).map(v => ({
          key:          `${p.product_id}-${v.variant_id}`,
          product_id:   p.product_id,
          variant_id:   v.variant_id,
          name:         p.name,
          variantLabel: v.label,
          sku:          v.sku || p.sku,
          image:        p.image,
          currentStock: v.quantity,
        }))
      : [{
          key:          `${p.product_id}-null`,
          product_id:   p.product_id,
          variant_id:   null,
          name:         p.name,
          variantLabel: null,
          sku:          p.sku,
          image:        p.image,
          currentStock: p.total_stock,
        }]
  )

  const runSearch = async (q) => {
    if (!selectedBranch?.branch_id || !q.trim()) return
    setIsSearching(true)
    try {
      const { data } = await api.get('inventory/stock', {
        params: { search: q.trim(), branch_id: selectedBranch.branch_id, limit: 8 },
      })
      setSearchResults(flattenResults(data.data ?? []))
      setShowDropdown(true)
    } catch {
      setSearchResults([])
    } finally {
      setIsSearching(false)
    }
  }

  const handleQueryChange = (val) => {
    setQuery(val)
    clearTimeout(searchTimer.current)
    if (!val.trim()) { setSearchResults([]); setShowDropdown(false); return }
    searchTimer.current = setTimeout(() => runSearch(val), 350)
  }

  // Enter en el buscador: busca de inmediato y resuelve por SKU EXACTO —
  // mismo comportamiento que en BulkAdjustModal:
  //  - SKU de producto simple / variante -> se agrega solo al carrito
  //  - SKU del padre de un producto variable -> solo muestra sus variantes
  const handleSearchKeyDown = async (e) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const q = query.trim()
    if (!q || !selectedBranch?.branch_id) return

    clearTimeout(searchTimer.current)
    setIsSearching(true)
    let raw = []
    try {
      const { data } = await api.get('inventory/stock', {
        params: { search: q, branch_id: selectedBranch.branch_id, limit: 8 },
      })
      raw = data.data ?? []
    } catch {
      raw = []
    } finally {
      setIsSearching(false)
    }

    const qLower = q.toLowerCase()

    const simpleMatch = raw.find(p => !p.is_variable && p.sku?.toLowerCase() === qLower)
    if (simpleMatch) {
      addToCart({
        key:          `${simpleMatch.product_id}-null`,
        product_id:   simpleMatch.product_id,
        variant_id:   null,
        name:         simpleMatch.name,
        variantLabel: null,
        sku:          simpleMatch.sku,
        image:        simpleMatch.image,
        currentStock: simpleMatch.total_stock,
      })
      return
    }

    for (const p of raw) {
      if (!p.is_variable) continue
      const v = (p.variants ?? []).find(v => v.sku?.toLowerCase() === qLower)
      if (v) {
        addToCart({
          key:          `${p.product_id}-${v.variant_id}`,
          product_id:   p.product_id,
          variant_id:   v.variant_id,
          name:         p.name,
          variantLabel: v.label,
          sku:          v.sku || p.sku,
          image:        p.image,
          currentStock: v.quantity,
        })
        return
      }
    }

    const parentMatch = raw.find(p => p.is_variable && p.sku?.toLowerCase() === qLower)
    setSearchResults(flattenResults(parentMatch ? [parentMatch] : raw))
    setShowDropdown(true)
  }

  const addToCart = (item) => {
    setCartItems(prev => prev.some(c => c.key === item.key)
      ? prev
      : [...prev, { ...item, quantity: 1 }])
    setQuery('')
    setSearchResults([])
    setShowDropdown(false)
  }

  const removeFromCart = (key) => setCartItems(prev => prev.filter(c => c.key !== key))

  const updateQuantity = (key, rawValue) => {
    const n = Number(rawValue)
    setCartItems(prev => prev.map(c => c.key === key ? { ...c, quantity: isNaN(n) ? 0 : n } : c))
  }

  const cartHasInvalid = cartItems.some(c => !c.quantity || c.quantity <= 0 || c.quantity > c.currentStock)
  const totalUnits      = cartItems.reduce((sum, c) => sum + (Number(c.quantity) || 0), 0)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!selectedBranch?.branch_id) return
    if (!toBranchId) { setError('Selecciona la sucursal destino'); return }
    if (cartItems.length === 0) { setError('Agrega al menos un producto al carrito'); return }
    if (cartHasInvalid) { setError('Revisa las cantidades: no pueden ser 0 ni superar el disponible'); return }

    setIsSaving(true); setError(null)
    try {
      const { data } = await api.post(`inventory/transfers/bulk?branch_id=${selectedBranch.branch_id}`, {
        to_branch_id: Number(toBranchId),
        items: cartItems.map(c => ({
          product_id: c.product_id,
          variant_id: c.variant_id,
          quantity:   c.quantity,
        })),
        notes: notes.trim() || null,
      })
      setResult(data.data)
      setStep(STEPS.RESULT)
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al crear el traspaso')
    } finally {
      setIsSaving(false)
    }
  }

  const handleReset = () => {
    setStep(STEPS.FORM); setResult(null); setError(null)
    setCartItems([]); setQuery(''); setSearchResults([]); setShowDropdown(false)
    setToBranchId(''); setNotes('')
  }

  return (
    <div className="inv-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="inv-modal inv-modal--lg">
        <div className="inv-modal__header">
          <h3 className="inv-modal__title">
            <i className="bi bi-shuffle" />Nuevo traspaso
          </h3>
          <button className="inv-modal__close" onClick={onClose} aria-label="Cerrar">
            <i className="bi bi-x-lg" />
          </button>
        </div>

        <form className="inv-modal__body" onSubmit={handleSubmit}>
          {error && (
            <div className="inv-alert">
              <i className="bi bi-exclamation-circle" /><span>{error}</span>
            </div>
          )}

          {/* ── Formulario + carrito ── */}
          {step === STEPS.FORM && (
            <>
              <div className="inv-field">
                <label className="inv-field__label">Sucursal destino <span className="inv-field__req">*</span></label>
                <select className="inv-field__input inv-field__select"
                  value={toBranchId} onChange={e => { setToBranchId(e.target.value); setError(null) }} required>
                  <option value="">Seleccionar sucursal...</option>
                  {branches.map(b => (
                    <option key={b.branch_id} value={b.branch_id}>{b.name}</option>
                  ))}
                </select>
              </div>

              <p className="inv-muted" style={{ fontSize: '13px', marginBottom: '4px' }}>
                Busca cada producto, agrégalo al carrito y ajusta cuánto quieres transferir.
              </p>

              {/* Buscador */}
              <div style={{ position: 'relative' }}>
                <div className="inv-search">
                  <i className="bi bi-search inv-search__icon" />
                  <input
                    type="text"
                    className="inv-search__input"
                    placeholder="Buscar por nombre o SKU..."
                    value={query}
                    onChange={e => handleQueryChange(e.target.value)}
                    onKeyDown={handleSearchKeyDown}
                    onFocus={() => { if (searchResults.length > 0) setShowDropdown(true) }}
                    onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                    disabled={!selectedBranch?.branch_id}
                  />
                  {query && (
                    <button type="button" className="inv-search__clear" onClick={() => handleQueryChange('')}>
                      <i className="bi bi-x" />
                    </button>
                  )}
                </div>

                {showDropdown && (
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 20,
                    background: 'var(--inv-surface, #fff)', border: '1px solid var(--inv-border, #e2e8f0)',
                    borderRadius: 'var(--inv-radius-sm, 8px)', boxShadow: '0 8px 24px rgba(15,23,42,.12)',
                    maxHeight: 260, overflowY: 'auto',
                  }}>
                    {isSearching ? (
                      <div className="inv-muted" style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="inv-spinner inv-spinner--sm" /> Buscando...
                      </div>
                    ) : searchResults.length === 0 ? (
                      <div className="inv-muted" style={{ padding: 12 }}>Sin resultados</div>
                    ) : (
                      searchResults.map(r => {
                        const already = cartItems.some(c => c.key === r.key)
                        return (
                          <button
                            key={r.key}
                            type="button"
                            onMouseDown={(e) => { e.preventDefault(); if (!already) addToCart(r) }}
                            disabled={already}
                            style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                              width: '100%', padding: '10px 12px', border: 'none', borderBottom: '1px solid var(--inv-border, #e2e8f0)',
                              background: 'transparent', cursor: already ? 'not-allowed' : 'pointer', opacity: already ? .5 : 1,
                              textAlign: 'left',
                            }}
                          >
                            <div className="inv-product-cell">
                              <div className="inv-thumb">
                                {r.image
                                  ? <img src={r.image} alt={r.name} onError={e => e.target.style.display = 'none'} />
                                  : <i className="bi bi-box-seam" />
                                }
                              </div>
                              <div>
                                <span className="inv-product-name">
                                  {r.name}{r.variantLabel && ` — ${r.variantLabel}`}
                                </span>
                                {r.sku && <span className="inv-sku">SKU: {r.sku}</span>}
                              </div>
                            </div>
                            <StockBadge qty={r.currentStock} />
                          </button>
                        )
                      })
                    )}
                  </div>
                )}
              </div>

              {/* Carrito */}
              {cartItems.length === 0 ? (
                <div className="inv-empty">
                  <i className="bi bi-cart" />
                  <span>Busca y agrega los productos a transferir</span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {cartItems.map(item => {
                    const exceeds = item.quantity > item.currentStock
                    const empty   = !item.quantity || item.quantity <= 0
                    const invalid = exceeds || empty
                    return (
                      <div key={item.key} style={{
                        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                        padding: '10px 12px', border: `1px solid ${invalid ? 'var(--inv-red, #dc2626)' : 'var(--inv-border, #e2e8f0)'}`,
                        borderRadius: 'var(--inv-radius-sm, 8px)',
                      }}>
                        <div className="inv-product-cell" style={{ flex: 1, minWidth: 160 }}>
                          <div className="inv-thumb">
                            {item.image
                              ? <img src={item.image} alt={item.name} onError={e => e.target.style.display = 'none'} />
                              : <i className="bi bi-box-seam" />
                            }
                          </div>
                          <div>
                            <span className="inv-product-name">
                              {item.name}{item.variantLabel && ` — ${item.variantLabel}`}
                            </span>
                            {item.sku && <span className="inv-sku">SKU: {item.sku}</span>}
                          </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                          <span className="inv-muted" style={{ fontSize: 11 }}>Disponible</span>
                          <StockBadge qty={item.currentStock} />
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <button type="button" className="inv-action-btn"
                            disabled={item.quantity <= 1}
                            onClick={() => updateQuantity(item.key, item.quantity - 1)}>
                            <i className="bi bi-dash" />
                          </button>
                          <input
                            type="number"
                            min="1"
                            max={item.currentStock}
                            className="inv-field__input"
                            style={{ width: 68, textAlign: 'center' }}
                            value={item.quantity}
                            onChange={e => updateQuantity(item.key, e.target.value)}
                          />
                          <button type="button" className="inv-action-btn"
                            disabled={item.quantity >= item.currentStock}
                            onClick={() => updateQuantity(item.key, item.quantity + 1)}>
                            <i className="bi bi-plus" />
                          </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 90 }}>
                          {invalid && (
                            <span style={{ fontSize: 11, color: 'var(--inv-red, #dc2626)', textAlign: 'center' }}>
                              {exceeds ? 'Supera el disponible' : 'Debe ser mayor a 0'}
                            </span>
                          )}
                        </div>

                        <button type="button" className="inv-action-btn inv-action-btn--danger"
                          onClick={() => removeFromCart(item.key)} title="Quitar del carrito">
                          <i className="bi bi-trash" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}

              <div className="inv-field">
                <label className="inv-field__label">Notas</label>
                <textarea className="inv-field__input inv-field__textarea"
                  value={notes} onChange={e => setNotes(e.target.value)}
                  placeholder="Motivo del traspaso (opcional)..." rows={2} />
              </div>
            </>
          )}

          {/* ── Resultado ── */}
          {step === STEPS.RESULT && result && (
            <div className="inv-bulk-result">
              <div className="inv-bulk-result__summary">
                <div className="inv-bulk-result__stat inv-bulk-result__stat--ok">
                  <span className="inv-bulk-result__stat-val">{result.created}</span>
                  <span>Solicitados</span>
                </div>
                <div className={`inv-bulk-result__stat ${result.failed > 0 ? 'inv-bulk-result__stat--err' : 'inv-bulk-result__stat--muted'}`}>
                  <span className="inv-bulk-result__stat-val">{result.failed}</span>
                  <span>Con error</span>
                </div>
              </div>
              {result.failed_detail?.length > 0 && (
                <div className="inv-bulk-errors">
                  <span className="inv-form-section__label">Productos con error</span>
                  {result.failed_detail.map((f, i) => (
                    <div key={i} className="inv-bulk-error-row">
                      <span className="inv-muted">#{f.row}</span>
                      <span>{f.product_id ?? '—'}</span>
                      <span className="inv-red">{f.reason}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Footer ── */}
          <div className="inv-modal__footer">
            {step === STEPS.FORM && (
              <>
                <button type="button" className="inv-btn inv-btn--ghost" onClick={onClose}>
                  Cancelar
                </button>
                <span className="inv-text-muted" style={{ marginRight: 'auto', marginLeft: 8 }}>
                  {cartItems.length > 0 &&
                    `${cartItems.length} producto${cartItems.length !== 1 ? 's' : ''} · ${totalUnits} unidad${totalUnits !== 1 ? 'es' : ''}`}
                </span>
                <button type="submit" className="inv-btn inv-btn--primary"
                  disabled={isSaving || !toBranchId || cartItems.length === 0 || cartHasInvalid}>
                  {isSaving
                    ? <><span className="inv-spinner inv-spinner--white" /> Enviando...</>
                    : <><i className="bi bi-shuffle" /> Solicitar traspaso</>
                  }
                </button>
              </>
            )}
            {step === STEPS.RESULT && (
              <>
                {result?.failed > 0 && (
                  <button type="button" className="inv-btn inv-btn--ghost" onClick={handleReset}>
                    <i className="bi bi-arrow-repeat" /> Nuevo traspaso
                  </button>
                )}
                <button type="button" className="inv-btn inv-btn--primary" onClick={() => { onSaved(); onClose(); }}>
                  <i className="bi bi-check-lg" /> Finalizar
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}

export default TransferModal