// src/components/Purchases/modals/PurchaseDetailModal.jsx
// Detalle de una compra y su cancelación (specs/14-modulo-de-compras.md,
// requisitos 16–19 y 34). Una compra no se edita: se cancela con motivo, y el
// inventario se revierte todo o nada; si a una línea le falta stock, el
// backend responde 409 y se muestra su mensaje. El costo de los productos no
// se revierte. Si se pagó desde caja, se registra el reingreso mientras su
// sesión siga abierta; si ya se cerró, se avisa. Con purchases.create, el
// comprobante de una compra activa se agrega o se reemplaza aquí
// (specs/15-comprobante-despues-de-guardar.md).
import { useEffect, useState } from 'react'
import api from '../../../services/api'
import { fmtDateTime } from '../../../utils/dateFormatter'
import { money, fmtPurchaseDate, openPurchaseReceipt, downloadPurchaseReceipt } from '../purchaseForm'
import ReceiptUploadButton from '../../Expenses/ReceiptUploadButton'
import '../purchases.css'

const SESSION_CLOSED_NOTICE =
  'La sesión de caja ya se cerró, así que no se registró el reingreso. ' +
  'Si el dinero regresó, regístralo como Ingreso manual en la caja abierta.'

const COST_NOT_REVERTED_NOTICE =
  'El costo de los productos no se revirtió. Si quedó mal, corrígelo en Productos.'

const PurchaseDetailModal = ({ purchaseId, canCancel, canAttach = false, onCancelled, onReceiptSaved, onClose }) => {
  const [purchase,   setPurchase]   = useState(null)
  const [isLoading,  setIsLoading]  = useState(true)
  const [error,      setError]      = useState(null)
  const [cancelMode, setCancelMode] = useState(false)
  const [reason,     setReason]     = useState('')
  const [isSaving,   setIsSaving]   = useState(false)
  const [notice,     setNotice]     = useState(null) // { tone, text }

  useEffect(() => {
    let ignore = false
    setIsLoading(true)
    api.get(`purchases/${purchaseId}`)
      .then(({ data }) => { if (!ignore) setPurchase(data.data) })
      .catch(err => { if (!ignore) setError(err.response?.data?.message ?? 'Error al cargar la compra') })
      .finally(() => { if (!ignore) setIsLoading(false) })
    return () => { ignore = true }
  }, [purchaseId])

  const handleCancel = async () => {
    if (!reason.trim()) { setError('Escribe el motivo de la cancelación'); return }
    setIsSaving(true)
    setError(null)
    try {
      const { data } = await api.post(`purchases/${purchaseId}/cancel`, { reason: reason.trim() })
      const { purchase: cancelled, refund } = data.data
      setPurchase(cancelled)
      setCancelMode(false)
      if (refund === 'session_closed') setNotice({ tone: 'warn', text: SESSION_CLOSED_NOTICE })
      if (refund === 'registered') {
        setNotice({
          tone: 'ok',
          text: `Se registró el reingreso de ${money(cancelled.total)} en ${cancelled.cash_movement.register_name}.`,
        })
      }
      onCancelled?.(cancelled)
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al cancelar la compra')
    } finally {
      setIsSaving(false)
    }
  }

  const handleReceipt = async (action) => {
    try {
      if (action === 'open') await openPurchaseReceipt(purchase.purchase_id)
      else await downloadPurchaseReceipt(purchase.purchase_id, purchase.receipt_name)
    } catch {
      setError('No se pudo abrir el comprobante')
    }
  }

  const handleReceiptSaved = (updated) => {
    setPurchase(updated)
    setError(null)
    setNotice({ tone: 'ok', text: 'Comprobante guardado.' })
    onReceiptSaved?.(updated)
  }

  const handleReceiptError = (message) => {
    setNotice(null)
    setError(message)
  }

  const isCancelled = purchase?.status === 'cancelled'
  const canChangeReceipt = canAttach && purchase && !isCancelled

  return (
    <div className="pur-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="pur-modal pur-modal--wide" role="dialog" aria-label={`Compra #${purchaseId}`}>
        <div className="pur-modal__header">
          <h3 className="pur-modal__title">
            <i className="bi bi-cart-check" /> Compra #{purchaseId}
            {isCancelled && <span className="pur-tag pur-tag--cancelled">Cancelada</span>}
          </h3>
          <button className="pur-modal__close" onClick={onClose} aria-label="Cerrar">
            <i className="bi bi-x-lg" />
          </button>
        </div>

        <div className="pur-modal__body">
          {notice && (
            <div className={`pur-alert pur-alert--${notice.tone}`} role="status">
              <i className={`bi ${notice.tone === 'warn' ? 'bi-exclamation-triangle' : 'bi-check-circle'}`} />
              <span>{notice.text}</span>
            </div>
          )}
          {error && (
            <div className="pur-alert" role="alert">
              <i className="bi bi-exclamation-circle" /><span>{error}</span>
            </div>
          )}

          {isLoading ? (
            <div className="pur-td-muted"><span className="pur-spinner pur-spinner--dark" /> Cargando...</div>
          ) : purchase && (
            <>
              <div>
                <span className={`pur-detail__amount ${isCancelled ? 'pur-detail__amount--cancelled' : ''}`}>
                  {money(purchase.total)}
                </span>
                <div className="pur-desc">{purchase.provider_name}</div>
              </div>

              <div className="pur-detail__meta">
                <div><span>Fecha de la compra</span><strong>{fmtPurchaseDate(purchase.purchase_date)}</strong></div>
                <div><span>Método de pago</span><strong>{purchase.payment_method_name}</strong></div>
                <div><span>Sucursal</span><strong>{purchase.branch_name}</strong></div>
                <div><span>Folio</span><strong>{purchase.folio ?? '—'}</strong></div>
                {purchase.notes && (
                  <div className="pur-detail__full"><span>Notas</span><strong>{purchase.notes}</strong></div>
                )}
                <div className="pur-detail__full">
                  <span>Registrada por</span>
                  <strong>{purchase.created_by_name} · {fmtDateTime(purchase.created_at)}</strong>
                </div>
              </div>

              <div className="pur-section">
                <span className="pur-section__title">Productos ({purchase.items.length})</span>
                <ul className="pur-detail-lines" aria-label="Productos de la compra">
                  {purchase.items.map(item => (
                    <li key={item.purchase_item_id} className="pur-detail-line">
                      <div className="pur-detail-line__product">
                        <span className="pur-line__name">
                          {item.product_name}{item.variant_label && <strong> · {item.variant_label}</strong>}
                        </span>
                        <span className="pur-td-muted">
                          {item.quantity} {item.uom} × {money(item.unit_cost)}
                        </span>
                      </div>
                      <div className="pur-detail-line__cost">
                        <span className="pur-td-muted">Costo del producto</span>
                        <span>{money(item.cost_before)} → <strong>{money(item.cost_after)}</strong></span>
                      </div>
                      <strong className="pur-detail-line__subtotal">{money(item.subtotal)}</strong>
                    </li>
                  ))}
                </ul>
              </div>

              {purchase.cash_movement && (
                <div className="pur-section">
                  <span className="pur-section__title">Salida de caja</span>
                  <span className="pur-td-muted">
                    <span className="pur-tag pur-tag--register"><i className="bi bi-cash-stack" /> Desde caja</span>
                    {' '}{purchase.cash_movement.register_name} · sesión #{purchase.cash_movement.session_id}
                    {purchase.cash_movement.session_open ? ' (abierta)' : ' (cerrada)'}
                  </span>
                </div>
              )}

              <div className="pur-section">
                <span className="pur-section__title">Comprobante</span>
                {purchase.has_receipt ? (
                  <>
                    <div className="pur-detail__actions">
                      <button type="button" className="pur-btn pur-btn--ghost" onClick={() => handleReceipt('open')}>
                        <i className="bi bi-eye" /> Ver comprobante
                      </button>
                      <button type="button" className="pur-btn pur-btn--ghost" onClick={() => handleReceipt('download')}>
                        <i className="bi bi-download" /> Descargar
                      </button>
                      {canChangeReceipt && (
                        <ReceiptUploadButton resource="purchases" recordId={purchase.purchase_id} hasReceipt
                          className="pur-btn pur-btn--ghost"
                          onSaved={handleReceiptSaved} onError={handleReceiptError} />
                      )}
                    </div>
                    {purchase.receipt_uploaded_by_name && (
                      <span className="pur-td-muted">
                        Subido por {purchase.receipt_uploaded_by_name} · {fmtDateTime(purchase.receipt_uploaded_at)}
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <span className="pur-td-muted">Sin comprobante</span>
                    {canChangeReceipt && (
                      <div className="pur-detail__actions">
                        <ReceiptUploadButton resource="purchases" recordId={purchase.purchase_id} hasReceipt={false}
                          className="pur-btn pur-btn--ghost"
                          onSaved={handleReceiptSaved} onError={handleReceiptError} />
                      </div>
                    )}
                  </>
                )}
              </div>

              {isCancelled && (
                <div className="pur-section">
                  <span className="pur-section__title">Cancelación</span>
                  <div className="pur-detail__meta">
                    <div><span>Cancelada por</span><strong>{purchase.cancelled_by_name}</strong></div>
                    <div><span>Fecha</span><strong>{fmtDateTime(purchase.cancelled_at)}</strong></div>
                    <div className="pur-detail__full"><span>Motivo</span><strong>{purchase.cancel_reason}</strong></div>
                    {purchase.paid_from_register && (
                      <div className="pur-detail__full">
                        <span>Reingreso a caja</span>
                        <strong>{purchase.refund_registered ? 'Registrado' : 'Sin reingreso (la sesión ya estaba cerrada)'}</strong>
                      </div>
                    )}
                  </div>
                  <div className="pur-alert pur-alert--info">
                    <i className="bi bi-info-circle" /><span>{COST_NOT_REVERTED_NOTICE}</span>
                  </div>
                </div>
              )}

              {cancelMode && (
                <div className="pur-field">
                  <label className="pur-field__label" htmlFor="pur-cancel-reason">
                    Motivo de la cancelación <span className="pur-field__req">*</span>
                  </label>
                  <textarea id="pur-cancel-reason" className="pur-field__input" maxLength={255} autoFocus
                    placeholder="Ej. Se capturó dos veces"
                    value={reason} onChange={e => setReason(e.target.value)} />
                  <span className="pur-field__hint">
                    Se sacará del inventario lo que entró con la compra. El costo de los productos no cambia.
                  </span>
                  {purchase.paid_from_register && (
                    <span className="pur-field__hint">
                      {purchase.cash_movement.session_open
                        ? `Se registrará el reingreso de ${money(purchase.total)} en ${purchase.cash_movement.register_name}.`
                        : 'La sesión de caja ya se cerró: no se registrará el reingreso.'}
                    </span>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {canCancel && purchase && !isCancelled && (
          <div className="pur-modal__footer">
            {cancelMode ? (
              <>
                <button type="button" className="pur-btn pur-btn--ghost" onClick={() => setCancelMode(false)} disabled={isSaving}>
                  Volver
                </button>
                <button type="button" className="pur-btn pur-btn--danger" onClick={handleCancel} disabled={isSaving}>
                  {isSaving ? <span className="pur-spinner" /> : <><i className="bi bi-x-circle" /> Confirmar cancelación</>}
                </button>
              </>
            ) : (
              <button type="button" className="pur-btn pur-btn--danger-ghost" onClick={() => setCancelMode(true)}>
                <i className="bi bi-x-circle" /> Cancelar compra
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default PurchaseDetailModal
