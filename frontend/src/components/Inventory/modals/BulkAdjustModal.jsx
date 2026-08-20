// src/components/Inventory/modals/BulkAdjustModal.jsx
import { useState, useRef } from 'react'
import Papa from 'papaparse'
import api from '../../../services/api'
import { useBranch } from '../../../context/BranchContext'
import { StockBadge } from '../tabs/StockTab'
const STEPS = { MODE: 'mode', CSV: 'csv', TABLE: 'table', PREVIEW: 'preview', RESULT: 'result' }

const REASONS = [
  'Conteo físico', 'Merma', 'Producto dañado',
  'Error de registro', 'Compra a proveedor', 'Otro',
]

const BulkAdjustModal = ({ onDone, onClose }) => {
  const { selectedBranch } = useBranch();
  const [step, setStep] = useState(STEPS.MODE)
  const [reason, setReason] = useState(REASONS[0])
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  // CSV flow
  const [csvRows, setCsvRows] = useState([])
  const [csvHeaders, setCsvHeaders] = useState([])
  const [fileName, setFileName] = useState('')
  const fileRef = useRef(null)

  // Table flow — ahora estilo "carrito"
  const [cartItems, setCartItems] = useState([])   // { key, product_id, variant_id, name, variantLabel, sku, image, currentStock, delta }
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [isSearching, setIsSearching] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const searchTimer = useRef(null)
  const searchInputRef = useRef(null)

  // [NUEVO] Mismo patrón de foco que en el POS (ver Pos.jsx): el buscador
  // debe recuperar el foco después de cualquier acción sobre el carrito
  // (agregar, quitar, +/-) para que el flujo de escaneo continuo no se corte.
  const focusSearch = () => setTimeout(() => searchInputRef.current?.focus(), 0)

  // Elementos que sí necesitan quedarse con el foco (el campo de cantidad,
  // el select de motivo, etc.) — si el foco se va a uno de estos, no hay
  // que robárselo.
  const isFocusWorthy = (el) => !!el?.matches?.('input, textarea, select, [contenteditable="true"]')

  // [NUEVO] Recuperación de foco vía blur + relatedTarget, igual que en el
  // POS: si el foco se va a un botón "muerto en foco" (+/-, quitar), lo
  // recuperamos; si se va a un campo de texto real, lo dejamos en paz. A
  // diferencia del POS, este modal no tiene otros modales anidados adentro,
  // así que no hace falta el guard de ".pos-overlay".
  const handleSearchBlur = (e) => {
    setTimeout(() => setShowDropdown(false), 150) // comportamiento original: cierra el dropdown

    if (isFocusWorthy(e.relatedTarget)) return // el usuario quiere escribir en otro campo (ej. cantidad)
    if (!document.hasFocus()) return // alt-tab / devtools: no pelear por el foco
    focusSearch()
  }

  // Aplana productos "crudos" del backend a opciones seleccionables:
  // cada variante es su propia opción, igual que en el StockTab — así el
  // carrito siempre trabaja con product_id+variant_id ya resueltos.
  const flattenResults = (rawList) => rawList.flatMap(p =>
    p.is_variable
      ? (p.variants ?? []).map(v => ({
        key: `${p.product_id}-${v.variant_id}`,
        product_id: p.product_id,
        variant_id: v.variant_id,
        name: p.name,
        variantLabel: v.label,
        sku: v.sku || p.sku,
        image: p.image,
        currentStock: v.quantity,
      }))
      : [{
        key: `${p.product_id}-null`,
        product_id: p.product_id,
        variant_id: null,
        name: p.name,
        variantLabel: null,
        sku: p.sku,
        image: p.image,
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

  // Enter en el buscador: busca de inmediato (sin esperar el debounce) y
  // resuelve por coincidencia EXACTA de SKU:
  //  - SKU de producto simple  -> se agrega solo al carrito
  //  - SKU de una variante     -> se agrega solo al carrito
  //  - SKU del padre variable  -> NO se agrega nada; solo deja el dropdown
  //                                mostrando sus variantes para elegir
  //  - Sin coincidencia exacta -> se comporta como una búsqueda normal
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

    // 1) SKU exacto de producto simple
    const simpleMatch = raw.find(p => !p.is_variable && p.sku?.toLowerCase() === qLower)
    if (simpleMatch) {
      addToCart({
        key: `${simpleMatch.product_id}-null`,
        product_id: simpleMatch.product_id,
        variant_id: null,
        name: simpleMatch.name,
        variantLabel: null,
        sku: simpleMatch.sku,
        image: simpleMatch.image,
        currentStock: simpleMatch.total_stock,
      })
      return
    }

    // 2) SKU exacto de una variante
    for (const p of raw) {
      if (!p.is_variable) continue
      const v = (p.variants ?? []).find(v => v.sku?.toLowerCase() === qLower)
      if (v) {
        addToCart({
          key: `${p.product_id}-${v.variant_id}`,
          product_id: p.product_id,
          variant_id: v.variant_id,
          name: p.name,
          variantLabel: v.label,
          sku: v.sku || p.sku,
          image: p.image,
          currentStock: v.quantity,
        })
        return
      }
    }

    // 3) SKU exacto del padre de un producto variable -> solo mostrar sus variantes
    const parentMatch = raw.find(p => p.is_variable && p.sku?.toLowerCase() === qLower)
    setSearchResults(flattenResults(parentMatch ? [parentMatch] : raw))
    setShowDropdown(true)
  }

  const addToCart = (result) => {
    setCartItems(prev => prev.some(c => c.key === result.key)
      ? prev
      : [...prev, { ...result, delta: 0 }])
    setQuery('')
    setSearchResults([])
    setShowDropdown(false)
    focusSearch()
  }

  const removeFromCart = (key) => setCartItems(prev => prev.filter(c => c.key !== key))

  const updateDelta = (key, rawValue) => {
    const n = Number(rawValue)
    setCartItems(prev => prev.map(c => c.key === key ? { ...c, delta: isNaN(n) ? 0 : n } : c))
  }

  const cartHasNegative = cartItems.some(c => c.currentStock + c.delta < 0)


  // ── Descargar plantilla ──
  const handleDownloadTemplate = async () => {
    try {
      const res = await api.get('inventory/adjustments/bulk/template', { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }))
      const a = document.createElement('a')
      a.href = url; a.download = 'ajuste_inventario.csv'; a.click()
      URL.revokeObjectURL(url)
    } catch { setError('No se pudo descargar la plantilla') }
  }

  // ── Parsear CSV ──
  const handleFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.name.endsWith('.csv')) { setError('Solo se aceptan archivos .csv'); return }
    setFileName(file.name); setError(null)
    const reader = new FileReader()
    reader.onload = ({ target }) => {
      // Quitar BOM si está presente
      const text = target.result.replace(/^\uFEFF/, '')

      // Parseamos SIN asumir encabezado todavía. Dejamos que Papa detecte
      // el delimitador (coma, tab, etc.) y decodifique las comillas de
      // escape — hacerlo "a mano" con split/startsWith se rompe en cuanto
      // el archivo pasó por Excel, que puede reescribirlo con tabs y
      // comillas envolviendo campos que contienen comillas literales.
      const raw = Papa.parse(text, { skipEmptyLines: true })
      if (raw.errors.length > 0) { setError(`Error al leer CSV: ${raw.errors[0].message}`); return }

      // Quitar filas de comentario — primera celda empieza con '#', ya
      // sobre el valor decodificado (sin comillas de escape alrededor).
      const dataRows = raw.data.filter(row => !String(row[0] ?? '').trim().startsWith('#'))

      if (dataRows.length < 2) { setError('El archivo no contiene filas de datos'); return }

      const headerRow = dataRows[0].map(h => String(h).trim().toLowerCase())
      const bodyRows = dataRows.slice(1)

      if (bodyRows.length > 500) { setError('El archivo supera el límite de 500 items'); return }

      const parsedRows = bodyRows.map(cells => {
        const obj = {}
        headerRow.forEach((h, i) => { obj[h] = cells[i] ?? '' })
        return obj
      })

      setCsvHeaders(headerRow)
      setCsvRows(parsedRows)
      setStep(STEPS.PREVIEW)
    }
    reader.readAsText(file, 'UTF-8')
  }

  // ── Enviar al backend ──
  const handleSubmit = async (items) => {
    if (!selectedBranch.branch_id) return
    if (!reason) { setError('El motivo es requerido'); return }
    setIsSaving(true); setError(null)
    try {
      const { data } = await api.post(`inventory/adjustments/bulk?branch_id=${selectedBranch.branch_id}`, { items, reason })
      setResult(data.data)
      setStep(STEPS.RESULT)
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al procesar el ajuste')
    } finally {
      setIsSaving(false)
    }
  }

  const handleReset = () => {
    setStep(STEPS.MODE); setCsvRows([]); setCsvHeaders([])
    setFileName(''); setResult(null); setError(null)
    setCartItems([]); setQuery(''); setSearchResults([]); setShowDropdown(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="inv-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="inv-modal inv-modal--lg">
        <div className="inv-modal__header">
          <h3 className="inv-modal__title">
            <i className="bi bi-clipboard2-check" />Ajuste masivo de inventario
          </h3>
          <button className="inv-modal__close" onClick={onClose} aria-label="Cerrar">
            <i className="bi bi-x-lg" />
          </button>
        </div>

        <div className="inv-modal__body">
          {error && (
            <div className="inv-alert">
              <i className="bi bi-exclamation-circle" /><span>{error}</span>
              <button onClick={() => setError(null)}><i className="bi bi-x" /></button>
            </div>
          )}

          {/* ── Paso 0: Elegir modo ── */}
          {step === STEPS.MODE && (
            <div className="inv-bulk-modes">
              <p className="inv-muted" style={{ textAlign: 'center', marginBottom: '8px' }}>
                ¿Cómo quieres ingresar los datos del ajuste?
              </p>
              <div className="inv-bulk-mode-grid">
                <button className="inv-bulk-mode-card" onClick={() => setStep(STEPS.CSV)}>
                  <i className="bi bi-file-earmark-spreadsheet" />
                  <span className="inv-bulk-mode-card__title">Subir CSV</span>
                  <span className="inv-muted">Ideal para +20 productos</span>
                </button>
                <button className="inv-bulk-mode-card" onClick={() => setStep(STEPS.TABLE)}>
                  <i className="bi bi-table" />
                  <span className="inv-bulk-mode-card__title">Tabla editable</span>
                  <span className="inv-muted">Ideal para conteos rápidos</span>
                </button>
              </div>
            </div>
          )}

          {/* ── Paso CSV ── */}
          {step === STEPS.CSV && (
            <div className="inv-bulk-upload">
              <div className="inv-bulk-upload__tip">
                <i className="bi bi-info-circle" />
                <p>Descarga la plantilla, llena la columna <strong>quantity_new</strong> con el stock final que debe quedar en cada producto y sube el archivo.</p>
              </div>
              <button className="inv-btn inv-btn--ghost" onClick={handleDownloadTemplate}>
                <i className="bi bi-download" /><span>Descargar plantilla CSV</span>
              </button>
              <label className="inv-bulk-upload__dropzone">
                <input ref={fileRef} type="file" accept=".csv"
                  style={{ display: 'none' }} onChange={handleFile} />
                <i className="bi bi-file-earmark-spreadsheet" />
                <span className="inv-bulk-upload__dropzone-title">
                  {fileName || 'Haz clic o arrastra tu archivo CSV aquí'}
                </span>
                <span className="inv-muted">Solo .csv · Máx. 500 filas</span>
              </label>
            </div>
          )}

          {/* ── Paso carrito ── */}
          {step === STEPS.TABLE && (
            <div className="inv-bulk-table-editor">
              <p className="inv-muted" style={{ fontSize: '13px', marginBottom: '4px' }}>
                Busca el producto, agrégalo al carrito y ajusta con +/- cuánto entra o sale.
              </p>

              {/* Buscador */}
              <div style={{ position: 'relative' }}>
                <div className="inv-search">
                  <i className="bi bi-search inv-search__icon" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    className="inv-search__input"
                    placeholder="Buscar por nombre o SKU..."
                    value={query}
                    onChange={e => handleQueryChange(e.target.value)}
                    onKeyDown={handleSearchKeyDown}
                    onFocus={() => { if (searchResults.length > 0) setShowDropdown(true) }}
                    onBlur={handleSearchBlur}
                    disabled={!selectedBranch?.branch_id}
                    autoFocus
                  />
                  {query && (
                    <button className="inv-search__clear" onClick={() => { handleQueryChange(''); focusSearch() }}>
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
                  <span>Busca y agrega productos para ajustar su stock</span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {cartItems.map(item => {
                    const resulting = item.currentStock + item.delta
                    const invalid = resulting < 0
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
                          <span className="inv-muted" style={{ fontSize: 11 }}>Actual</span>
                          <StockBadge qty={item.currentStock} />
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <button type="button" className="inv-action-btn"
                            onClick={() => { updateDelta(item.key, item.delta - 1); focusSearch() }}>
                            <i className="bi bi-dash" />
                          </button>
                          <input
                            type="number"
                            step="any"          // permite cualquier decimal
                            inputMode="decimal" // teclado numérico con punto en móviles
                            className="inv-field__input"
                            style={{ width: 68, textAlign: 'center' }}
                            value={item.delta}
                            onChange={e => {
                              const val = e.target.value;
                              // Si el campo queda vacío, puedes pasar 0 o mantener string temporalmente
                              updateDelta(item.key, val === '' ? 0 : parseFloat(val));
                            }}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                e.currentTarget.blur()
                                focusSearch()
                              }
                            }}
                          />
                          <button type="button" className="inv-action-btn"
                            onClick={() => { updateDelta(item.key, item.delta + 1); focusSearch() }}>
                            <i className="bi bi-plus" />
                          </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 70 }}>
                          <span className="inv-muted" style={{ fontSize: 11 }}>Quedará</span>
                          <StockBadge qty={Math.max(0, resulting)} />
                          {invalid && (
                            <span style={{ fontSize: 11, color: 'var(--inv-red, #dc2626)' }}>No puede ser negativo</span>
                          )}
                        </div>

                        <button type="button" className="inv-action-btn inv-action-btn--danger"
                          onClick={() => { removeFromCart(item.key); focusSearch() }} title="Quitar del carrito">
                          <i className="bi bi-trash" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Preview CSV ── */}
          {step === STEPS.PREVIEW && (
            <div className="inv-bulk-preview">
              <div className="inv-bulk-preview__info">
                <span><strong>{csvRows.length}</strong> items en <strong>{fileName}</strong></span>
                <button className="inv-muted" style={{ all: 'unset', cursor: 'pointer', fontSize: '12px' }}
                  onClick={handleReset}>
                  <i className="bi bi-arrow-left" /> Cambiar archivo
                </button>
              </div>
              <div className="inv-bulk-preview__table-wrap">
                <table className="inv-bulk-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      {csvHeaders.map(h => <th key={h}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {csvRows.slice(0, 5).map((row, i) => (
                      <tr key={i}>
                        <td className="inv-muted">{i + 2}</td>
                        {csvHeaders.map(h => <td key={h}>{row[h] ?? '—'}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {csvRows.length > 5 && (
                <p className="inv-muted" style={{ textAlign: 'center', fontSize: '12px' }}>
                  Mostrando 5 de {csvRows.length} filas
                </p>
              )}
            </div>
          )}

          {/* ── Resultado ── */}
          {step === STEPS.RESULT && result && (
            <div className="inv-bulk-result">
              <div className="inv-bulk-result__summary">
                <div className="inv-bulk-result__stat inv-bulk-result__stat--ok">
                  <span className="inv-bulk-result__stat-val">{result.adjusted}</span>
                  <span>Ajustados</span>
                </div>
                <div className="inv-bulk-result__stat inv-bulk-result__stat--muted">
                  <span className="inv-bulk-result__stat-val">{result.skipped}</span>
                  <span>Sin cambio</span>
                </div>
                <div className={`inv-bulk-result__stat ${result.failed > 0 ? 'inv-bulk-result__stat--err' : 'inv-bulk-result__stat--muted'}`}>
                  <span className="inv-bulk-result__stat-val">{result.failed}</span>
                  <span>Con error</span>
                </div>
              </div>
              {result.failed_detail?.length > 0 && (
                <div className="inv-bulk-errors">
                  <span className="inv-form-section__label">Filas con error</span>
                  {result.failed_detail.map((f, i) => (
                    <div key={i} className="inv-bulk-error-row">
                      <span className="inv-muted">Fila {f.row}</span>
                      <span>{f.sku ?? f.product_id ?? '—'}</span>
                      <span className="inv-red">{f.reason}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Motivo (siempre visible excepto en selector de modo y resultado) ── */}
          {![STEPS.MODE, STEPS.RESULT].includes(step) && (
            <div className="inv-field">
              <label className="inv-field__label">
                Motivo del ajuste <span className="inv-field__req">*</span>
              </label>
              <select className="inv-field__input inv-field__select"
                value={reason} onChange={e => setReason(e.target.value)}>
                {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          )}

          {/* ── Footer ── */}
          <div className="inv-modal__footer">
            {step === STEPS.MODE && (
              <button className="inv-btn inv-btn--ghost" onClick={onClose}>Cancelar</button>
            )}
            {step === STEPS.CSV && (
              <button className="inv-btn inv-btn--ghost" onClick={handleReset}>
                <i className="bi bi-arrow-left" /> Atrás
              </button>
            )}
            {step === STEPS.TABLE && (
              <>
                <button className="inv-btn inv-btn--ghost" onClick={handleReset}>
                  <i className="bi bi-arrow-left" /> Atrás
                </button>
                <button className="inv-btn inv-btn--primary"
                  onClick={() => handleSubmit(cartItems.map(c => ({
                    product_id: c.product_id,
                    variant_id: c.variant_id,
                    quantity_new: c.currentStock + c.delta,
                  })))}
                  disabled={isSaving || cartItems.length === 0 || cartHasNegative}>
                  {isSaving
                    ? <><span className="inv-spinner inv-spinner--white" /> Aplicando...</>
                    : <><i className="bi bi-check-lg" /> Aplicar {cartItems.length} ajuste{cartItems.length !== 1 ? 's' : ''}</>
                  }
                </button>
              </>
            )}
            {step === STEPS.PREVIEW && (
              <>
                <button className="inv-btn inv-btn--ghost" onClick={handleReset}>
                  <i className="bi bi-arrow-left" /> Atrás
                </button>
                <button className="inv-btn inv-btn--primary"
                  onClick={() => handleSubmit(csvRows)} disabled={isSaving}>
                  {isSaving
                    ? <><span className="inv-spinner inv-spinner--white" /> Aplicando...</>
                    : <><i className="bi bi-check-lg" /> Aplicar {csvRows.length} ajustes</>
                  }
                </button>
              </>
            )}
            {step === STEPS.RESULT && (
              <>
                {result?.failed > 0 && (
                  <button className="inv-btn inv-btn--ghost" onClick={handleReset}>
                    <i className="bi bi-arrow-repeat" /> Nuevo ajuste
                  </button>
                )}
                <button className="inv-btn inv-btn--primary" onClick={onDone}>
                  <i className="bi bi-check-lg" /> Finalizar
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default BulkAdjustModal