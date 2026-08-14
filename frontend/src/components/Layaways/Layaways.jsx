// src/components/Layaways/Layaways.jsx
import { useState, useEffect, useCallback, useRef } from 'react'
import { useUser }   from '../../Context/UserContext'
import { useBranch } from '../../Context/BranchContext'
import api from '../../services/api'
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

const Layaways = () => {
  const { hasPermission } = useUser()
  // FIX: selectedBranch ya NO filtra el listado (eso ahora es el filtro
  // nuevo, ver selectedBranchId) — se conserva solo para la sucursal
  // "operativa" del usuario, que sigue necesitando LayawayDetailModal
  // para la caja del abono en efectivo
  const { selectedBranch } = useBranch()
  const canManage = hasPermission('layaway', 'create')

  const [layaways,   setLayaways]   = useState([])
  const [pagination, setPagination] = useState({ total: 0, page: 1, totalPages: 1 })
  const [isLoading,  setIsLoading]  = useState(true)
  const [error,      setError]      = useState(null)
  const [search,        setSearch]        = useState('')
  const [statusFilter,  setStatusFilter]  = useState('active')
  const [page,           setPage]           = useState(1)

  // FIX: filtro de sucursal — visible para TODOS los usuarios (no solo
  // admin central), igual que en Créditos: cualquiera con permiso puede
  // ver y abonar apartados de una sucursal distinta a la suya.
  const [branches,         setBranches]         = useState([])
  const [selectedBranchId, setSelectedBranchId] = useState('')
  const isConsolidated = !selectedBranchId

  const [detailId, setDetailId] = useState(null)

  const searchTimer = useRef(null)
  const searchRef   = useRef('')

  useEffect(() => {
    api.get('branches/list')
      .then(({ data }) => setBranches(data.data))
      .catch(() => {})
  }, [])

  const fetchLayaways = useCallback(async (currentPage = 1) => {
    setIsLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        page: currentPage, limit: PAGE_SIZE,
      })
      if (selectedBranchId)   params.set('branch_id', selectedBranchId)
      if (statusFilter)       params.set('status', statusFilter)
      if (searchRef.current)  params.set('search', searchRef.current)

      const { data } = await api.get(`layaways?${params}`)
      setLayaways(data.data)
      setPagination(data.pagination)
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al cargar los apartados')
    } finally {
      setIsLoading(false)
    }
  }, [statusFilter, selectedBranchId])

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
  const handleBranchChange = (e) => {
    setSelectedBranchId(e.target.value)
    setPage(1)
  }
  useEffect(() => {
    if (page === 1) fetchLayaways(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, selectedBranchId])

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
            placeholder="Buscar por # de apartado, cliente o teléfono..."
            value={search} onChange={e => handleSearch(e.target.value)}
          />
        </div>
        <select className="lwy-select" value={statusFilter} onChange={handleStatusChange}>
          <option value="">Todos</option>
          <option value="active">Activos</option>
          <option value="completed">Completados</option>
          <option value="cancelled">Cancelados</option>
        </select>

        {/* FIX: visible para todos, no solo admin central */}
        <select className="lwy-select" value={selectedBranchId} onChange={handleBranchChange}>
          <option value="">Todas las sucursales</option>
          {branches.map(b => (
            <option key={b.branch_id} value={b.branch_id}>{b.name}</option>
          ))}
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
                  {isConsolidated && <th>Sucursal</th>}
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
                      {isConsolidated && <td className="lwy-td-muted">{l.branch_name}</td>}
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
                    {isConsolidated && (
                      <span className="lwy-td-muted"><i className="bi bi-shop" />{l.branch_name}</span>
                    )}
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

export default Layaways