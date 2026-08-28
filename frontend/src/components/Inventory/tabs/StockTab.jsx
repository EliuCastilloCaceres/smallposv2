// src/components/Inventory/tabs/StockTab.jsx
import { useState, useEffect, useCallback, useRef } from 'react'
import { useUser } from '../../../context/UserContext'
import api from '../../../services/api'
import AdjustDrawer   from '../drawers/AdjustDrawer'
import BulkAdjustModal from '../modals/BulkAdjustModal'
import PrintBarcodesModal from '../modals/PrintBarcodesModal'

const PAGE_SIZE = 30

// ── Stock badge ───────────────────────────────────────────────────────────────
export const StockBadge = ({ qty }) => {
  const n     = Number(qty)
  const level = n === 0 ? 'empty' : n <= 5 ? 'low' : 'ok'
  return <span className={`inv-stock inv-stock--${level}`}>{n}</span>
}

const StockTab = ({ canAdjust, isAdmin, branchId }) => {
  const { user } = useUser()

  const [stock,      setStock]      = useState([])
  const [pagination, setPagination] = useState({ total: 0, page: 1, totalPages: 1 })
  const [isLoading,  setIsLoading]  = useState(true)
  const [error,      setError]      = useState(null)
  const [search,     setSearch]     = useState('')
  const [lowOnly,    setLowOnly]    = useState(false)
  const [page,       setPage]       = useState(1)

  // Filtro por categoría
  const [categories,       setCategories]       = useState([])
  const [categoryId,       setCategoryId]       = useState('')
  const categoryRef = useRef('')

  // Drawer de ajuste rápido
  const [adjustTarget, setAdjustTarget] = useState(null) // { product, variant? }
  const [bulkOpen,     setBulkOpen]     = useState(false)

  // Impresión de códigos de barras
  const [printItems, setPrintItems] = useState(null) // array de renglones o null (cerrado)

  const searchTimer = useRef(null)
  const searchRef   = useRef('')
  const lowRef      = useRef(false)

  const fetchStock = useCallback(async (currentPage = 1) => {
     if (!branchId) return 
    setIsLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ page: currentPage, limit: PAGE_SIZE })
      if (searchRef.current)   params.set('search',      searchRef.current)
      if (lowRef.current)      params.set('low_stock',   'true')
      if (categoryRef.current) params.set('category_id', categoryRef.current)
      // Siempre mandar branch_id — para admin viene de BranchContext,
      // para usuarios normales también (BranchContext lo toma del token).
      params.set('branch_id', branchId)

      const { data } = await api.get(`inventory/stock?${params}`)
      console.log(data)
      setStock(data.data)
      setPagination(data.pagination)
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al cargar el stock')
    } finally {
      setIsLoading(false)
    }
  }, [branchId])

  useEffect(() => { fetchStock(page) }, [page, fetchStock])

  // Cargar categorías una sola vez para poblar el filtro
  useEffect(() => {
    api.get('categories', { params: { is_active: true } })
      .then(({ data }) => setCategories(data.data ?? []))
      .catch(() => {}) // el filtro es opcional — si falla, la tab sigue usable sin él
  }, [])

  const handleCategoryChange = (val) => {
    categoryRef.current = val
    setCategoryId(val)
    setPage(prev => { if (prev === 1) { fetchStock(1); return 1 } return 1 })
  }

  const handleSearch = (val) => {
    searchRef.current = val
    setSearch(val)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      setPage(prev => { if (prev === 1) { fetchStock(1); return 1 } return 1 })
    }, 400)
  }

  const handleLowOnly = () => {
    const next = !lowOnly
    lowRef.current = next
    setLowOnly(next)
    setPage(prev => { if (prev === 1) { fetchStock(1); return 1 } return 1 })
  }

  const handleAdjustDone = () => {
    setAdjustTarget(null)
    fetchStock(page)
  }

  const handleBulkDone = () => {
    setBulkOpen(false)
    fetchStock(1)
  }

  // ── Impresión de códigos de barras ──────────────────────────────────────────
  // Resuelve un producto a sus renglones imprimibles: SKU propio si es simple,
  // o un renglón por cada variante si es variable (nunca el SKU del padre).
  const buildPrintRows = (product) => {
    if (product.is_variable) {
      return product.variants.map(v => ({
        key:  `v-${v.variant_id}`,
        sku:  v.sku,
        name: `${product.name} — ${v.label}`,
        qty:  v.quantity,
      }))
    }
    return [{
      key:  `p-${product.product_id}`,
      sku:  product.sku,
      name: product.name,
      qty:  product.total_stock,
    }]
  }

  const handlePrintAll = () => {
    setPrintItems(stock.flatMap(buildPrintRows))
  }

  const handlePrintProduct = (product) => {
    setPrintItems(buildPrintRows(product))
  }

  const handlePrintVariant = (product, variant) => {
    setPrintItems([{
      key:  `v-${variant.variant_id}`,
      sku:  variant.sku,
      name: `${product.name} — ${variant.label}`,
      qty:  variant.quantity,
    }])
  }

  return (
    <div className="inv-section">
      {/* ── Toolbar ── */}
      <div className="inv-toolbar">
        <div className="inv-search">
          <i className="bi bi-search inv-search__icon" />
          <input type="text" className="inv-search__input"
            placeholder="Buscar por nombre o SKU..."
            value={search} onChange={e => handleSearch(e.target.value)} />
          {search && (
            <button className="inv-search__clear" onClick={() => handleSearch('')}>
              <i className="bi bi-x" />
            </button>
          )}
        </div>
        
        {categories.length > 0 && (
          <select
            className="inv-select"
            value={categoryId}
            onChange={e => handleCategoryChange(e.target.value)}
            title="Filtrar por categoría"
          >
            <option value="">Todas las categorías</option>
            {categories.map(c => (
              <option key={c.category_id} value={c.category_id}>{c.name}</option>
            ))}
          </select>
        )}

        <button
          className={`inv-btn ${lowOnly ? 'inv-btn--warn-active' : 'inv-btn--ghost'}`}
          onClick={handleLowOnly}
          title="Mostrar solo stock bajo o sin stock"
        >
          <i className="bi bi-exclamation-triangle" />
          <span className="inv-btn__label">Stock bajo</span>
        </button>

        <button
          className="inv-btn inv-btn--ghost"
          onClick={handlePrintAll}
          disabled={stock.length === 0}
          title="Imprimir códigos de barras de los productos listados"
        >
          <i className="bi bi-upc-scan" />
          <span className="inv-btn__label">Imprimir códigos</span>
        </button>

        {canAdjust && (
          <button className="inv-btn inv-btn--ghost" onClick={() => setBulkOpen(true)}>
            <i className="bi bi-upload" />
            <span className="inv-btn__label">Ajuste masivo</span>
          </button>
        )}
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="inv-alert">
          <i className="bi bi-exclamation-circle" /><span>{error}</span>
          <button onClick={() => setError(null)}><i className="bi bi-x" /></button>
        </div>
      )}

      {/* ── Skeleton ── */}
      {isLoading ? (
        <div className="inv-skeleton">
          {[...Array(6)].map((_, i) => <div key={i} className="inv-skeleton__row" />)}
        </div>
      ) : stock.length === 0 ? (
        <div className="inv-empty">
          <i className="bi bi-boxes" />
          <span>{lowOnly ? 'No hay productos con stock bajo' : 'No se encontraron productos'}</span>
        </div>
      ) : (
        <>
          {/* ── Tabla (desktop) ── */}
          <div className="inv-table-wrap">
            <table className="inv-table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Categoría</th>
                  <th className="num">Stock total</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {stock.map(product => (
                  Boolean(product.is_variable) ? (
                    // ── Producto variable — expandible ──
                    <ProductVariableRow
                      key={product.product_id}
                      product={product}
                      canAdjust={canAdjust}
                      onAdjust={setAdjustTarget}
                      onPrintProduct={handlePrintProduct}
                      onPrintVariant={handlePrintVariant}
                    />
                  ) : (
                    // ── Producto simple ──
                    <tr key={product.product_id}>
                      <td>
                        <div className="inv-product-cell">
                          <div className="inv-thumb">
                            {product.image
                              ? <img src={product.image} alt={product.name} onError={e => e.target.style.display='none'} />
                              : <i className="bi bi-box-seam" />
                            }
                          </div>
                          <div>
                            <span className="inv-product-name">{product.name}</span>
                            {product.sku && <span className="inv-sku">SKU: {product.sku}</span>}
                          </div>
                        </div>
                      </td>
                      <td>
                        {product.category_name
                          ? <span className="inv-cat-badge" style={{
                              background: product.category_color ? `${product.category_color}20` : 'var(--inv-accent-bg)',
                              color: product.category_color ?? 'var(--inv-accent)',
                            }}>{product.category_name}</span>
                          : <span className="inv-muted">—</span>
                        }
                      </td>
                      <td className="num"><StockBadge qty={product.total_stock} /></td>
                      <td>
                        <div className="inv-actions">
                          {canAdjust && (
                            <button className="inv-action-btn"
                              title="Ajustar stock"
                              onClick={() => setAdjustTarget({ product, variant: null })}>
                              <i className="bi bi-sliders" />
                            </button>
                          )}
                           <button className="inv-action-btn"
                            title="Imprimir código de barras"
                            onClick={() => handlePrintProduct(product)}>
                            <i className="bi bi-upc-scan" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Cards (móvil) ── */}
          <div className="inv-cards">
            {stock.map(product => (
              <div key={product.product_id} className="inv-stock-card">
                <div className="inv-stock-card__top">
                  <div className="inv-product-cell">
                    <div className="inv-thumb">
                      {product.image
                        ? <img src={product.image} alt={product.name} onError={e => e.target.style.display='none'} />
                        : <i className="bi bi-box-seam" />
                      }
                    </div>
                    <div>
                      <span className="inv-product-name">{product.name}</span>
                      {product.sku && <span className="inv-sku">SKU: {product.sku}</span>}
                    </div>
                  </div>
                  <StockBadge qty={product.total_stock} />
                </div>

                {/* Variantes en móvil */}
                {!!product.is_variable && product.variants.length > 0 &&  (
                  <div className="inv-variants-list">
                    <button className="inv-btn inv-btn--ghost inv-stock-card__adjust"
                      onClick={() => handlePrintProduct(product)}>
                      <i className="bi bi-upc-scan" /><span>Imprimir todas las variantes</span>
                    </button>
                    {product.variants.map(v => (
                      <div key={v.variant_id} className="inv-variant-row">
                        <span className="inv-muted">{v.label}</span>
                        <div className="inv-variant-row__right">
                          <StockBadge qty={v.quantity} />
                          <button className="inv-action-btn inv-action-btn--sm"
                            title="Imprimir código de barras"
                            onClick={() => handlePrintVariant(product, v)}>
                            <i className="bi bi-upc-scan" />
                          </button>
                          {canAdjust && (
                            <button className="inv-action-btn inv-action-btn--sm"
                              onClick={() => setAdjustTarget({ product, variant: v })}>
                              <i className="bi bi-sliders" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {!product.is_variable && (
                  <div className="inv-stock-card__actions">
                    <button className="inv-btn inv-btn--ghost inv-stock-card__adjust"
                      onClick={() => handlePrintProduct(product)}>
                      <i className="bi bi-upc-scan" /><span>Imprimir código</span>
                    </button>
                    {canAdjust && (
                      <button className="inv-btn inv-btn--ghost inv-stock-card__adjust"
                        onClick={() => setAdjustTarget({ product, variant: null })}>
                        <i className="bi bi-sliders" /><span>Ajustar stock</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* ── Paginación ── */}
          {pagination.totalPages > 1 && (
            <div className="inv-pagination">
              <button className="inv-btn inv-btn--ghost inv-btn--icon"
                onClick={() => setPage(p => p - 1)} disabled={page === 1}>
                <i className="bi bi-chevron-left" />
              </button>
              <span className="inv-pagination__info">
                Página <strong>{page}</strong> de <strong>{pagination.totalPages}</strong>
              </span>
              <button className="inv-btn inv-btn--ghost inv-btn--icon"
                onClick={() => setPage(p => p + 1)} disabled={page === pagination.totalPages}>
                <i className="bi bi-chevron-right" />
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Drawer de ajuste rápido ── */}
      {adjustTarget && (
        <AdjustDrawer
          product={adjustTarget.product}
          variant={adjustTarget.variant}
          onDone={handleAdjustDone}
          onClose={() => setAdjustTarget(null)}
        />
      )}

      {/* ── Modal ajuste masivo ── */}
      {bulkOpen && (
        <BulkAdjustModal
          onDone={handleBulkDone}
          onClose={() => setBulkOpen(false)}
        />
      )}

      {/* ── Modal imprimir códigos de barras ── */}
      {printItems && (
        <PrintBarcodesModal
          items={printItems}
          onClose={() => setPrintItems(null)}
        />
      )}
    </div>
  )
}

// ── Fila de producto variable con expand/collapse ─────────────────────────────
const ProductVariableRow = ({ product, canAdjust, onAdjust, onPrintProduct, onPrintVariant }) => {
  const [expanded, setExpanded] = useState(false)

  return (
    <>
      <tr className="inv-row-variable" onClick={() => setExpanded(e => !e)}>
        <td>
          <div className="inv-product-cell">
            <div className="inv-thumb">
              {product.image
                ? <img src={product.image} alt={product.name} onError={e => e.target.style.display='none'} />
                : <i className="bi bi-box-seam" />
              }
            </div>
            <div>
              <span className="inv-product-name">{product.name}</span>
              {product.sku && <span className="inv-sku">SKU: {product.sku}</span>}
              <span className="inv-badge-variable"><i className="bi bi-layers" /> Variable</span>
            </div>
          </div>
        </td>
        <td>
          {product.category_name
            ? <span className="inv-cat-badge" style={{
                background: product.category_color ? `${product.category_color}20` : 'var(--inv-accent-bg)',
                color: product.category_color ?? 'var(--inv-accent)',
              }}>{product.category_name}</span>
            : <span className="inv-muted">—</span>
          }
        </td>
        <td className="num"><StockBadge qty={product.total_stock} /></td>
        <td>
          <div className="inv-actions">
            <button className="inv-action-btn"
              title="Imprimir códigos de todas las variantes"
              onClick={e => { e.stopPropagation(); onPrintProduct(product) }}>
              <i className="bi bi-upc-scan" />
            </button>
          </div>
        </td>
      </tr>

      {/* Filas de variantes */}
      {expanded && product.variants.map(v => (
        <tr key={v.variant_id} className="inv-row-variant">
          <td>
            <div className="inv-variant-cell">
              <span className="inv-variant-label">{v.label}</span>
              {v.sku && <span className="inv-sku">SKU: {v.sku}</span>}
            </div>
          </td>
          <td />
          <td className="num"><StockBadge qty={v.quantity} /></td>
          <td>
            <div className="inv-actions">
              <button className="inv-action-btn" title="Imprimir código de barras"
                onClick={() => onPrintVariant(product, v)}>
                <i className="bi bi-upc-scan" />
              </button>
              {canAdjust && (
                <button className="inv-action-btn" title="Ajustar esta variante"
                  onClick={() => onAdjust({ product, variant: v })}>
                  <i className="bi bi-sliders" />
                </button>
              )}
            </div>
          </td>
        </tr>
      ))}
    </>
  )
}

export default StockTab