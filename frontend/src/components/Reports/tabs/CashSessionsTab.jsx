// src/components/Reports/tabs/CashSessionsTab.jsx
import { useState, useEffect, useCallback } from 'react'
import { useUser } from '../../../Context/UserContext'
import api from '../../../services/api'
import CashSessionDetailModal from '../modals/CashSessionDetailModal'

const PAGE_SIZE = 20

const money = (n) => Number(n ?? 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
const fmtDateTime = (d) => d ? new Date(d).toLocaleString('es-MX', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
}) : '—'
// [FIX] mismo criterio que SalesTab: fecha local, no UTC (Mérida es UTC-6,
// toISOString() adelanta el día desde media tarde en adelante).
const todayStr = () => {
  const d    = new Date()
  const yyyy = d.getFullYear()
  const mm   = String(d.getMonth() + 1).padStart(2, '0')
  const dd   = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

const DiffLabel = ({ diff }) => {
  if (diff === null) return <span className="rpt-muted">—</span>
  const cls = Math.abs(diff) < 0.01 ? 'rpt-diff--zero' : diff > 0 ? 'rpt-diff--pos' : 'rpt-diff--neg'
  return <span className={`rpt-diff ${cls}`}>{diff > 0 ? '+' : ''}{money(diff)}</span>
}

const StatusBadge = ({ session }) => {
  if (session.isOpen) {
    return <span className="rpt-status rpt-status--open"><span className="rpt-status__dot" />Abierta</span>
  }
  const hasDiff = session.difference !== null && Math.abs(session.difference) >= 0.01
  return hasDiff
    ? <span className="rpt-status rpt-status--diff"><span className="rpt-status__dot" />Con diferencia</span>
    : <span className="rpt-status rpt-status--ok"><span className="rpt-status__dot" />Cuadrada</span>
}

const CashSessionsTab = () => {
  const { isCentralAdmin } = useUser()

  const [sessions,   setSessions]   = useState([])
  const [pagination, setPagination] = useState({ total: 0, page: 1, totalPages: 1 })
  const [summary,    setSummary]    = useState({ sessionCount: 0, openCount: 0, withDifferenceCount: 0, totalSold: 0 })
  const [isLoading,  setIsLoading]  = useState(true)
  const [error,      setError]      = useState(null)

  // Filtros — rango de fecha por defecto: hoy, igual que SalesTab
  const [startDate, setStartDate] = useState(todayStr())
  const [endDate,   setEndDate]   = useState(todayStr())
  const [page,      setPage]      = useState(1)
  const [onlyDiff,  setOnlyDiff]  = useState(false)

  const [branches,         setBranches]         = useState([])
  const [selectedBranchId, setSelectedBranchId] = useState('')
  const [registers,         setRegisters]         = useState([])
  const [selectedRegisterId, setSelectedRegisterId] = useState('')

  const [detailId, setDetailId] = useState(null)

  useEffect(() => {
    if (!isCentralAdmin) return
    api.get('branches?is_active=true').then(({ data }) => setBranches(data.data)).catch(() => {})
  }, [isCentralAdmin])

  useEffect(() => {
    api.get('cash-registers').then(({ data }) => setRegisters(data.data)).catch(() => {})
  }, [])

  const fetchSessions = useCallback(async (currentPage = 1) => {
    setIsLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        page: currentPage, limit: PAGE_SIZE,
        date_from: startDate, date_to: endDate,
      })
      if (isCentralAdmin && selectedBranchId) params.set('branch_id', selectedBranchId)
      if (selectedRegisterId) params.set('cash_register_id', selectedRegisterId)
      if (onlyDiff) params.set('only_with_difference', 'true')

      const { data } = await api.get(`reports/cash-sessions?${params}`)
      setSessions(data.data)
      setPagination(data.pagination)
      setSummary(data.summary)
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al cargar las sesiones de caja')
    } finally {
      setIsLoading(false)
    }
  }, [startDate, endDate, isCentralAdmin, selectedBranchId, selectedRegisterId, onlyDiff])

  useEffect(() => { fetchSessions(page) }, [page, fetchSessions])

  // Igual que SalesTab: cambiar cualquier filtro regresa a página 1; si ya
  // estaba en 1, el useEffect de [page, fetchSessions] no se re-dispara
  // solo (page no cambió), así que se fuerza el refetch aquí.
  useEffect(() => {
    if (page === 1) fetchSessions(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, selectedBranchId, selectedRegisterId, onlyDiff])

  const handleDateChange = (setter) => (e) => { setter(e.target.value); setPage(1) }
  const handleBranchChange = (e) => { setSelectedBranchId(e.target.value); setPage(1) }
  const handleRegisterChange = (e) => { setSelectedRegisterId(e.target.value); setPage(1) }
  const toggleOnlyDiff = () => { setOnlyDiff(v => !v); setPage(1) }

  return (
    <div className="rpt-panel">
      {/* ── KPIs ── */}
      <div className="rpt-kpis">
        <div className="rpt-kpi">
          <span className="rpt-kpi__label">Sesiones en el rango</span>
          <span className="rpt-kpi__value">{summary.sessionCount}</span>
        </div>
        <div className={`rpt-kpi ${summary.openCount > 0 ? 'rpt-kpi--warn' : ''}`}>
          <span className="rpt-kpi__label">Cajas abiertas</span>
          <span className="rpt-kpi__value">{summary.openCount}</span>
        </div>
        <div className={`rpt-kpi ${summary.withDifferenceCount > 0 ? 'rpt-kpi--alert' : ''}`}>
          <span className="rpt-kpi__label">Con diferencia</span>
          <span className="rpt-kpi__value">{summary.withDifferenceCount}</span>
        </div>
        <div className="rpt-kpi">
          <span className="rpt-kpi__label">Total vendido</span>
          <span className="rpt-kpi__value">{money(summary.totalSold)}</span>
        </div>
      </div>

      <span className="rpt-panel__count">
        {pagination.total} sesión{pagination.total !== 1 ? 'es' : ''} encontrada{pagination.total !== 1 ? 's' : ''}
      </span>

      {/* ── Filtros ── */}
      <div className="rpt-filters">
        <input
          type="date" className="rpt-select" value={startDate} max={endDate}
          onChange={handleDateChange(setStartDate)}
        />
        <input
          type="date" className="rpt-select" value={endDate} min={startDate}
          onChange={handleDateChange(setEndDate)}
        />

        {isCentralAdmin && (
          <select className="rpt-select" value={selectedBranchId} onChange={handleBranchChange}>
            <option value="">Todas las sucursales</option>
            {branches.map(b => (
              <option key={b.branch_id} value={b.branch_id}>{b.name}</option>
            ))}
          </select>
        )}

        <select className="rpt-select" value={selectedRegisterId} onChange={handleRegisterChange}>
          <option value="">Todas las cajas</option>
          {registers.map(r => (
            <option key={r.cash_register_id} value={r.cash_register_id}>
              {r.name}{r.branch_name ? ` — ${r.branch_name}` : ''}
            </option>
          ))}
        </select>

        <button
          type="button"
          className={`rpt-toggle ${onlyDiff ? 'rpt-toggle--active' : ''}`}
          onClick={toggleOnlyDiff}
        >
          <i className="bi bi-exclamation-triangle" />
          Solo con diferencia
        </button>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="rpt-alert">
          <i className="bi bi-exclamation-circle" />
          <span>{error}</span>
          <button onClick={() => setError(null)}><i className="bi bi-x" /></button>
        </div>
      )}

      {/* ── Contenido ── */}
      {isLoading ? (
        <div className="rpt-skeleton">
          {[...Array(5)].map((_, i) => <div key={i} className="rpt-skeleton__row" />)}
        </div>
      ) : sessions.length === 0 ? (
        <div className="rpt-empty">
          <i className="bi bi-cash-stack" />
          <span>No se encontraron sesiones en este rango</span>
        </div>
      ) : (
        <>
          {/* ── Tabla (desktop) ── */}
          <div className="rpt-table-wrap">
            <table className="rpt-table">
              <thead>
                <tr>
                  <th>Caja</th>
                  {isCentralAdmin && !selectedBranchId && <th>Sucursal</th>}
                  <th>Cajero</th>
                  <th>Apertura</th>
                  <th>Cierre</th>
                  <th className="num">Vendido</th>
                  <th className="num">Diferencia</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map(s => (
                  <tr key={s.sessionId} onClick={() => setDetailId(s.sessionId)}>
                    <td className="rpt-folio">{s.registerName}</td>
                    {isCentralAdmin && !selectedBranchId && <td className="rpt-td-muted">{s.branchName}</td>}
                    <td>{s.openedBy}</td>
                    <td className="rpt-td-muted">{fmtDateTime(s.openedAt)}</td>
                    <td className="rpt-td-muted">{fmtDateTime(s.closedAt)}</td>
                    <td className="num">{money(s.totalSold)}</td>
                    <td className="num"><DiffLabel diff={s.difference} /></td>
                    <td><StatusBadge session={s} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Cards (móvil) ── */}
          <div className="rpt-cards">
            {sessions.map(s => (
              <button key={s.sessionId} className="rpt-card" onClick={() => setDetailId(s.sessionId)}>
                <div className="rpt-card__top">
                  <span className="rpt-folio">{s.registerName}</span>
                  <StatusBadge session={s} />
                </div>
                <div className="rpt-card__meta">
                  {isCentralAdmin && !selectedBranchId && (
                    <span className="rpt-muted"><i className="bi bi-shop" />{s.branchName}</span>
                  )}
                  <span className="rpt-muted"><i className="bi bi-person-badge" />{s.openedBy}</span>
                  <span className="rpt-muted"><i className="bi bi-box-arrow-in-right" />{fmtDateTime(s.openedAt)}</span>
                  <span className="rpt-muted"><i className="bi bi-box-arrow-right" />{fmtDateTime(s.closedAt)}</span>
                </div>
                <div className="rpt-card__total">
                  <span className="rpt-muted">Vendido</span>
                  <strong>{money(s.totalSold)}</strong>
                </div>
                <div className="rpt-card__total">
                  <span className="rpt-muted">Diferencia</span>
                  <DiffLabel diff={s.difference} />
                </div>
              </button>
            ))}
          </div>

          {/* ── Paginación ── */}
          {pagination.totalPages > 1 && (
            <div className="rpt-pagination">
              <button className="rpt-btn rpt-btn--ghost rpt-btn--icon"
                onClick={() => setPage(p => p - 1)} disabled={page === 1}>
                <i className="bi bi-chevron-left" />
              </button>
              <span className="rpt-pagination__info">
                Página <strong>{page}</strong> de <strong>{pagination.totalPages}</strong>
              </span>
              <button className="rpt-btn rpt-btn--ghost rpt-btn--icon"
                onClick={() => setPage(p => p + 1)} disabled={page === pagination.totalPages}>
                <i className="bi bi-chevron-right" />
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Detalle ── */}
      {detailId && (
        <CashSessionDetailModal
          sessionId={detailId}
          onClose={() => setDetailId(null)}
        />
      )}
    </div>
  )
}

export default CashSessionsTab
