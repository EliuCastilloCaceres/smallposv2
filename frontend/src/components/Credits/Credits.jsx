// src/components/Credits/Credits.jsx
import { useState, useEffect, useCallback, useRef } from 'react'
import { useUser }   from '../../Context/UserContext'
import { useBranch } from '../../Context/BranchContext'
import api from '../../services/api'
import CreditDetailModal from './modals/CreditDetailModal'
import AdjustLimitModal from './modals/AdjustLimitModal'
import './credits.css'

const PAGE_SIZE = 20

const money = (n) => Number(n ?? 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const STATUS_META = {
  active:  { label: 'Activo',  cls: 'crd-status--on' },
  overdue: { label: 'Vencido', cls: 'crd-status--off' },
  paid:    { label: 'Pagado',  cls: 'crd-status--neutral' },
  cancelled: { label: 'Cancelado', cls: 'crd-status--neutral' },
}

const Credits = () => {
  const { hasPermission } = useUser()
  // FIX: selectedBranch ya NO se usa para filtrar el listado (eso ahora es
  // el filtro nuevo, ver selectedBranchId más abajo) — se conserva solo
  // para lo que sigue siendo un concepto distinto: la sucursal donde el
  // usuario opera físicamente, necesaria para saber en qué caja aplicar
  // el efectivo de un abono (útil sobre todo para usuarios con sucursal
  // asignada; para un admin central puede venir null, y CreditDetailModal
  // ya lo maneja con su propio selector de sucursal para ese caso)
  const { selectedBranch } = useBranch()
  const canApprove = hasPermission('credit', 'approve')

  const [credits,    setCredits]    = useState([])
  const [pagination, setPagination] = useState({ total: 0, page: 1, totalPages: 1 })
  const [isLoading,  setIsLoading]  = useState(true)
  const [error,      setError]      = useState(null)
  const [search,       setSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page,          setPage]          = useState(1)

  // FIX: filtro de sucursal — a diferencia de Ventas, aquí es visible para
  // TODOS los usuarios (no solo admin central): cualquiera con permiso
  // puede ver y abonar créditos de una sucursal distinta a la suya.
  const [branches,         setBranches]         = useState([])
  const [selectedBranchId, setSelectedBranchId] = useState('')
  const isConsolidated = !selectedBranchId

  const [detailId,    setDetailId]    = useState(null)
  const [adjustOpen,  setAdjustOpen]  = useState(false)
  const [isMarking,   setIsMarking]   = useState(false)

  const searchTimer = useRef(null)
  const searchRef   = useRef('')

  useEffect(() => {
    // FIX: /branches/list en vez de /branches — este último exige el
    // permiso branches:read (administración) y además restringe el
    // listado a la sucursal propia para usuarios no-admin, justo lo
    // opuesto de lo que necesita este filtro
    api.get('branches/list')
      .then(({ data }) => setBranches(data.data))
      .catch(() => {})
  }, [])

  const fetchCredits = useCallback(async (currentPage = 1) => {
    setIsLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        page: currentPage, limit: PAGE_SIZE,
      })
      if (selectedBranchId)   params.set('branch_id', selectedBranchId)
      if (statusFilter)       params.set('status', statusFilter)
      if (searchRef.current)  params.set('search', searchRef.current)

      const { data } = await api.get(`credits?${params}`)
      setCredits(data.data)
      setPagination(data.pagination)
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al cargar los créditos')
    } finally {
      setIsLoading(false)
    }
  }, [statusFilter, selectedBranchId])

  useEffect(() => { fetchCredits(page) }, [page, fetchCredits])

  const handleSearch = (val) => {
    setSearch(val)
    searchRef.current = val
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      setPage(1)
      fetchCredits(1)
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
  // statusFilter/selectedBranchId cambian la identidad de fetchCredits —
  // si page ya estaba en 1, el useEffect de [page, fetchCredits] no se
  // re-dispara solo por eso.
  useEffect(() => {
    if (page === 1) fetchCredits(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, selectedBranchId])

  const handleMarkOverdue = async () => {
    setIsMarking(true)
    try {
      await api.patch('credits/overdue/mark')
      await fetchCredits(page)
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al marcar créditos vencidos')
    } finally {
      setIsMarking(false)
    }
  }

  return (
    <div className="crd-root">
      <div className="crd-header">
        <div>
          <h1 className="crd-header__title">Créditos</h1>
          <span className="crd-header__sub">
            {pagination.total} crédito{pagination.total !== 1 ? 's' : ''} encontrado{pagination.total !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="crd-header__actions">
          <button className="crd-btn crd-btn--ghost" onClick={() => setAdjustOpen(true)}>
            <i className="bi bi-sliders" /> Ajustar límite
          </button>
          {canApprove && (
            <button className="crd-btn crd-btn--ghost" onClick={handleMarkOverdue} disabled={isMarking}>
              {isMarking ? <span className="crd-spinner" /> : <><i className="bi bi-exclamation-triangle" /> Marcar vencidos</>}
            </button>
          )}
        </div>
      </div>

      <div className="crd-filters">
        <div className="crd-search">
          <i className="bi bi-search crd-search__icon" />
          <input
            type="text" className="crd-search__input"
            placeholder="Buscar por # de crédito, cliente o teléfono..."
            value={search} onChange={e => handleSearch(e.target.value)}
          />
        </div>
        <select className="crd-select" value={statusFilter} onChange={handleStatusChange}>
          <option value="">Activos y vencidos</option>
          <option value="active">Activos</option>
          <option value="overdue">Vencidos</option>
          <option value="paid">Pagados</option>
          <option value="cancelled">Cancelados</option>
        </select>

        {/* FIX: visible para todos, no solo admin central — cualquiera con
            permiso puede ver créditos de otra sucursal */}
        <select className="crd-select" value={selectedBranchId} onChange={handleBranchChange}>
          <option value="">Todas las sucursales</option>
          {branches.map(b => (
            <option key={b.branch_id} value={b.branch_id}>{b.name}</option>
          ))}
        </select>
      </div>

      {error && (
        <div className="crd-alert">
          <i className="bi bi-exclamation-circle" /><span>{error}</span>
          <button onClick={() => setError(null)}><i className="bi bi-x" /></button>
        </div>
      )}

      {isLoading ? (
        <div className="crd-skeleton">
          {[...Array(5)].map((_, i) => <div key={i} className="crd-skeleton__row" />)}
        </div>
      ) : credits.length === 0 ? (
        <div className="crd-empty">
          <i className="bi bi-credit-card" />
          <span>No hay créditos que coincidan con el filtro</span>
        </div>
      ) : (
        <>
          <div className="crd-table-wrap">
            <table className="crd-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Cliente</th>
                  <th>Creado</th>
                  {isConsolidated && <th>Sucursal</th>}
                  <th className="num">Total</th>
                  <th className="num">Pagado</th>
                  <th className="num">Saldo</th>
                  <th>Vence</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {credits.map(c => {
                  const st = STATUS_META[c.status] ?? { label: c.status, cls: '' }
                  return (
                    <tr key={c.credit_sale_id} onClick={() => setDetailId(c.credit_sale_id)}>
                      <td className="crd-folio">#{c.credit_sale_id}</td>
                      <td>{c.first_name} {c.last_name}</td>
                      <td className="crd-td-muted">{fmtDate(c.created_at)}</td>
                      {isConsolidated && <td className="crd-td-muted">{c.branch_name}</td>}
                      <td className="num">{money(c.total_amount)}</td>
                      <td className="num crd-td-muted">{money(c.amount_paid)}</td>
                      <td className="num crd-folio">{money(c.balance)}</td>
                      <td className="crd-td-muted">{fmtDate(c.due_date)}</td>
                      <td>
                        <span className={`crd-status ${st.cls}`}>
                          <span className="crd-status__dot" />{st.label}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="crd-cards">
            {credits.map(c => {
              const st = STATUS_META[c.status] ?? { label: c.status, cls: '' }
              return (
                <button key={c.credit_sale_id} className="crd-card" onClick={() => setDetailId(c.credit_sale_id)}>
                  <div className="crd-card__top">
                    <span className="crd-card__customer">#{c.credit_sale_id} · {c.first_name} {c.last_name}</span>
                    <span className={`crd-status ${st.cls}`}>
                      <span className="crd-status__dot" />{st.label}
                    </span>
                  </div>
                  <div className="crd-card__meta">
                    <span className="crd-td-muted"><i className="bi bi-calendar-plus" />Creado {fmtDate(c.created_at)}</span>
                    <span className="crd-td-muted"><i className="bi bi-calendar-event" />Vence {fmtDate(c.due_date)}</span>
                    {isConsolidated && (
                      <span className="crd-td-muted"><i className="bi bi-shop" />{c.branch_name}</span>
                    )}
                  </div>
                  <div className="crd-card__total">
                    <span className="crd-td-muted">Saldo pendiente</span>
                    <strong>{money(c.balance)}</strong>
                  </div>
                </button>
              )
            })}
          </div>

          {pagination.totalPages > 1 && (
            <div className="crd-pagination">
              <button className="crd-btn crd-btn--ghost crd-btn--icon"
                onClick={() => setPage(p => p - 1)} disabled={page === 1}>
                <i className="bi bi-chevron-left" />
              </button>
              <span className="crd-pagination__info">
                Página <strong>{page}</strong> de <strong>{pagination.totalPages}</strong>
              </span>
              <button className="crd-btn crd-btn--ghost crd-btn--icon"
                onClick={() => setPage(p => p + 1)} disabled={page === pagination.totalPages}>
                <i className="bi bi-chevron-right" />
              </button>
            </div>
          )}
        </>
      )}

      {detailId && (
        <CreditDetailModal
          creditSaleId={detailId}
          canApprove={canApprove}
          onClose={() => setDetailId(null)}
          onChanged={() => fetchCredits(page)}
          branch = {selectedBranch}
        />
      )}
      {adjustOpen && (
        <AdjustLimitModal onClose={() => setAdjustOpen(false)} onChanged={() => fetchCredits(page)} />
      )}
    </div>
  )
}

export default Credits