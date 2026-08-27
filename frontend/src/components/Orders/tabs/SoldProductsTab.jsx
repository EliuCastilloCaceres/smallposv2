// src/components/Sales/tabs/SoldProductsTab.jsx
import { useState, useEffect, useCallback, useRef } from 'react'
import { useUser } from '../../../Context/UserContext'
import api from '../../../services/api'

const PAGE_SIZE = 20

const money = (n) => Number(n ?? 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
const todayStr = () => {
  const d    = new Date()
  const yyyy = d.getFullYear()
  const mm   = String(d.getMonth() + 1).padStart(2, '0')
  const dd   = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

// ── Componente ──
// Agrega VENTAS POR PRODUCTO en el rango filtrado: cuánto se vendió de
// cada uno (no órdenes que lo incluyan). El filtro de categoría/proveedor
// vive aquí, no en la pestaña de Ventas, porque ahí filtrar por categoría
// no tenía sentido: una orden con un solo producto de "Alimentos" entre
// diez más aparecía completa, inflando lo que en realidad se vendió de
// esa categoría.
const SoldProductsTab = () => {
  const { isCentralAdmin } = useUser()

  const [products,   setProducts]   = useState([])
  const [pagination, setPagination] = useState({ total: 0, page: 1, totalPages: 1 })
  const [totals,     setTotals]     = useState({ total_items: 0, total_amount: 0 })
  const [isLoading,  setIsLoading]  = useState(true)
  const [error,      setError]      = useState(null)

  // Filtros — mismo rango por defecto que la pestaña de Ventas: hoy
  const [startDate, setStartDate] = useState(todayStr())
  const [endDate,   setEndDate]   = useState(todayStr())
  const [search,    setSearch]    = useState('')
  const [page,      setPage]      = useState(1)

  const [branches,         setBranches]         = useState([])
  const [selectedBranchId, setSelectedBranchId] = useState('')

  const [categories,         setCategories]         = useState([])
  const [selectedCategoryId, setSelectedCategoryId] = useState('')
  const [providers,          setProviders]          = useState([])
  const [selectedProviderId, setSelectedProviderId] = useState('')

  // FIX: filtro de cajero — usa orders/cashiers en vez de users/, ese
  // endpoint exige el permiso users:read y no todo el que tiene acceso a
  // Ventas lo tiene. Se re-fetchea al cambiar de sucursal (admin central)
  // para no listar cajeros que no pertenecen a la sucursal seleccionada.
  const [users,          setUsers]          = useState([])
  const [selectedUserId, setSelectedUserId] = useState('')

  const searchTimer = useRef(null)
  const searchRef   = useRef('')

  useEffect(() => {
    if (!isCentralAdmin) return
    api.get('branches?is_active=true')
      .then(({ data }) => setBranches(data.data))
      .catch(() => {})
  }, [isCentralAdmin])

  useEffect(() => {
    api.get('categories?is_active=true&limit=all')
      .then(({ data }) => setCategories(data.data))
      .catch(() => {})
    api.get('providers?is_active=true&limit=all')
      .then(({ data }) => setProviders(data.data ?? data))
      .catch(() => {})
  }, [])

  useEffect(() => {
    const params = new URLSearchParams()
    if (isCentralAdmin && selectedBranchId) params.set('branch_id', selectedBranchId)
    api.get(`orders/cashiers?${params}`)
      .then(({ data }) => setUsers(data.data))
      .catch(() => {})
  }, [isCentralAdmin, selectedBranchId])

  // ── Fetch ──
  const fetchSoldProducts = useCallback(async (currentPage = 1) => {
    setIsLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        page: currentPage, limit: PAGE_SIZE,
        startDate, endDate,
      })
      if (isCentralAdmin && selectedBranchId) params.set('branch_id', selectedBranchId)
      if (selectedCategoryId) params.set('category_id', selectedCategoryId)
      if (selectedProviderId) params.set('provider_id', selectedProviderId)
      if (selectedUserId)     params.set('user_id', selectedUserId)
      if (searchRef.current)  params.set('search', searchRef.current)

      const { data } = await api.get(`orders/sold-products?${params}`)
      setProducts(data.data)
      setPagination(data.pagination)
      setTotals(data.totals ?? { total_items: 0, total_amount: 0 })
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al cargar los productos vendidos')
    } finally {
      setIsLoading(false)
    }
  }, [startDate, endDate, isCentralAdmin, selectedBranchId, selectedCategoryId, selectedProviderId, selectedUserId])

  useEffect(() => { fetchSoldProducts(page) }, [page, fetchSoldProducts])

  // ── Búsqueda con debounce ──
  const handleSearch = (val) => {
    searchRef.current = val
    setSearch(val)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      setPage(1)
      fetchSoldProducts(1)
    }, 400)
  }

  const handleDateChange = (setter) => (e) => {
    setter(e.target.value)
    setPage(1)
  }
  const handleBranchChange = (e) => {
    setSelectedBranchId(e.target.value)
    setSelectedUserId('') // el cajero seleccionado puede no existir en la nueva sucursal
    setPage(1)
  }
  const handleCategoryChange = (e) => {
    setSelectedCategoryId(e.target.value)
    setPage(1)
  }
  const handleProviderChange = (e) => {
    setSelectedProviderId(e.target.value)
    setPage(1)
  }
  const handleUserChange = (e) => {
    setSelectedUserId(e.target.value)
    setPage(1)
  }
  // Mismo patrón que en SalesTab: si el filtro cambia y page ya estaba en
  // 1, el useEffect de [page, fetchSoldProducts] no se re-dispara solo
  // por eso, así que forzamos el refetch aquí.
  useEffect(() => {
    if (page === 1) fetchSoldProducts(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, selectedBranchId, selectedCategoryId, selectedProviderId, selectedUserId])

  return (
    <div className="sls-panel">
      <span className="sls-panel__count">
        {pagination.total} producto{pagination.total !== 1 ? 's' : ''} vendido{pagination.total !== 1 ? 's' : ''}
      </span>

      {/* ── Filtros ── */}
      <div className="sls-filters">
        <div className="sls-search">
          <i className="bi bi-search sls-search__icon" />
          <input
            type="text"
            className="sls-search__input"
            placeholder="Buscar por nombre o SKU..."
            value={search}
            onChange={e => handleSearch(e.target.value)}
          />
          {search && (
            <button className="sls-search__clear" onClick={() => handleSearch('')}>
              <i className="bi bi-x" />
            </button>
          )}
        </div>

        <input
          type="date" className="sls-select" value={startDate} max={endDate}
          onChange={handleDateChange(setStartDate)}
        />
        <input
          type="date" className="sls-select" value={endDate} min={startDate}
          onChange={handleDateChange(setEndDate)}
        />

        {isCentralAdmin && (
          <select className="sls-select" value={selectedBranchId} onChange={handleBranchChange}>
            <option value="">Todas las sucursales</option>
            {branches.map(b => (
              <option key={b.branch_id} value={b.branch_id}>{b.name}</option>
            ))}
          </select>
        )}

        <select className="sls-select" value={selectedCategoryId} onChange={handleCategoryChange}>
          <option value="">Todas las categorías</option>
          {categories.map(c => (
            <option key={c.category_id} value={c.category_id}>{c.name}</option>
          ))}
        </select>

        <select className="sls-select" value={selectedProviderId} onChange={handleProviderChange}>
          <option value="">Todos los proveedores</option>
          {providers.map(p => (
            <option key={p.provider_id} value={p.provider_id}>{p.name}</option>
          ))}
        </select>

        <select className="sls-select" value={selectedUserId} onChange={handleUserChange}>
          <option value="">Todos los cajeros</option>
          {users.map(u => (
            <option key={u.user_id} value={u.user_id}>{u.first_name} {u.last_name}</option>
          ))}
        </select>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="sls-alert">
          <i className="bi bi-exclamation-circle" />
          <span>{error}</span>
          <button onClick={() => setError(null)}><i className="bi bi-x" /></button>
        </div>
      )}

      {/* ── Contenido ── */}
      {isLoading ? (
        <div className="sls-skeleton">
          {[...Array(5)].map((_, i) => <div key={i} className="sls-skeleton__row" />)}
        </div>
      ) : products.length === 0 ? (
        <div className="sls-empty">
          <i className="bi bi-bag-check" />
          <span>No se vendieron productos en este rango</span>
        </div>
      ) : (
        <>
          {/* ── Tabla (desktop) ── */}
          <div className="sls-table-wrap">
            <table className="sls-table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>SKU</th>
                  <th>Categoría</th>
                  <th>Proveedor</th>
                  <th>UOM</th>
                  <th className="num">Cant. vendida</th>
                  <th className="num">Total vendido</th>
                </tr>
              </thead>
              <tbody>
                {products.map(p => (
                  <tr key={p.product_id}>
                    <td>{p.name}</td>
                    <td className="sls-td-muted">{p.sku ?? '—'}</td>
                    <td>
                      {p.category_name
                        ? (
                          <span className="sls-cat-badge" style={{
                            background: p.category_color ? `${p.category_color}20` : 'var(--sls-accent-bg)',
                            color: p.category_color ?? 'var(--sls-accent)',
                          }}>
                            {p.category_name}
                          </span>
                        )
                        : <span className="sls-td-muted">—</span>
                      }
                    </td>
                    <td className="sls-td-muted">{p.provider_name ?? '—'}</td>
                    <td><span className="sls-uom-badge">{p.uom ?? '—'}</span></td>
                    <td className="num">{p.quantity_sold}</td>
                    <td className="num">{money(p.total_sold)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Cards (móvil) ── */}
          <div className="sls-cards">
            {products.map(p => (
              <div key={p.product_id} className="sls-card">
                <div className="sls-card__top">
                  <span className="sls-card__customer">{p.name}</span>
                  <span className="sls-uom-badge">{p.uom ?? '—'}</span>
                </div>
                <div className="sls-card__meta">
                  {p.sku && <span className="sls-muted"><i className="bi bi-upc-scan" />{p.sku}</span>}
                  {p.category_name && (
                    <span className="sls-cat-badge" style={{
                      background: p.category_color ? `${p.category_color}20` : 'var(--sls-accent-bg)',
                      color: p.category_color ?? 'var(--sls-accent)',
                    }}>
                      {p.category_name}
                    </span>
                  )}
                  {p.provider_name && (
                    <span className="sls-muted"><i className="bi bi-truck" />{p.provider_name}</span>
                  )}
                </div>
                <div className="sls-card__total">
                  <span className="sls-muted">Cant. vendida: {p.quantity_sold}</span>
                  <strong>{money(p.total_sold)}</strong>
                </div>
              </div>
            ))}
          </div>

          {/* ── Totales ── */}
          <div className="sls-totals">
            <div className="sls-totals__methods">
              <div className="sls-totals__row">
                <span>Artículos vendidos</span>
                <span className="sls-totals__amt">{totals.total_items}</span>
              </div>
            </div>
            <div className="sls-totals__grand">
              <span>Total Vendido</span>
              <strong>{money(totals.total_amount)}</strong>
            </div>
          </div>

          {/* ── Paginación ── */}
          {pagination.totalPages > 1 && (
            <div className="sls-pagination">
              <button className="sls-btn sls-btn--ghost sls-btn--icon"
                onClick={() => setPage(p => p - 1)} disabled={page === 1}>
                <i className="bi bi-chevron-left" />
              </button>
              <span className="sls-pagination__info">
                Página <strong>{page}</strong> de <strong>{pagination.totalPages}</strong>
              </span>
              <button className="sls-btn sls-btn--ghost sls-btn--icon"
                onClick={() => setPage(p => p + 1)} disabled={page === pagination.totalPages}>
                <i className="bi bi-chevron-right" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default SoldProductsTab