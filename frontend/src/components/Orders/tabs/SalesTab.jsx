// src/components/Sales/tabs/SalesTab.jsx
import { useState, useEffect, useCallback, useRef } from 'react'
import { useUser }   from '../../../Context/UserContext'
import api from '../../../services/api'
import OrderDetailModal from '../modals/OrderDetailModal'

const PAGE_SIZE = 20

const money = (n) => Number(n ?? 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
const fmtDateTime = (d) => new Date(d).toLocaleString('es-MX', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
})
// [FIX] toISOString() convierte a UTC antes de cortar la fecha — en
// Mérida (UTC-6), desde media tarde en adelante la hora UTC ya cruzó a la
// madrugada del día siguiente, así que marcaba un día adelantado. Se arma
// la fecha con los componentes LOCALES en su lugar.
const todayStr = () => {
  const d    = new Date()
  const yyyy = d.getFullYear()
  const mm   = String(d.getMonth() + 1).padStart(2, '0')
  const dd   = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

const STATUS_META = {
  completed:      { label: 'Completada', cls: 'sls-status--on' },
  cancelled:      { label: 'Cancelada',  cls: 'sls-status--off' },
  refunded:       { label: 'Reembolsada',  cls: 'sls-status--refunded' },
  partial_refund: { label: 'Reembolso parcial',  cls: 'sls-status--partial' }
  
}

const SaleTypeBadge = ({ isCredit }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 5,
    fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap',
    color: isCredit ? '#b45309' : '#64748b',
  }}>
    <span style={{
      width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
      background: isCredit ? '#b45309' : '#94a3b8',
    }} />
    {isCredit ? 'Crédito' : 'Contado'}
  </span>
)

// ── Componente ──
const SalesTab = () => {
  const { isCentralAdmin, hasPermission } = useUser()
  const canCancel = hasPermission('orders', 'cancel')

  const [orders,     setOrders]     = useState([])
  const [pagination, setPagination] = useState({ total: 0, page: 1, totalPages: 1 })
  // FIX: totales por método de pago del rango/sucursal filtrados —
  // vienen del mismo fetch, no una llamada aparte
  const [totals,     setTotals]     = useState({ by_method: [], grand_total: 0 })
  const [isLoading,  setIsLoading]  = useState(true)
  const [error,      setError]      = useState(null)

  // Filtros — rango de fecha por defecto: hoy
  const [startDate, setStartDate] = useState(todayStr())
  const [endDate,   setEndDate]   = useState(todayStr())
  const [status,    setStatus]    = useState('')
  const [search,    setSearch]    = useState('')
  const [page,      setPage]      = useState(1)

  // FIX: filtro de sucursal — solo aplica a admin central; un usuario con
  // sucursal asignada nunca manda branch_id, el backend la resuelve sola
  // a partir de su usuario y ve solo lo suyo
  const [branches,         setBranches]         = useState([])
  const [selectedBranchId, setSelectedBranchId] = useState('')
  const isConsolidated = isCentralAdmin && !selectedBranchId

  const [detailId, setDetailId] = useState(null)

  const searchTimer = useRef(null)
  const searchRef   = useRef('')

  useEffect(() => {
    if (!isCentralAdmin) return
    api.get('branches?is_active=true')
      .then(({ data }) => setBranches(data.data))
      .catch(() => {})
  }, [isCentralAdmin])

  // ── Fetch ──
  const fetchOrders = useCallback(async (currentPage = 1) => {
    setIsLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        page: currentPage, limit: PAGE_SIZE,
        startDate, endDate,
      })
      if (isCentralAdmin && selectedBranchId) params.set('branch_id', selectedBranchId)
      if (status)            params.set('status', status)
      if (searchRef.current) params.set('search', searchRef.current)

      const { data } = await api.get(`orders?${params}`)
      setOrders(data.data)
      setPagination(data.pagination)
      setTotals(data.totals ?? { by_method: [], grand_total: 0 })
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al cargar las ventas')
    } finally {
      setIsLoading(false)
    }
  }, [startDate, endDate, status, isCentralAdmin, selectedBranchId])

  useEffect(() => { fetchOrders(page) }, [page, fetchOrders])

  // ── Búsqueda con debounce ──
  const handleSearch = (val) => {
    searchRef.current = val
    setSearch(val)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      setPage(1)
      fetchOrders(1)
    }, 400)
  }

  // Cambiar fecha/estado siempre regresa a la página 1 y refresca
  const handleDateChange = (setter) => (e) => {
    setter(e.target.value)
    setPage(1)
  }
  const handleStatusChange = (e) => {
    setStatus(e.target.value)
    setPage(1)
  }
  // startDate/endDate/status/selectedBranchId cambian la identidad de
  // fetchOrders (están en sus deps) — si además page ya estaba en 1, el
  // useEffect de [page, fetchOrders] no se re-dispara solo por eso (page
  // no cambió), así que forzamos el refetch aquí.
  useEffect(() => {
    if (page === 1) fetchOrders(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, status, selectedBranchId])

  const handleBranchChange = (e) => {
    setSelectedBranchId(e.target.value)
    setPage(1)
  }

  const handleCancelled = (orderId) => {
    setOrders(prev => prev.map(o =>
      o.order_id === orderId ? { ...o, status: 'cancelled' } : o
    ))
  }

  return (
    <div className="sls-panel">
      <span className="sls-panel__count">
        {pagination.total} venta{pagination.total !== 1 ? 's' : ''} encontrada{pagination.total !== 1 ? 's' : ''}
      </span>

      {/* ── Filtros ── */}
      <div className="sls-filters">
        <div className="sls-search">
          <i className="bi bi-search sls-search__icon" />
          <input
            type="text"
            className="sls-search__input"
            placeholder="Buscar por folio o cliente..."
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

        {/* FIX: filtro de sucursal — solo visible para admin central */}
        {isCentralAdmin && (
          <select className="sls-select" value={selectedBranchId} onChange={handleBranchChange}>
            <option value="">Todas las sucursales</option>
            {branches.map(b => (
              <option key={b.branch_id} value={b.branch_id}>{b.name}</option>
            ))}
          </select>
        )}

        <select className="sls-select" value={status} onChange={handleStatusChange}>
          <option value="">Todas</option>
          <option value="completed">Completadas</option>
          <option value="partial_refund">Reembolso parcial</option>
          <option value="refunded">Reembolsadas</option>
          <option value="cancelled">Canceladas</option>
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
      ) : orders.length === 0 ? (
        <div className="sls-empty">
          <i className="bi bi-receipt" />
          <span>No se encontraron ventas en este rango</span>
        </div>
      ) : (
        <>
          {/* ── Tabla (desktop) ── */}
          <div className="sls-table-wrap">
            <table className="sls-table">
              <thead>
                <tr>
                  <th>Folio</th>
                  <th>Fecha</th>
                  <th>Cliente</th>
                  <th>Cajero</th>
                  {isConsolidated && <th>Sucursal</th>}
                  <th>Caja</th>
                  <th>Tipo</th>
                  <th className="num">Total</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {orders.map(o => {
                  const st = STATUS_META[o.status] ?? { label: o.status, cls: '' }
                  return (
                    <tr
                      key={o.order_id}
                      className={o.status === 'cancelled' ? 'sls-row--cancelled' : ''}
                      onClick={() => setDetailId(o.order_id)}
                    >
                      <td className="sls-folio">#{o.order_id}</td>
                      <td className="sls-td-muted">{fmtDateTime(o.created_at)}</td>
                      <td>{o.customer_firstname} {o.customer_lastname}</td>
                      <td className="sls-td-muted">{o.user_firstname} {o.user_lastname}</td>
                      {isConsolidated && <td className="sls-td-muted">{o.branch_name}</td>}
                      <td className="sls-td-muted">{o.cash_register_name}</td>
                      <td><SaleTypeBadge isCredit={!!o.is_credit} /></td>
                      <td className="num">
                        {Number(o.net_total) !== Number(o.total) ? (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.3 }}>
                            <span style={{ textDecoration: 'line-through', color: '#94a3b8', fontSize: 12 }}>
                              {money(o.total)}
                            </span>
                            <strong>{money(o.net_total)}</strong>
                          </div>
                        ) : (
                          money(o.total)
                        )}
                      </td>
                      <td>
                        <span className={`sls-status ${st.cls}`}>
                          <span className="sls-status__dot" />
                          {st.label}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* ── Cards (móvil) ── */}
          <div className="sls-cards">
            {orders.map(o => {
              const st = STATUS_META[o.status] ?? { label: o.status, cls: '' }
              return (
                <button
                  key={o.order_id}
                  className={`sls-card ${o.status === 'cancelled' ? 'sls-card--cancelled' : ''}`}
                  onClick={() => setDetailId(o.order_id)}
                >
                  <div className="sls-card__top">
                    <span className="sls-folio">#{o.order_id}</span>
                    <span className={`sls-status ${st.cls}`}>
                      <span className="sls-status__dot" />
                      {st.label}
                    </span>
                  </div>
                  <div className="sls-card__customer">{o.customer_firstname} {o.customer_lastname}</div>
                  <div className="sls-card__meta">
                    <span className="sls-muted"><i className="bi bi-clock" />{fmtDateTime(o.created_at)}</span>
                    <span className="sls-muted"><i className="bi bi-person-badge" />{o.user_firstname} {o.user_lastname}</span>
                    {isConsolidated && (
                      <span className="sls-muted"><i className="bi bi-shop" />{o.branch_name}</span>
                    )}
                    <SaleTypeBadge isCredit={!!o.is_credit} />
                  </div>
                  <div className="sls-card__total">
                    <span className="sls-muted">Total</span>
                    {Number(o.net_total) !== Number(o.total) ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.3 }}>
                        <span style={{ textDecoration: 'line-through', color: '#94a3b8', fontSize: 12 }}>
                          {money(o.total)}
                        </span>
                        <strong>{money(o.net_total)}</strong>
                      </div>
                    ) : (
                      <strong>{money(o.total)}</strong>
                    )}
                  </div>
                </button>
              )
            })}
          </div>

          {/* FIX: totales por método de pago del rango/sucursal filtrados.
              Un solo bloque compartido entre vista tabla y vista tarjetas
              (en vez de duplicar markup por breakpoint) — siempre sobre
              ventas completadas, se recalcula solo al cambiar filtros de
              fecha/sucursal/búsqueda (no al paginar, ya que agrega todo
              el rango, no solo la página actual) */}
          <div className="sls-totals">
            <div className="sls-totals__methods">
              {totals.by_method.length === 0 ? (
                <span className="sls-muted">Sin ventas completadas en este rango</span>
              ) : totals.by_method.map(m => (
                <div key={m.payment_method_id} className="sls-totals__row">
                  <span>{m.name}</span>
                  <span className="sls-totals__amt">{money(m.total)}</span>
                </div>
              ))}
            </div>
            <div className="sls-totals__grand">
              <span>Total general</span>
              <strong>{money(totals.grand_total)}</strong>
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

      {/* ── Detalle ── */}
      {detailId && (
        <OrderDetailModal
          orderId={detailId}
          canCancel={canCancel}
          onClose={() => setDetailId(null)}
          onCancelled={handleCancelled}
        />
      )}
    </div>
  )
}

export default SalesTab