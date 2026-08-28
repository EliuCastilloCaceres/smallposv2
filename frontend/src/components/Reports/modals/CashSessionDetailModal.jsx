// src/components/Reports/modals/CashSessionDetailModal.jsx
import { useState, useEffect } from 'react'
import api from '../../../services/api'
import { fmtDateTime } from '../../../utils/dateFormatter'

const money = (n) => Number(n ?? 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })


const MOVEMENT_LABELS = {
  sale:            'Venta',
  income:          'Ingreso manual',
  credit_payment:  'Abono de crédito',
  layaway_payment: 'Abono de apartado',
  expense:         'Retiro / gasto',
  return:          'Devolución / reversa',
}

const DiffRow = ({ diff }) => {
  if (diff === null) return <span className="rpt-muted">Sesión abierta — aún sin cerrar</span>
  const isZero = Math.abs(diff) < 0.01
  return (
    <span className={`rpt-diff ${isZero ? 'rpt-diff--zero' : diff > 0 ? 'rpt-diff--pos' : 'rpt-diff--neg'}`}>
      {isZero ? 'Cuadrada' : `${diff > 0 ? 'Sobrante' : 'Faltante'} de ${money(Math.abs(diff))}`}
    </span>
  )
}

const CashSessionDetailModal = ({ sessionId, onClose }) => {
  const [data,      setData]      = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error,     setError]     = useState(null)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setError(null)
    api.get(`reports/cash-sessions/${sessionId}`)
      .then(({ data }) => { if (!cancelled) setData(data.data) })
      .catch(err => { if (!cancelled) setError(err.response?.data?.message ?? 'Error al cargar la sesión') })
      .finally(() => { if (!cancelled) setIsLoading(false) })
    return () => { cancelled = true }
  }, [sessionId])

  return (
    <div className="rpt-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="rpt-modal">
        <div className="rpt-modal__header">
          <h3 className="rpt-modal__title">
            <i className="bi bi-cash-stack" />
            {data ? `${data.registerName} — ${data.branchName}` : 'Sesión de caja'}
          </h3>
          <button className="rpt-modal__close" onClick={onClose} aria-label="Cerrar"><i className="bi bi-x-lg" /></button>
        </div>

        <div className="rpt-modal__body">
          {isLoading ? (
            <div className="rpt-detail-loading"><span className="rpt-spinner rpt-spinner--dark" />Cargando...</div>
          ) : error ? (
            <div className="rpt-alert"><i className="bi bi-exclamation-circle" /><span>{error}</span></div>
          ) : data && (
            <>
              {/* ── Metadatos ── */}
              <div className="rpt-detail__meta">
                <div><span className="rpt-muted">Cajero</span><strong>{data.cashierName}</strong></div>
                <div><span className="rpt-muted">Estado</span><strong>{data.isOpen ? 'Abierta' : 'Cerrada'}</strong></div>
                <div><span className="rpt-muted">Apertura</span><strong>{fmtDateTime(data.openedAt)}</strong></div>
                <div><span className="rpt-muted">Cierre</span><strong>{fmtDateTime(data.closedAt)}</strong></div>
              </div>

              {/* ── Corte de caja ── */}
              <div className="rpt-detail__section">
                <span className="rpt-detail__section-title">Corte de caja</span>
                <div className="rpt-detail__totals">
                  <div className="rpt-detail__row"><span>Fondo inicial</span><span>{money(data.openAmount)}</span></div>
                  <div className="rpt-detail__row"><span>Efectivo esperado</span><span>{money(data.expected)}</span></div>
                  <div className="rpt-detail__row"><span>Efectivo contado</span><span>{data.closeAmount === null ? '—' : money(data.closeAmount)}</span></div>
                  <div className="rpt-detail__row rpt-detail__row--total">
                    <span>Diferencia</span>
                    <DiffRow diff={data.difference} />
                  </div>
                </div>
              </div>

              {/* ── Ventas por método de pago ── */}
              <div className="rpt-detail__section">
                <span className="rpt-detail__section-title">Ventas por método de pago</span>
                <div className="rpt-detail-list">
                  {data.paymentBreakdown.every(m => m.total === 0) ? (
                    <span className="rpt-muted">Sin cobros en esta sesión</span>
                  ) : data.paymentBreakdown.filter(m => m.total !== 0).map(m => (
                    <div key={m.payment_method_id} className="rpt-detail-list__row">
                      <span className="rpt-detail-list__name">{m.name}</span>
                      <span className="rpt-detail-list__amt">{money(m.total)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Estadísticas de ventas ── */}
              <div className="rpt-detail__section">
                <span className="rpt-detail__section-title">Ventas</span>
                <div className="rpt-detail-list">
                  <div className="rpt-detail-list__row"><span className="rpt-detail-list__name">Órdenes completadas</span><span className="rpt-detail-list__amt">{data.stats.totalOrders}</span></div>
                  <div className="rpt-detail-list__row"><span className="rpt-detail-list__name">Total vendido</span><span className="rpt-detail-list__amt">{money(data.stats.totalSales)}</span></div>
                  <div className="rpt-detail-list__row"><span className="rpt-detail-list__name">Descuentos otorgados</span><span className="rpt-detail-list__amt">{money(data.stats.totalDiscounts)}</span></div>
                  <div className="rpt-detail-list__row"><span className="rpt-detail-list__name">Ticket promedio</span><span className="rpt-detail-list__amt">{money(data.stats.avgTicket)}</span></div>
                  <div className="rpt-detail-list__row"><span className="rpt-detail-list__name">Ventas canceladas</span><span className="rpt-detail-list__amt">{data.stats.cancelledCount}</span></div>
                  {data.stats.topProduct && (
                    <div className="rpt-detail-list__row"><span className="rpt-detail-list__name">Producto más vendido</span><span className="rpt-detail-list__amt">{data.stats.topProduct}</span></div>
                  )}
                </div>
              </div>

              {/* ── Movimientos de caja ── */}
              {data.movements.length > 0 && (
                <div className="rpt-detail__section">
                  <span className="rpt-detail__section-title">Movimientos de caja</span>
                  <div className="rpt-detail-list">
                    {data.movements.map((m, idx) => (
                      <div key={idx} className="rpt-detail-list__row">
                        <span className="rpt-detail-list__name">
                          {MOVEMENT_LABELS[m.movement_type] ?? m.movement_type}
                          {m.description && <span className="rpt-muted"> — {m.description}</span>}
                        </span>
                        <span className="rpt-detail-list__amt">{money(m.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Productos vendidos ── */}
              {data.productsSold.length > 0 && (
                <div className="rpt-detail__section">
                  <span className="rpt-detail__section-title">Productos vendidos</span>
                  <div className="rpt-detail-list">
                    {data.productsSold.map((p, idx) => (
                      <div key={idx} className="rpt-detail-list__row">
                        <span className="rpt-detail-list__name">
                          {p.product_name}{p.variant_label ? ` - ${p.variant_label}` : ''}
                        </span>
                        <span className="rpt-detail-list__amt">{p.total_sold} uds.</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default CashSessionDetailModal
