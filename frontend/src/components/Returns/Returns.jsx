// src/components/Returns/Returns.jsx
import { useState, useEffect, useCallback, useRef } from 'react'
import { useUser }   from '../../Context/UserContext'
import { useBranch } from '../../Context/BranchContext'
import api from '../../services/api'
import ReturnDetailModal from './modals/ReturnDetailModal'
import CreateReturnModal from './modals/CreateReturnModal'
import './returns.css'

const PAGE_SIZE = 20

const money = (n) => Number(n ?? 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
const fmtDateTime = (d) => new Date(d).toLocaleString('es-MX', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
})
// Mismo fix que en Orders.jsx: toISOString() convierte a UTC antes de
// cortar la fecha, lo que adelanta el día en zonas horarias negativas.
const todayStr = () => {
  const d    = new Date()
  const yyyy = d.getFullYear()
  const mm   = String(d.getMonth() + 1).padStart(2, '0')
  const dd   = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

const REFUND_METHOD_LABEL = { cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia' }

const STATUS_META = {
  completed: { label: 'Completada', cls: 'rtn-status--on' },
  pending:   { label: 'Pendiente',  cls: 'rtn-status--pending' },
  rejected:  { label: 'Rechazada',  cls: 'rtn-status--off' },
}

const Returns = () => {
  const { hasPermission } = useUser()
  // FIX: selectedBranch ya NO se usa para filtrar el listado (eso ahora es
  // el filtro nuevo, ver selectedBranchId más abajo) — se conserva solo
  // para lo que sigue siendo un concepto distinto: la sucursal donde el
  // usuario opera físicamente, necesaria para saber en qué caja aplicar
  // el efectivo de un reembolso (mismo patrón que Credits.jsx). Puede venir
  // null para admin central; CreateReturnModal lo maneja con su propio
  // selector de sucursal para ese caso.
  const { selectedBranch } = useBranch()
  const canCreate = hasPermission('returns', 'create')

  const [returns,    setReturns]    = useState([])
  const [pagination, setPagination] = useState({ total: 0, page: 1, totalPages: 1 })
  const [isLoading,  setIsLoading]  = useState(true)
  const [error,      setError]      = useState(null)

  const [startDate, setStartDate] = useState(todayStr())
  const [endDate,   setEndDate]   = useState(todayStr())
  const [status,    setStatus]    = useState('')
  const [search,    setSearch]    = useState('')
  const [page,      setPage]      = useState(1)

  // FIX: filtro de sucursal — visible para todos los usuarios (no solo
  // admin central), igual que en Credits: cualquiera con permiso puede
  // consultar devoluciones de una sucursal distinta a la suya.
  const [branches,         setBranches]         = useState([])
  const [selectedBranchId, setSelectedBranchId] = useState('')
  const isConsolidated = !selectedBranchId

  const [detailId,    setDetailId]    = useState(null)
  const [createOpen,  setCreateOpen]  = useState(false)

  const searchTimer = useRef(null)
  const searchRef   = useRef('')

  useEffect(() => {
    api.get('branches/list')
      .then(({ data }) => setBranches(data.data))
      .catch(() => {})
  }, [])

  const fetchReturns = useCallback(async (currentPage = 1) => {
    setIsLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        page: currentPage, limit: PAGE_SIZE,
        startDate, endDate,
      })
      if (selectedBranchId)   params.set('branch_id', selectedBranchId)
      if (status)              params.set('status', status)
      if (searchRef.current)   params.set('search', searchRef.current)

      const { data } = await api.get(`returns?${params}`)
      setReturns(data.data)
      setPagination(data.pagination)
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al cargar las devoluciones')
    } finally {
      setIsLoading(false)
    }
  }, [startDate, endDate, status, selectedBranchId])

  useEffect(() => { fetchReturns(page) }, [page, fetchReturns])

  const handleSearch = (val) => {
    searchRef.current = val
    setSearch(val)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      setPage(1)
      fetchReturns(1)
    }, 400)
  }

  const handleDateChange = (setter) => (e) => {
    setter(e.target.value)
    setPage(1)
  }
  const handleStatusChange = (e) => {
    setStatus(e.target.value)
    setPage(1)
  }
  const handleBranchChange = (e) => {
    setSelectedBranchId(e.target.value)
    setPage(1)
  }
  useEffect(() => {
    if (page === 1) fetchReturns(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, status, selectedBranchId])

  const handleCreated = () => {
    setCreateOpen(false)
    setPage(1)
    fetchReturns(1)
  }

  return (
    <div className="rtn-root">
      <div className="rtn-header">
        <div>
          <h1 className="rtn-header__title">Devoluciones</h1>
          <span className="rtn-header__sub">
            {pagination.total} devolución{pagination.total !== 1 ? 'es' : ''} encontrada{pagination.total !== 1 ? 's' : ''}
          </span>
        </div>
        {canCreate && (
          <div className="rtn-header__actions">
            <button className="rtn-btn rtn-btn--primary" onClick={() => setCreateOpen(true)}>
              <i className="bi bi-arrow-return-left" /> Nueva devolución
            </button>
          </div>
        )}
      </div>

      <div className="rtn-filters">
        <div className="rtn-search">
          <i className="bi bi-search rtn-search__icon" />
          <input
            type="text" className="rtn-search__input"
            placeholder="Buscar por # de devolución, venta o cliente..."
            value={search} onChange={e => handleSearch(e.target.value)}
          />
          {search && (
            <button className="rtn-search__clear" onClick={() => handleSearch('')}>
              <i className="bi bi-x" />
            </button>
          )}
        </div>

        <input
          type="date" className="rtn-select" value={startDate} max={endDate}
          onChange={handleDateChange(setStartDate)}
        />
        <input
          type="date" className="rtn-select" value={endDate} min={startDate}
          onChange={handleDateChange(setEndDate)}
        />

        <select className="rtn-select" value={status} onChange={handleStatusChange}>
          <option value="">Todas</option>
          <option value="completed">Completadas</option>
          <option value="pending">Pendientes</option>
          <option value="rejected">Rechazadas</option>
        </select>

        {/* FIX: visible para todos, no solo admin central — cualquiera con
            permiso puede consultar devoluciones de otra sucursal */}
        <select className="rtn-select" value={selectedBranchId} onChange={handleBranchChange}>
          <option value="">Todas las sucursales</option>
          {branches.map(b => (
            <option key={b.branch_id} value={b.branch_id}>{b.name}</option>
          ))}
        </select>
      </div>

      {error && (
        <div className="rtn-alert">
          <i className="bi bi-exclamation-circle" /><span>{error}</span>
          <button onClick={() => setError(null)}><i className="bi bi-x" /></button>
        </div>
      )}

      {isLoading ? (
        <div className="rtn-skeleton">
          {[...Array(5)].map((_, i) => <div key={i} className="rtn-skeleton__row" />)}
        </div>
      ) : returns.length === 0 ? (
        <div className="rtn-empty">
          <i className="bi bi-arrow-return-left" />
          <span>No se encontraron devoluciones en este rango</span>
        </div>
      ) : (
        <>
          <div className="rtn-table-wrap">
            <table className="rtn-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Fecha</th>
                  <th>Cliente</th>
                  <th>Venta</th>
                  {isConsolidated && <th>Sucursal</th>}
                  <th>Cajero</th>
                  <th>Reembolso</th>
                  <th className="num">Monto</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {returns.map(r => {
                  const st = STATUS_META[r.status] ?? { label: r.status, cls: '' }
                  return (
                    <tr key={r.return_id} onClick={() => setDetailId(r.return_id)}>
                      <td className="rtn-folio">#{r.return_id}</td>
                      <td className="rtn-td-muted">{fmtDateTime(r.created_at)}</td>
                      <td>{r.first_name} {r.last_name}</td>
                      <td className="rtn-td-muted">#{r.order_id}</td>
                      {isConsolidated && <td className="rtn-td-muted">{r.branch_name}</td>}
                      <td className="rtn-td-muted">{r.user_firstname} {r.user_lastname}</td>
                      <td className="rtn-td-muted">{REFUND_METHOD_LABEL[r.refund_method] ?? (r.refund_method ?? '—')}</td>
                      <td className="num">{money(r.amount_refunded)}</td>
                      <td>
                        <span className={`rtn-status ${st.cls}`}>
                          <span className="rtn-status__dot" />{st.label}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="rtn-cards">
            {returns.map(r => {
              const st = STATUS_META[r.status] ?? { label: r.status, cls: '' }
              return (
                <button key={r.return_id} className="rtn-card" onClick={() => setDetailId(r.return_id)}>
                  <div className="rtn-card__top">
                    <span className="rtn-card__customer">#{r.return_id} · {r.first_name} {r.last_name}</span>
                    <span className={`rtn-status ${st.cls}`}>
                      <span className="rtn-status__dot" />{st.label}
                    </span>
                  </div>
                  <div className="rtn-card__meta">
                    <span className="rtn-td-muted"><i className="bi bi-calendar-plus" />{fmtDateTime(r.created_at)}</span>
                    <span className="rtn-td-muted"><i className="bi bi-receipt" />Venta #{r.order_id}</span>
                    {isConsolidated && (
                      <span className="rtn-td-muted"><i className="bi bi-shop" />{r.branch_name}</span>
                    )}
                  </div>
                  <div className="rtn-card__total">
                    <span className="rtn-td-muted">{REFUND_METHOD_LABEL[r.refund_method] ?? (r.refund_method ?? 'Sin reembolso')}</span>
                    <strong>{money(r.amount_refunded)}</strong>
                  </div>
                </button>
              )
            })}
          </div>

          {pagination.totalPages > 1 && (
            <div className="rtn-pagination">
              <button className="rtn-btn rtn-btn--ghost rtn-btn--icon"
                onClick={() => setPage(p => p - 1)} disabled={page === 1}>
                <i className="bi bi-chevron-left" />
              </button>
              <span className="rtn-pagination__info">
                Página <strong>{page}</strong> de <strong>{pagination.totalPages}</strong>
              </span>
              <button className="rtn-btn rtn-btn--ghost rtn-btn--icon"
                onClick={() => setPage(p => p + 1)} disabled={page === pagination.totalPages}>
                <i className="bi bi-chevron-right" />
              </button>
            </div>
          )}
        </>
      )}

      {detailId && (
        <ReturnDetailModal
          returnId={detailId}
          onClose={() => setDetailId(null)}
        />
      )}
      {createOpen && (
        <CreateReturnModal
          branch={selectedBranch}
          branches={branches}
          onClose={() => setCreateOpen(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  )
}

export default Returns