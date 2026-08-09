// src/components/Layaways/Layaways.jsx
import { useState, useEffect, useCallback, useRef } from 'react'
import { useUser }   from '../../Context/UserContext'
import { useBranch } from '../../Context/BranchContext'
import api from '../../services/api'
import BranchGate from '../Common/BranchGate'
import LayawayDetailModal from './modals/LayawayDetailModal'
import './layaways.css'

const PAGE_SIZE = 20

const money = (n) => Number(n ?? 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const STATUS_META = {
  active:    { label: 'Activo',    cls: 'lwy-status--on' },
  completed: { label: 'Completado', cls: 'lwy-status--neutral' },
  cancelled: { label: 'Cancelado',  cls: 'lwy-status--off' },
}

const LayawaysInner = () => {
  const { hasPermission } = useUser()
  const { selectedBranch, isLoading: branchLoading } = useBranch()
  const canManage = hasPermission('layaway', 'create')

  const [layaways,   setLayaways]   = useState([])
  const [pagination, setPagination] = useState({ total: 0, page: 1, totalPages: 1 })
  const [isLoading,  setIsLoading]  = useState(true)
  const [error,      setError]      = useState(null)
  const [search,        setSearch]        = useState('')
  const [statusFilter,  setStatusFilter]  = useState('active')
  const [page,           setPage]           = useState(1)

  const [detailId, setDetailId] = useState(null)

  const searchTimer = useRef(null)
  const searchRef   = useRef('')

  const fetchLayaways = useCallback(async (currentPage = 1) => {
    if (!selectedBranch) return
    setIsLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        page: currentPage, limit: PAGE_SIZE,
        branch_id: selectedBranch.branch_id,
      })
      if (statusFilter)      params.set('status', statusFilter)
      if (searchRef.current) params.set('search', searchRef.current)

      const { data } = await api.get(`layaways?${params}`)
      setLayaways(data.data)
      setPagination(data.pagination)
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al cargar los apartados')
    } finally {
      setIsLoading(false)
    }
  }, [selectedBranch, statusFilter])

  useEffect(() => { fetchLayaways(page) }, [page, fetchLayaways])

  const handleSearch = (val) => {
    setSearch(val)
    searchRef.current = val
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      setPage(1)
      fetchLayaways(1)
    }, 400)
  }

  const handleStatusChange = (e) => {
    setStatusFilter(e.target.value)
    setPage(1)
  }
  useEffect(() => {
    if (page === 1) fetchLayaways(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter])

  if (branchLoading || !selectedBranch) {
    return (
      <div className="lwy-root">
        <div className="lwy-skeleton">
          {[...Array(5)].map((_, i) => <div key={i} className="lwy-skeleton__row" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="lwy-root">
      <div className="lwy-header">
        <div>
          <h1 className="lwy-header__title">Apartados</h1>
          <span className="lwy-header__sub">
            {pagination.total} apartado{pagination.total !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      <div className="lwy-filters">
        <div className="lwy-search">
          <i className="bi bi-search lwy-search__icon" />
          <input
            type="text" className="lwy-search__input"
            placeholder="Buscar por cliente o teléfono..."
            value={search} onChange={e => handleSearch(e.target.value)}
          />
        </div>
        <select className="lwy-select" value={statusFilter} onChange={handleStatusChange}>
          <option value="">Todos</option>
          <option value="active">Activos</option>
          <option value="completed">Completados</option>
          <option value="cancelled">Cancelados</option>
        </select>
      </div>

      {error && (
        <div className="lwy-alert">
          <i className="bi bi-exclamation-circle" /><span>{error}</span>
          <button onClick={() => setError(null)}><i className="bi bi-x" /></button>
        </div>
      )}

      {isLoading ? (
        <div className="lwy-skeleton">
          {[...Array(5)].map((_, i) => <div key={i} className="lwy-skeleton__row" />)}
        </div>
      ) : layaways.length === 0 ? (
        <div className="lwy-empty">
          <i className="bi bi-bag-check" />
          <span>No hay apartados que coincidan con el filtro</span>
        </div>
      ) : (
        <>
          <div className="lwy-table-wrap">
            <table className="lwy-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Cliente</th>
                  <th>Creado</th>
                  <th className="num">Total</th>
                  <th className="num">Pagado</th>
                  <th className="num">Saldo</th>
                  <th>Entrega</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {layaways.map(l => {
                  const st = STATUS_META[l.status] ?? { label: l.status, cls: '' }
                  return (
                    <tr key={l.layaway_id} onClick={() => setDetailId(l.layaway_id)}>
                      <td className="lwy-folio">#{l.layaway_id}</td>
                      <td>{l.first_name} {l.last_name}</td>
                      <td className="lwy-td-muted">{fmtDate(l.created_at)}</td>
                      <td className="num">{money(l.total_amount)}</td>
                      <td className="num lwy-td-muted">{money(l.amount_paid)}</td>
                      <td className="num lwy-folio">{money(l.balance)}</td>
                      <td className="lwy-td-muted">{fmtDate(l.due_date)}</td>
                      <td>
                        <span className={`lwy-status ${st.cls}`}>
                          <span className="lwy-status__dot" />{st.label}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="lwy-cards">
            {layaways.map(l => {
              const st = STATUS_META[l.status] ?? { label: l.status, cls: '' }
              return (
                <button key={l.layaway_id} className="lwy-card" onClick={() => setDetailId(l.layaway_id)}>
                  <div className="lwy-card__top">
                    <span className="lwy-card__customer">#{l.layaway_id} · {l.first_name} {l.last_name}</span>
                    <span className={`lwy-status ${st.cls}`}>
                      <span className="lwy-status__dot" />{st.label}
                    </span>
                  </div>
                  <div className="lwy-card__meta">
                    <span className="lwy-td-muted"><i className="bi bi-calendar-plus" />Creado {fmtDate(l.created_at)}</span>
                    <span className="lwy-td-muted"><i className="bi bi-calendar-event" />Entrega {fmtDate(l.due_date)}</span>
                  </div>
                  <div className="lwy-card__total">
                    <span className="lwy-td-muted">Saldo pendiente</span>
                    <strong>{money(l.balance)}</strong>
                  </div>
                </button>
              )
            })}
          </div>

          {pagination.totalPages > 1 && (
            <div className="lwy-pagination">
              <button className="lwy-btn lwy-btn--ghost lwy-btn--icon"
                onClick={() => setPage(p => p - 1)} disabled={page === 1}>
                <i className="bi bi-chevron-left" />
              </button>
              <span className="lwy-pagination__info">
                Página <strong>{page}</strong> de <strong>{pagination.totalPages}</strong>
              </span>
              <button className="lwy-btn lwy-btn--ghost lwy-btn--icon"
                onClick={() => setPage(p => p + 1)} disabled={page === pagination.totalPages}>
                <i className="bi bi-chevron-right" />
              </button>
            </div>
          )}
        </>
      )}

      {detailId && (
        <LayawayDetailModal
          layawayId={detailId}
          canManage={canManage}
          onClose={() => setDetailId(null)}
          onChanged={() => fetchLayaways(page)}
          branch={selectedBranch}
        />
      )}
    </div>
  )
}

const Layaways = () => (
  <BranchGate title="Selecciona una sucursal" description="Elige la sucursal para consultar sus apartados.">
    <LayawaysInner />
  </BranchGate>
)

export default Layaways