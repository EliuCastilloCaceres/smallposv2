// src/components/Purchases/PurchaseLines.jsx
// Líneas de una compra (specs/14-modulo-de-compras.md, requisito 33): el
// buscador de productos y la lista de líneas con cantidad, costo unitario y
// subtotal. Una sola lista que en móvil se ve como tarjetas.
//
// Buscador (GET /purchases/products): busca mientras se escribe. Enter busca
// de inmediato y resuelve por SKU exacto, que es lo que manda el lector de
// códigos de barras:
//  - SKU de un producto simple o de una variante → se agrega solo;
//  - SKU de un producto variable → muestra sus variantes para elegir;
//  - sin coincidencia exacta → se queda como búsqueda normal.
// Si el producto ya está en la compra, se suma 1 a su cantidad.
import { useEffect, useRef, useState } from 'react'
import api from '../../services/api'
import { addLine, lineLabel, lineSubtotal, money } from './purchaseForm'

const SEARCH_DELAY = 350

// Una opción del desplegable por producto simple o por variante
const toOptions = (products) => products.flatMap(p => (
  p.is_variable
    ? p.variants.map(v => ({ key: `${p.product_id}:${v.variant_id}`, product: p, variant: v }))
    : [{ key: `${p.product_id}:0`, product: p, variant: null }]
))

const PurchaseLines = ({ branchId, lines, onChange }) => {
  const [query,       setQuery]       = useState('')
  const [results,     setResults]     = useState([])
  const [isSearching, setIsSearching] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [notFound,    setNotFound]    = useState(false)
  const searchTimer = useRef(null)
  const searchInput = useRef(null)

  useEffect(() => () => clearTimeout(searchTimer.current), [])

  const fetchProducts = async (q) => {
    const params = { search: q }
    if (branchId) params.branch_id = branchId
    const { data } = await api.get('purchases/products', { params })
    return data.data ?? []
  }

  const runSearch = async (q) => {
    setIsSearching(true)
    try {
      const products = await fetchProducts(q)
      setResults(toOptions(products))
      setNotFound(products.length === 0)
      setShowResults(true)
    } catch {
      setResults([])
    } finally {
      setIsSearching(false)
    }
  }

  const changeQuery = (value) => {
    setQuery(value)
    clearTimeout(searchTimer.current)
    if (!value.trim()) { setResults([]); setShowResults(false); setNotFound(false); return }
    searchTimer.current = setTimeout(() => runSearch(value.trim()), SEARCH_DELAY)
  }

  const add = (product, variant) => {
    onChange(addLine(lines, product, variant))
    setQuery('')
    setResults([])
    setShowResults(false)
    setNotFound(false)
    searchInput.current?.focus()
  }

  const handleKeyDown = async (e) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const q = query.trim()
    if (!q) return
    clearTimeout(searchTimer.current)

    setIsSearching(true)
    let products = []
    try {
      products = await fetchProducts(q)
    } catch {
      products = []
    } finally {
      setIsSearching(false)
    }

    const sku = q.toLowerCase()
    const simple = products.find(p => !p.is_variable && p.sku?.toLowerCase() === sku)
    if (simple) { add(simple, null); return }
    for (const p of products) {
      const variant = p.variants.find(v => v.sku?.toLowerCase() === sku)
      if (variant) { add(p, variant); return }
    }
    const parent = products.find(p => p.is_variable && p.sku?.toLowerCase() === sku)
    setResults(toOptions(parent ? [parent] : products))
    setNotFound(products.length === 0)
    setShowResults(true)
  }

  const updateLine = (key, field, value) =>
    onChange(lines.map(l => (l.key === key ? { ...l, [field]: value } : l)))

  const removeLine = (key) => onChange(lines.filter(l => l.key !== key))

  return (
    <div className="pur-lines">
      <div className="pur-line-search">
        <i className="bi bi-upc-scan" aria-hidden="true" />
        <input ref={searchInput} type="search" className="pur-field__input" aria-label="Buscar producto"
          placeholder="Busca por nombre o SKU, o escanea el código"
          value={query} onChange={e => changeQuery(e.target.value)} onKeyDown={handleKeyDown} />
        {isSearching && <span className="pur-spinner pur-spinner--dark pur-line-search__spinner" />}

        {showResults && (
          <ul className="pur-line-results" role="listbox" aria-label="Productos encontrados">
            {notFound && <li className="pur-line-results__empty">No se encontraron productos activos</li>}
            {results.map(({ key, product, variant }) => (
              <li key={key}>
                <button type="button" role="option" aria-selected="false" className="pur-line-results__option"
                  onClick={() => add(product, variant)}>
                  <span className="pur-line-results__name">
                    {product.name}{variant && <strong> · {variant.label}</strong>}
                  </span>
                  <span className="pur-td-muted">
                    {(variant?.sku ?? product.sku) && <>SKU {variant?.sku ?? product.sku} · </>}
                    Costo {money(product.purchase_price)}
                    {(variant ?? product).stock !== null && <> · Stock {(variant ?? product).stock} {product.uom}</>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {lines.length === 0 ? (
        <div className="pur-lines__empty">
          <i className="bi bi-box-seam" />
          <span>Busca o escanea los productos que recibiste</span>
        </div>
      ) : (
        <ul className="pur-line-list" aria-label="Productos de la compra">
          {lines.map((line, i) => {
            const label = lineLabel(line)
            const subtotal = lineSubtotal(line)
            return (
              <li key={line.key} className="pur-line">
                <div className="pur-line__product">
                  <span className="pur-line__index">{i + 1}</span>
                  <div>
                    <span className="pur-line__name">{label}</span>
                    <span className="pur-td-muted">
                      {line.sku && <>SKU {line.sku} · </>}Costo actual {money(line.currentCost)}
                    </span>
                  </div>
                </div>
                <label className="pur-line__field">
                  <span>Cantidad ({line.uom})</span>
                  <input className="pur-field__input" type="number" inputMode="decimal" min="0.001" step="any"
                    aria-label={`Cantidad de ${label}`}
                    value={line.quantity} onChange={e => updateLine(line.key, 'quantity', e.target.value)} />
                </label>
                <label className="pur-line__field">
                  <span>Costo unitario</span>
                  <input className="pur-field__input" type="number" inputMode="decimal" min="0.01" step="0.01"
                    aria-label={`Costo unitario de ${label}`} placeholder="0.00"
                    value={line.unitCost} onChange={e => updateLine(line.key, 'unitCost', e.target.value)} />
                </label>
                <div className="pur-line__subtotal">
                  <span>Subtotal</span>
                  <strong aria-label={`Subtotal de ${label}`}>{subtotal === null ? '—' : money(subtotal)}</strong>
                </div>
                <button type="button" className="pur-btn pur-btn--ghost pur-btn--icon pur-line__remove"
                  aria-label={`Quitar ${label}`} onClick={() => removeLine(line.key)}>
                  <i className="bi bi-trash" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export default PurchaseLines
