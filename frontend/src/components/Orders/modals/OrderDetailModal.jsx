// src/components/Sales/modals/OrderDetailModal.jsx
import { useState, useEffect } from 'react'
import api from '../../../services/api'
import ConfirmDialog from '../../Common/ConfirmDialog'
import { openReceiptWindow } from '../../Pos/printReceipt'

const money = (n) => Number(n ?? 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
const fmtDateTime = (d) => new Date(d).toLocaleString('es-MX', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
})

const itemLabel = (d) => d.variant_label ? `${d.product_name} - ${d.variant_label}` : d.product_name

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const CREDIT_STATUS_META = {
  active:    { label: 'Activo',    cls: 'sls-status--on' },
  overdue:   { label: 'Vencido',   cls: 'sls-status--off' },
  paid:      { label: 'Pagado',    cls: 'sls-status--on' },
  cancelled: { label: 'Cancelado', cls: 'sls-status--off' },
}

const OrderDetailModal = ({ orderId, canCancel, onClose, onCancelled }) => {
  // FIX: ya no depende de BranchContext para nada — receipt y branchName
  // ahora vienen de la orden misma (ver handleReprint)
  const [data,      setData]      = useState(null) // { order, details, payments }
  const [isLoading, setIsLoading] = useState(true)
  const [error,     setError]     = useState(null)

  const [confirmCancel, setConfirmCancel] = useState(false)
  const [isCancelling,  setIsCancelling]  = useState(false)
  const [cancelError,   setCancelError]   = useState(null)

  useEffect(() => {
    // FIX: ya no depende de selectedBranch — con el filtro de sucursal
    // nuevo en Orders.jsx (vista "Todas las sucursales" para admin
    // central), selectedBranch puede no estar poblado y este guard dejaba
    // el modal en "Cargando venta..." para siempre. El backend ya resuelve
    // la sucursal correcta por su cuenta (resolveOptionalBranchId) sin
    // necesitar que se la mandemos.
    setIsLoading(true)
    setError(null)
    api.get(`orders/${orderId}`)
      .then(({ data }) => setData(data.data))
      .catch(err => setError(err.response?.data?.message ?? 'No se pudo cargar la venta'))
      .finally(() => setIsLoading(false))
  }, [orderId])

  const handleReprint = () => {
    if (!data) return
    const { order, details, payments } = data
    // FIX: receipt y branchName vienen de la orden misma (el backend los
    // agrega vía JOIN a branch_receipts en getOrderById) — ya no de
    // BranchContext, que podía estar vacío en vista consolidada o, peor,
    // apuntar a OTRA sucursal si el admin la había seleccionado antes en
    // otra pantalla (ej. el POS), imprimiendo el ticket con el logo/RFC
    // equivocado
    openReceiptWindow({
      orderId:      order.order_id,
      date:         order.created_at,
      receipt:      order.receipt ?? null,
      branchName:   order.branch_name,
      registerName: order.cash_register_name,
      cashierName:  `${order.user_firstname ?? ''} ${order.user_lastname ?? ''}`.trim(),
      items: details.map(d => ({
        name:         d.product_name,
        variant_label: d.variant_label,
        quantity:      d.quantity,
        unit_price:    d.unit_price,
        subtotal:      d.subtotal,
      })),
      subtotal: order.subtotal,
      discount: order.discount,
      total:    order.total,
      payments: payments.map(p => ({
        name:          p.method_name,
        amount:        p.amount,
        cash_received: p.cash_received,
        cash_change:   p.cash_change,
      })),
      totalChange: payments.reduce((s, p) => s + Number(p.cash_change ?? 0), 0),
    })
  }

  const handleCancel = async () => {
    setIsCancelling(true)
    setCancelError(null)
    try {
      // FIX: se usa la sucursal de LA ORDEN (ya cargada en data.order,
      // orderService.getOrderById devuelve o.* completo), no selectedBranch
      // — evita el crash cuando selectedBranch es null (vista consolidada)
      // y además es la sucursal correcta garantizada, sin importar qué
      // diga el filtro global en ese momento
      await api.patch(`orders/${orderId}/cancel?branch_id=${data.order.branch_id}`)
      setData(prev => ({ ...prev, order: { ...prev.order, status: 'cancelled' } }))
      onCancelled?.(orderId)
      setConfirmCancel(false)
    } catch (err) {
      setCancelError(err.response?.data?.message ?? 'Error al cancelar la venta')
    } finally {
      setIsCancelling(false)
    }
  }

  const order = data?.order

  return (
    <div className="sls-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="sls-modal">
        <div className="sls-modal__header">
          <h3 className="sls-modal__title">
            <i className="bi bi-receipt" /> Venta {order ? `#${order.order_id}` : ''}
          </h3>
          <button className="sls-modal__close" onClick={onClose} aria-label="Cerrar">
            <i className="bi bi-x-lg" />
          </button>
        </div>

        <div className="sls-modal__body">
          {error && (
            <div className="sls-alert">
              <i className="bi bi-exclamation-circle" /><span>{error}</span>
            </div>
          )}
          {cancelError && (
            <div className="sls-alert">
              <i className="bi bi-exclamation-circle" /><span>{cancelError}</span>
            </div>
          )}

          {isLoading ? (
            <div className="sls-detail-loading">
              <span className="sls-spinner sls-spinner--dark" /> Cargando venta...
            </div>
          ) : data && (
            <>
              {/* Encabezado */}
              <div className="sls-detail__meta">
                <div><span className="sls-muted">Fecha</span><strong>{fmtDateTime(order.created_at)}</strong></div>
                <div><span className="sls-muted">Cliente</span><strong>{order.customer_firstname} {order.customer_lastname}</strong></div>
                <div><span className="sls-muted">Cajero</span><strong>{order.user_firstname} {order.user_lastname}</strong></div>
                <div><span className="sls-muted">Caja</span><strong>{order.cash_register_name}</strong></div>
                <div>
                  <span className="sls-muted">Estado</span>
                  <span className={`sls-status ${order.status === 'completed' ? 'sls-status--on' : 'sls-status--off'}`}>
                    <span className="sls-status__dot" />
                    {order.status === 'completed' ? 'Completada' : 'Cancelada'}
                  </span>
                </div>
              </div>

              {/* Items */}
              <div className="sls-detail__section">
                <span className="sls-detail__section-title">Productos</span>
                <div className="sls-detail-items">
                  {data.details.map((d, i) => (
                    <div key={i} className="sls-detail-item">
                      <div className="sls-detail-item__info">
                        <span className="sls-detail-item__name">{itemLabel(d)}</span>
                        <span className="sls-muted">{d.quantity} x {money(d.unit_price)}</span>
                      </div>
                      <span className="sls-detail-item__subtotal">{money(d.subtotal)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Totales */}
              <div className="sls-detail__totals">
                <div className="sls-detail__row"><span>Subtotal</span><span>{money(order.subtotal)}</span></div>
                {order.discount > 0 && (
                  <div className="sls-detail__row"><span>Descuento</span><span>-{money(order.discount)}</span></div>
                )}
                <div className="sls-detail__row sls-detail__row--total"><span>Total</span><span>{money(order.total)}</span></div>
              </div>

              {/* Notas */}
              {order.notes && (
                <div className="sls-detail__section">
                  <span className="sls-detail__section-title">Notas</span>
                  <p className="sls-detail__notes">{order.notes}</p>
                </div>
              )}

              {/* Pagos */}
              <div className="sls-detail__section">
                <span className="sls-detail__section-title">Pagos</span>
                <div className="sls-detail-items">
                  {data.payments.map((p, i) => (
                    <div key={i} className="sls-detail-item">
                      <span className="sls-detail-item__name">{p.method_name}</span>
                      <span className="sls-detail-item__subtotal">{money(p.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Crédito — solo si la venta tuvo una porción a crédito */}
              {data.credit && (
                <div className="sls-detail__section">
                  <span className="sls-detail__section-title">Crédito</span>
                  <div className="sls-detail__totals">
                    <div className="sls-detail__row">
                      <span>Crédito</span>
                      <span>#{data.credit.credit_sale_id}</span>
                    </div>
                    <div className="sls-detail__row">
                      <span>Estado</span>
                      <span className={`sls-status ${(CREDIT_STATUS_META[data.credit.status] ?? {}).cls ?? ''}`}>
                        <span className="sls-status__dot" />
                        {(CREDIT_STATUS_META[data.credit.status] ?? {}).label ?? data.credit.status}
                      </span>
                    </div>
                    <div className="sls-detail__row">
                      <span>Último abono</span>
                      <span>
                        {data.credit.last_payment
                          ? `${money(data.credit.last_payment.amount)} · ${fmtDate(data.credit.last_payment.created_at)}`
                          : 'Sin abonos aún'}
                      </span>
                    </div>
                    <div className="sls-detail__row"><span>Vence</span><span>{fmtDate(data.credit.due_date)}</span></div>
                    <div className="sls-detail__row sls-detail__row--total"><span>Saldo pendiente</span><span>{money(data.credit.balance)}</span></div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="sls-modal__footer">
          <button type="button" className="sls-btn sls-btn--ghost" onClick={handleReprint} disabled={!data}>
            <i className="bi bi-printer" /> Reimprimir ticket
          </button>
          {canCancel && order?.status === 'completed' && (
            <button type="button" className="sls-btn sls-btn--danger-ghost"
              onClick={() => setConfirmCancel(true)}>
              <i className="bi bi-x-circle" /> Cancelar venta
            </button>
          )}
        </div>
      </div>

      {confirmCancel && (
        <ConfirmDialog
          title="Cancelar venta"
          message={`¿Cancelar la venta #${orderId}? Se restaurará el stock de los productos y se revertirá el efectivo/crédito de esta venta. Esta acción no se puede deshacer.`}
          confirmLabel="Cancelar venta"
          variant="danger"
          onClose={() => setConfirmCancel(false)}
          onConfirm={handleCancel}
        />
      )}
    </div>
  )
}

export default OrderDetailModal