// src/components/Products/Products.jsx
import { useState, useEffect, useCallback, useRef } from 'react'
import { useUser }   from '../../Context/UserContext'
import api from '../../services/api'
import ProductModal      from './modals/ProductModal'
import ProductDetailModal from './modals/ProductDetailModal'
import BulkUploadModal   from './modals/BulkUploadModal'
import ConfirmDialog     from '../Common/ConfirmDialog'
import './products.css'

const PAGE_SIZE = 20

// ── Stock badge ───────────────────────────────────────────────────────────────
export const StockBadge = ({ stock }) => {
  const n     = Number(stock)
  const level = n === 0 ? 'empty' : n <= 5 ? 'low' : 'ok'
  const label = n === 0 ? 'Sin stock' : n <= 5 ? `${n} (bajo)` : n
  return <span className={`prd-stock prd-stock--${level}`}>{label}</span>
}

// ── Precio formateado ─────────────────────────────────────────────────────────
const fmtMXN = (v) =>
  `$${Number(v ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`

// ── Componente principal ──────────────────────────────────────────────────────
const Products = () => {
  const { user, isAdmin, hasPermission } = useUser()
  const canCreate = hasPermission('products', 'create')
  const canEdit   = hasPermission('products', 'update')

  const [products,      setProducts]      = useState([])
  const [pagination,    setPagination]    = useState({ total: 0, page: 1, totalPages: 1 })
  const [isLoading,     setIsLoading]     = useState(true)
  const [error,         setError]         = useState(null)

  // Filtros
  const [search,        setSearch]        = useState('')
  const [filterCat,     setFilterCat]     = useState('')
  const [filterProv,    setFilterProv]    = useState('')
  const [filterStatus,  setFilterStatus]  = useState('')
  const [categories,    setCategories]    = useState([])
  const [providers,     setProviders]     = useState([])
  const [page,          setPage]          = useState(1)

  // Modales
  const [modal,         setModal]         = useState({ open: false, product: null })
  const [detailId,      setDetailId]      = useState(null)
  const [bulkOpen,      setBulkOpen]      = useState(false)
  const [confirmTarget, setConfirmTarget] = useState(null)
  const [toggling,      setToggling]      = useState(null)

  // Refs para debounce
  const searchTimer = useRef(null)
  const searchRef   = useRef('')
  const catRef      = useRef('')
  const provRef     = useRef('')
  const statusRef   = useRef('')

  // ── Cargar filtros de referencia ──
  useEffect(() => {
    api.get('categories?is_active=true&limit=all')
      .then(({ data }) => {
        console.log('categorias:',data)
        setCategories(data.data)
      })
      .catch(() => {})
    api.get('providers?is_active=true&limit=all')
      .then(({ data }) => {
        console.log(data)
        setProviders(data.data ?? data)
      })
      .catch(() => {})
  }, [])

  // ── Fetch productos ──
  const fetchProducts = useCallback(async (currentPage = 1) => {
    setIsLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ page: currentPage, limit: PAGE_SIZE })
      if (searchRef.current) params.set('search',      searchRef.current)
      if (catRef.current)    params.set('category_id', catRef.current)
      if (provRef.current)   params.set('provider_id', provRef.current)
      if (statusRef.current) params.set('is_active',   statusRef.current)

      // Catálogo global — no se filtra por sucursal

      const { data } = await api.get(`products?${params}`)
      setProducts(data.data)
      setPagination(data.pagination)
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al cargar productos')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchProducts(page) }, [page, fetchProducts])

  // ── Búsqueda con debounce ──
  const handleSearch = (val) => {
    searchRef.current = val
    setSearch(val)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      setPage(prev => { if (prev === 1) { fetchProducts(1); return 1 } return 1 })
    }, 400)
  }

  const handleFilter = (setter, ref) => (e) => {
    ref.current = e.target.value
    setter(e.target.value)
    setPage(prev => { if (prev === 1) { fetchProducts(1); return 1 } return 1 })
  }

  // ── Toggle status ──
  const handleToggle = (product) => {
    if (product.is_active) { setConfirmTarget(product); return }
    performToggle(product)
  }

  const performToggle = async (product) => {
    setToggling(product.product_id)
    try {
      const { data } = await api.patch(`products/${product.product_id}/status`, {
        is_active: !product.is_active,
      })
      setProducts(prev => prev.map(p =>
        p.product_id === product.product_id ? data.data : p
      ))
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al cambiar estado')
    } finally {
      setToggling(null)
    }
  }

  // ── Guardar ──
  const handleSaved = (saved) => {
    setProducts(prev => {
      const exists = prev.find(p => p.product_id === saved.product_id)
      return exists
        ? prev.map(p => p.product_id === saved.product_id ? saved : p)
        : [saved, ...prev]
    })
    setModal({ open: false, product: null })
  }

  const handleBulkDone = () => {
    setBulkOpen(false)
    fetchProducts(1)
  }

  return (
    <div className="prd-root">
      {/* ── Header ── */}
      <div className="prd-header">
        <div>
          <h1 className="prd-header__title">Productos</h1>
          <span className="prd-header__sub">
            {pagination.total} producto{pagination.total !== 1 ? 's' : ''} encontrado{pagination.total !== 1 ? 's' : ''}
          </span>
        </div>
        {canCreate && (
          <div className="prd-header__actions">
            <button
              className="prd-btn prd-btn--ghost"
              onClick={() => setBulkOpen(true)}
              title="Carga masiva"
            >
              <i className="bi bi-upload" />
              <span className="prd-btn__label">Importar CSV</span>
            </button>
            <button
              className="prd-btn prd-btn--primary"
              onClick={() => setModal({ open: true, product: null })}
            >
              <i className="bi bi-plus-lg" />
              <span>Nuevo producto</span>
            </button>
          </div>
        )}
      </div>

      {/* ── Filtros ── */}
      <div className="prd-filters">
        <div className="prd-search">
          <i className="bi bi-search prd-search__icon" />
          <input
            type="text"
            className="prd-search__input"
            placeholder="Buscar por nombre, SKU..."
            value={search}
            onChange={e => handleSearch(e.target.value)}
          />
          {search && (
            <button className="prd-search__clear" onClick={() => handleSearch('')}>
              <i className="bi bi-x" />
            </button>
          )}
        </div>

        {categories.length > 0 && (
          <select className="prd-select" value={filterCat}
            onChange={handleFilter(setFilterCat, catRef)}>
            <option value="">Todas las categorías</option>
            {categories.map(c => (
              <option key={c.category_id} value={c.category_id}>{c.name}</option>
            ))}
          </select>
        )}

        {providers.length > 0 && (
          <select className="prd-select" value={filterProv}
            onChange={handleFilter(setFilterProv, provRef)}>
            <option value="">Todos los proveedores</option>
            {providers.map(p => (
              <option key={p.provider_id} value={p.provider_id}>{p.name}</option>
            ))}
          </select>
        )}

        <select className="prd-select" value={filterStatus}
          onChange={handleFilter(setFilterStatus, statusRef)}>
          <option value="">Solo activos</option>
          <option value="true">Activos</option>
          <option value="false">Inactivos</option>
        </select>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="prd-alert">
          <i className="bi bi-exclamation-circle" />
          <span>{error}</span>
          <button onClick={() => setError(null)}><i className="bi bi-x" /></button>
        </div>
      )}

      {/* ── Contenido ── */}
      {isLoading ? (
        <div className="prd-skeleton">
          {[...Array(5)].map((_, i) => <div key={i} className="prd-skeleton__row" />)}
        </div>
      ) : products.length === 0 ? (
        <div className="prd-empty">
          <i className="bi bi-boxes" />
          <span>No se encontraron productos</span>
          {canCreate && (
            <button className="prd-btn prd-btn--primary"
              onClick={() => setModal({ open: true, product: null })}>
              <i className="bi bi-plus-lg" /> Crear primer producto
            </button>
          )}
        </div>
      ) : (
        <>
          {/* ── Tabla (desktop) ── */}
          <div className="prd-table-wrap">
            <table className="prd-table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Categoría</th>
                  <th>Proveedor</th>
                  <th>UM</th>
                  <th className="num">Precio venta</th>
                  <th>Estado</th>
                  {canEdit && <th></th>}
                </tr>
              </thead>
              <tbody>
                {products.map(p => (
                  <tr key={p.product_id} className={!p.is_active ? 'prd-row--inactive' : ''}>
                    <td>
                      <div className="prd-product-cell">
                        <div className="prd-thumb">
                          {p.image
                            ? <img src={p.image} alt={p.name} onError={e => e.target.style.display='none'} />
                            : <i className="bi bi-box-seam" />
                          }
                        </div>
                        <div className="prd-product-info">
                          <button className="prd-product-name"
                            onClick={() => setDetailId(p.product_id)}>
                            {p.name}
                          </button>
                          {p.sku && <span className="prd-sku">SKU: {p.sku}</span>}
                          {!!p.is_variable && (
                            <span className="prd-badge-variable">
                              <i className="bi bi-layers" /> Variable
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      {p.category_name
                        ? (
                          <span className="prd-cat-badge" style={{
                            background: p.category_color
                              ? `${p.category_color}20`
                              : 'var(--prd-accent-bg)',
                            color: p.category_color ?? 'var(--prd-accent)',
                          }}>
                            {p.category_name}
                          </span>
                        )
                        : <span className="prd-muted">—</span>
                      }
                    </td>
                    <td className="prd-muted">{p.provider_name ?? '—'}</td>
                    <td>
                      <span className="prd-uom-badge">{p.uom ?? '—'}</span>
                    </td>
                    <td className="num">{fmtMXN(p.sale_price)}</td>
                    <td>
                      <span className={`prd-status ${p.is_active ? 'prd-status--on' : 'prd-status--off'}`}>
                        <span className="prd-status__dot" />
                        {p.is_active ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    {canEdit && (
                      <td>
                        <div className="prd-actions">
                          <button className="prd-action-btn" title="Editar"
                            onClick={() => setModal({ open: true, product: p })}>
                            <i className="bi bi-pencil" />
                          </button>
                          <button
                            className={`prd-action-btn ${p.is_active ? 'prd-action-btn--danger' : ''}`}
                            title={p.is_active ? 'Desactivar' : 'Activar'}
                            onClick={() => handleToggle(p)}
                            disabled={toggling === p.product_id}
                          >
                            {toggling === p.product_id
                              ? <span className="prd-spinner" />
                              : <i className={`bi ${p.is_active ? 'bi-slash-circle' : 'bi-check-circle'}`} />
                            }
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Cards (móvil) ── */}
          <div className="prd-cards">
            {products.map(p => (
              <div key={p.product_id}
                className={`prd-card ${!p.is_active ? 'prd-card--inactive' : ''}`}>
                <div className="prd-card__top">
                  <div className="prd-product-cell">
                    <div className="prd-thumb">
                      {p.image
                        ? <img src={p.image} alt={p.name} onError={e => e.target.style.display='none'} />
                        : <i className="bi bi-box-seam" />
                      }
                    </div>
                    <div className="prd-product-info">
                      <button className="prd-product-name"
                        onClick={() => setDetailId(p.product_id)}>
                        {p.name}
                      </button>
                      {p.sku && <span className="prd-sku">SKU: {p.sku}</span>}
                    </div>
                  </div>
                  <span className={`prd-status ${p.is_active ? 'prd-status--on' : 'prd-status--off'}`}>
                    <span className="prd-status__dot" />
                    {p.is_active ? 'Activo' : 'Inactivo'}
                  </span>
                </div>

                <div className="prd-card__meta">
                  {p.category_name && (
                    <span className="prd-cat-badge" style={{
                      background: p.category_color ? `${p.category_color}20` : 'var(--prd-accent-bg)',
                      color: p.category_color ?? 'var(--prd-accent)',
                    }}>
                      {p.category_name}
                    </span>
                  )}
                  {p.provider_name && (
                    <span className="prd-muted">
                      <i className="bi bi-truck" />{p.provider_name}
                    </span>
                  )}
                  {!!p.is_variable && (
                    <span className="prd-badge-variable">
                      <i className="bi bi-layers" />Variable
                    </span>
                  )}
                </div>

                <div className="prd-card__prices">
                  <div className="prd-card__price-item">
                    <span className="prd-muted">Venta</span>
                    <strong>{fmtMXN(p.sale_price)}</strong>
                  </div>
                  <div className="prd-card__price-item">
                    <span className="prd-muted">UM</span>
                    <span className="prd-uom-badge">{p.uom ?? '—'}</span>
                  </div>
                </div>

                {canEdit && (
                  <div className="prd-card__actions">
                    <button className="prd-btn prd-btn--ghost"
                      onClick={() => setModal({ open: true, product: p })}>
                      <i className="bi bi-pencil" /><span>Editar</span>
                    </button>
                    <button
                      className={`prd-btn ${p.is_active ? 'prd-btn--danger-ghost' : 'prd-btn--ghost'}`}
                      onClick={() => handleToggle(p)}
                      disabled={toggling === p.product_id}
                    >
                      {toggling === p.product_id
                        ? <span className="prd-spinner" />
                        : <i className={`bi ${p.is_active ? 'bi-slash-circle' : 'bi-check-circle'}`} />
                      }
                      <span>{p.is_active ? 'Desactivar' : 'Activar'}</span>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* ── Paginación ── */}
          {pagination.totalPages > 1 && (
            <div className="prd-pagination">
              <button className="prd-btn prd-btn--ghost prd-btn--icon"
                onClick={() => setPage(p => p - 1)} disabled={page === 1}>
                <i className="bi bi-chevron-left" />
              </button>
              <span className="prd-pagination__info">
                Página <strong>{page}</strong> de <strong>{pagination.totalPages}</strong>
              </span>
              <button className="prd-btn prd-btn--ghost prd-btn--icon"
                onClick={() => setPage(p => p + 1)} disabled={page === pagination.totalPages}>
                <i className="bi bi-chevron-right" />
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Modales ── */}
      {detailId && (
        <ProductDetailModal
          productId={detailId}
          canEdit={canEdit}
          onClose={() => setDetailId(null)}
          onEdit={(p) => { setDetailId(null); setModal({ open: true, product: p }) }}
        />
      )}

      {modal.open && (
        <ProductModal
          product={modal.product}
          categories={categories}
          providers={providers}
          onSaved={handleSaved}
          onClose={() => setModal({ open: false, product: null })}
        />
      )}

      {bulkOpen && (
        <BulkUploadModal
          onDone={handleBulkDone}
          onClose={() => setBulkOpen(false)}
        />
      )}

      {confirmTarget && (
        <ConfirmDialog
          title="Desactivar producto"
          message={`¿Desactivar "${confirmTarget.name}"? No aparecerá en el POS hasta reactivarlo.`}
          confirmLabel="Desactivar"
          variant="danger"
          onClose={() => setConfirmTarget(null)}
          onConfirm={async () => {
            await performToggle(confirmTarget)
            setConfirmTarget(null)
          }}
        />
      )}
    </div>
  )
}

export default Products