// src/components/Inventory/tabs/MovementsTab.jsx
import { useState, useEffect, useCallback, useRef } from 'react'
import api from '../../../services/api'

const PAGE_SIZE = 30

const OPERATION_LABELS = {
  entry:        { label: 'Entrada',       cls: 'inv-op--entry'    },
  exit:         { label: 'Salida',        cls: 'inv-op--exit'     },
  purchase:     { label: 'Compra',        cls: 'inv-op--entry'    },
  sale:         { label: 'Venta',         cls: 'inv-op--exit'     },
  return:       { label: 'Devolución',    cls: 'inv-op--exit'    },
  adjustment:   { label: 'Ajuste',        cls: 'inv-op--adjust'   },
  transfer_out: { label: 'Traspaso salida', cls: 'inv-op--exit'   },
  transfer_in:  { label: 'Traspaso entrada', cls: 'inv-op--entry' },
}

const OpBadge = ({ type }) => {
  const { label, cls } = OPERATION_LABELS[type] ?? { label: type, cls: '' }
  return <span className={`inv-op-badge ${cls}`}>{label}</span>
}

const fmtDate = (d) => d
  ? new Date(d).toLocaleString('es-MX', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  : '—'

const todayStr = () => {
  const date = new Date();
  const year = date.getFullYear();
  // Añadimos un cero a la izquierda si el mes o día es menor a 10
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
};

const MovementsTab = ({branchId}) => {
  const [movements,  setMovements]  = useState([])
  const [pagination, setPagination] = useState({ total: 0, page: 1, totalPages: 1 })
  const [isLoading,  setIsLoading]  = useState(true)
  const [error,      setError]      = useState(null)

  const [dateFrom,   setDateFrom]   = useState(todayStr())
  const [dateTo,     setDateTo]     = useState(todayStr())
  const [opType,     setOpType]     = useState('')
  const [page,       setPage]       = useState(1)

  const dateFromRef = useRef(todayStr())
  const dateToRef   = useRef(todayStr())
  const opTypeRef   = useRef('')

  const fetchMovements = useCallback(async (currentPage = 1) => {
    if(dateFrom) console.log('fecha: ', dateFrom)
    if(!branchId) return
    setIsLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        page:      currentPage,
        limit:     PAGE_SIZE,
        date_from: dateFromRef.current,
        date_to:   dateToRef.current,
        branch_id: branchId
      })
      if (opTypeRef.current) params.set('operation_type', opTypeRef.current)

      const { data } = await api.get(`inventory/movements?${params}`)
      setMovements(data.data)
      setPagination(data.pagination)
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al cargar movimientos')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchMovements(page) }, [page, fetchMovements])

  const handleFilter = (setter, ref) => (e) => {
    ref.current = e.target.value
    setter(e.target.value)
    setPage(prev => { if (prev === 1) { fetchMovements(1); return 1 } return 1 })
  }

  return (
    <div className="inv-section">
      {/* ── Filtros ── */}
      <div className="inv-toolbar inv-toolbar--wrap">
        <div className="inv-field inv-field--inline">
          <label className="inv-field__label">Desde</label>
          <input type="date" className="inv-field__input"
            value={dateFrom}
            onChange={handleFilter(setDateFrom, dateFromRef)} />
        </div>
        <div className="inv-field inv-field--inline">
          <label className="inv-field__label">Hasta</label>
          <input type="date" className="inv-field__input"
            value={dateTo}
            onChange={handleFilter(setDateTo, dateToRef)} />
        </div>
        <select className="inv-select" value={opType}
          onChange={handleFilter(setOpType, opTypeRef)}>
          <option value="">Todos los tipos</option>
          {Object.entries(OPERATION_LABELS).map(([key, { label }]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>

      {error && (
        <div className="inv-alert">
          <i className="bi bi-exclamation-circle" /><span>{error}</span>
          <button onClick={() => setError(null)}><i className="bi bi-x" /></button>
        </div>
      )}

      {isLoading ? (
        <div className="inv-skeleton">
          {[...Array(6)].map((_, i) => <div key={i} className="inv-skeleton__row" />)}
        </div>
      ) : movements.length === 0 ? (
        <div className="inv-empty">
          <i className="bi bi-arrow-left-right" />
          <span>No se encontraron movimientos en este período</span>
        </div>
      ) : (
        <>
          {/* ── Tabla (desktop) ── */}
          <div className="inv-table-wrap">
            <table className="inv-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Tipo</th>
                  <th>Producto</th>
                  <th className="num">Cantidad</th>
                  <th className="num">Antes</th>
                  <th className="num">Después</th>
                  <th>Motivo</th>
                  <th>Usuario</th>
                </tr>
              </thead>
              <tbody>
                {movements.map(m => (
                  <tr key={m.movement_id}>
                    <td className="inv-text-muted inv-mono">{fmtDate(m.created_at)}</td>
                    <td><OpBadge type={m.operation_type} /></td>
                    <td>
                      <div className="inv-mov-product">
                        <span className="inv-product-name">{m.product_name}</span>
                        {m.variant_label && (
                          <span className="inv-text-muted">{m.variant_label}</span>
                        )}
                        {m.product_sku && (
                          <span className="inv-sku">SKU: {m.product_sku}</span>
                        )}
                      </div>
                    </td>
                    <td className="num">
                      <span className={m.quantity > 0 ? 'inv-qty--pos' : 'inv-qty--neg'}>
                        {m.quantity > 0 ? '+' : ''}{m.quantity}
                      </span>
                    </td>
                    <td className="num inv-td-muted">{m.quantity_before}</td>
                    <td className="num"><strong>{m.quantity_after}</strong></td>
                    <td className="inv-td-muted">{m.reason ?? '—'}</td>
                    <td className="inv-td-muted">{m.username ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Cards (móvil) ── */}
          <div className="inv-cards">
            {movements.map(m => (
              <div key={m.movement_id} className="inv-mov-card">
                <div className="inv-mov-card__top">
                  <OpBadge type={m.operation_type} />
                  <span className="inv-muted inv-mono" style={{ fontSize: '11px' }}>
                    {fmtDate(m.created_at)}
                  </span>
                </div>
                <div className="inv-mov-card__product">
                  <span className="inv-product-name">{m.product_name}</span>
                  {m.variant_label && <span className="inv-muted"> · {m.variant_label}</span>}
                </div>
                <div className="inv-mov-card__meta">
                  <div className="inv-mov-card__stock">
                    <span className="inv-muted">Cantidad</span>
                    <span className={m.quantity > 0 ? 'inv-qty--pos' : 'inv-qty--neg'}>
                      {m.quantity > 0 ? '+' : ''}{m.quantity}
                    </span>
                  </div>
                  <div className="inv-mov-card__stock">
                    <span className="inv-muted">Stock</span>
                    <span>{m.quantity_before} → <strong>{m.quantity_after}</strong></span>
                  </div>
                </div>
                {m.reason && <span className="inv-muted" style={{ fontSize: '12px' }}>{m.reason}</span>}
                {m.username && (
                  <span className="inv-muted" style={{ fontSize: '11px' }}>
                    <i className="bi bi-person" /> {m.username}
                  </span>
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
    </div>
  )
}

export default MovementsTab