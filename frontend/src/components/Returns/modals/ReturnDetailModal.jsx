// src/components/Returns/modals/ReturnDetailModal.jsx
import { useState, useEffect } from 'react'
import { useBranch } from '../../../Context/BranchContext'
import api from '../../../services/api'

const money = (n) => Number(n ?? 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
const fmtDateTime = (d) => new Date(d).toLocaleString('es-MX', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
})
const itemLabel = (d) => d.variant_label ? `${d.product_name} - ${d.variant_label}` : d.product_name

const STATUS_META = {
  completed: { label: 'Completada', cls: 'rtn-status--on' },
  pending:   { label: 'Pendiente',  cls: 'rtn-status--pending' },
  rejected:  { label: 'Rechazada',  cls: 'rtn-status--off' },
}

const REFUND_METHOD_LABEL = { cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia' }

const ReturnDetailModal = ({ returnId, onClose }) => {
  const { selectedBranch } = useBranch()

  const [data,      setData]      = useState(null) // { return, details }
  const [isLoading, setIsLoading] = useState(true)
  const [error,     setError]     = useState(null)

  useEffect(() => {
    if (!selectedBranch) return
    setIsLoading(true)
    setError(null)
    api.get(`returns/${returnId}?branch_id=${selectedBranch.branch_id}`)
      .then(({ data }) => setData(data.data))
      .catch(err => setError(err.response?.data?.message ?? 'No se pudo cargar la devolución'))
      .finally(() => setIsLoading(false))
  }, [returnId, selectedBranch])

  const ret = data?.return
  const st  = ret ? (STATUS_META[ret.status] ?? { label: ret.status, cls: '' }) : null

  return (
    <div className="rtn-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="rtn-modal">
        <div className="rtn-modal__header">
          <h3 className="rtn-modal__title">
            <i className="bi bi-arrow-return-left" /> Devolución {ret ? `#${ret.return_id}` : ''}
          </h3>
          <button className="rtn-modal__close" onClick={onClose} aria-label="Cerrar">
            <i className="bi bi-x-lg" />
          </button>
        </div>

        <div className="rtn-modal__body">
          {error && <div className="rtn-alert"><i className="bi bi-exclamation-circle" /><span>{error}</span></div>}

          {isLoading ? (
            <div className="rtn-detail-loading"><span className="rtn-spinner rtn-spinner--dark" /> Cargando...</div>
          ) : data && (
            <>
              <div className="rtn-detail__meta">
                <div><span className="rtn-td-muted">Fecha</span><strong>{fmtDateTime(ret.created_at)}</strong></div>
                <div><span className="rtn-td-muted">Cliente</span><strong>{ret.first_name} {ret.last_name}</strong></div>
                <div><span className="rtn-td-muted">Venta</span><strong>#{ret.order_id}</strong></div>
                <div><span className="rtn-td-muted">Cajero</span><strong>{ret.user_firstname} {ret.user_lastname}</strong></div>
                <div>
                  <span className="rtn-td-muted">Estado</span>
                  <span className={`rtn-status ${st.cls}`}>
                    <span className="rtn-status__dot" />{st.label}
                  </span>
                </div>
              </div>

              {ret.reason && (
                <div className="rtn-detail__section">
                  <span className="rtn-detail__section-title">Motivo</span>
                  <p className="rtn-detail__notes">{ret.reason}</p>
                </div>
              )}

              <div className="rtn-detail__section">
                <span className="rtn-detail__section-title">Productos devueltos</span>
                <div className="rtn-detail-items">
                  {data.details.map((d, i) => (
                    <div key={i} className="rtn-detail-item">
                      <div className="rtn-detail-item__info">
                        <span className="rtn-detail-item__name">{itemLabel(d)}</span>
                        <span className="rtn-td-muted">{d.quantity} x {money(d.unit_price)}</span>
                      </div>
                      <span className="rtn-detail-item__subtotal">{money(d.unit_price * d.quantity)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rtn-detail__totals">
                <div className="rtn-detail__row">
                  <span>Método de reembolso</span>
                  <span>{ret.payment_method_name ?? (REFUND_METHOD_LABEL[ret.refund_method] ?? 'Sin reembolso')}</span>
                </div>
                <div className="rtn-detail__row rtn-detail__row--total">
                  <span>Monto reembolsado</span>
                  <span>{money(ret.amount_refunded)}</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default ReturnDetailModal
