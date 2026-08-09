// src/components/Sales/Sales.jsx
import { useState, useEffect, useCallback, useRef } from 'react'
import { useUser }   from '../../Context/UserContext'
import { useBranch } from '../../Context/BranchContext'
import api from '../../services/api'
import BranchGate from '../Common/BranchGate'
import OrderDetailModal from './modals/OrderDetailModal'
import './orders.css'

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
  completed: { label: 'Completada', cls: 'sls-status--on' },
  cancelled: { label: 'Cancelada',  cls: 'sls-status--off' },
}

// No tengo orders.css a la mano para confirmar si existen variantes de
// color más allá de --on/--off, así que este badge usa estilos inline
// autocontenidos en vez de una clase nueva sin verificar.
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

// ── Componente interno — ya con selectedBranch garantizado por BranchGate ──
const SalesInner = () => {
  const { hasPermission } = useUser()
  const { selectedBranch, isLoading: branchLoading } = useBranch()
  const canCancel = hasPermission('orders', 'cancel')

  const [orders,     setOrders]     = useState([])
  const [pagination, setPagination] = useState({ total: 0, page: 1, totalPages: 1 })
  const [isLoading,  setIsLoading]  = useState(true)
  const [error,      setError]      = useState(null)

  // Filtros — rango de fecha por defecto: hoy
  const [startDate, setStartDate] = useState(todayStr())
  const [endDate,   setEndDate]   = useState(todayStr())
  const [status,    setStatus]    = useState('')
  const [search,    setSearch]    = useState('')
  const [page,      setPage]      = useState(1)

  const [detailId, setDetailId] = useState(null)

  const searchTimer = useRef(null)
  const searchRef   = useRef('')

  // ── Fetch ──
  const fetchOrders = useCallback(async (currentPage = 1) => {
    if (!selectedBranch) return
    setIsLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        page: currentPage, limit: PAGE_SIZE,
        startDate, endDate,
        branch_id: selectedBranch.branch_id,
      })
      if (status)            params.set('status', status)
      if (searchRef.current) params.set('search', searchRef.current)

      const { data } = await api.get(`orders?${params}`)
      setOrders(data.data)
      setPagination(data.pagination)
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al cargar las ventas')
    } finally {
      setIsLoading(false)
    }
  }, [selectedBranch, startDate, endDate, status])

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
  // startDate/endDate/status cambian la identidad de fetchOrders (están en
  // sus deps) — si además page ya estaba en 1, el useEffect de [page,
  // fetchOrders] no se re-dispara solo por eso (page no cambió), así que
  // forzamos el refetch aquí.
  useEffect(() => {
    if (page === 1) fetchOrders(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, status])

  const handleCancelled = (orderId) => {
    setOrders(prev => prev.map(o =>
      o.order_id === orderId ? { ...o, status: 'cancelled' } : o
    ))
  }

  // Caso no-admin: BranchGate pasa directo sin esperar a que /branches/me
  // resuelva — sin este guard se vería un "0 ventas" fantasma por un
  // instante antes de que selectedBranch esté listo.
  if (branchLoading || !selectedBranch) {
    return (
      <div className="sls-root">
        <div className="sls-skeleton">
          {[...Array(5)].map((_, i) => <div key={i} className="sls-skeleton__row" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="sls-root">
      {/* ── Header ── */}
      <div className="sls-header">
        <div>
          <h1 className="sls-header__title">Ventas</h1>
          <span className="sls-header__sub">
            {pagination.total} venta{pagination.total !== 1 ? 's' : ''} encontrada{pagination.total !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

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

        <select className="sls-select" value={status} onChange={handleStatusChange}>
          <option value="">Todas</option>
          <option value="completed">Completadas</option>
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
                      <td className="sls-td-muted">{o.cash_register_name}</td>
                      <td><SaleTypeBadge isCredit={!!o.is_credit} /></td>
                      <td className="num">{money(o.total)}</td>
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
                    <SaleTypeBadge isCredit={!!o.is_credit} />
                  </div>
                  <div className="sls-card__total">
                    <span className="sls-muted">Total</span>
                    <strong>{money(o.total)}</strong>
                  </div>
                </button>
              )
            })}
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

// ── Wrapper — igual patrón que Products/CashRegisters: BranchGate decide si
// hace falta el picker (admin sin sucursal) o pasa directo ──
const Orders = () => (
  <BranchGate
    title="Selecciona una sucursal"
    description="Elige la sucursal para consultar sus ventas."
  >
    <SalesInner />
  </BranchGate>
)

export default Orders