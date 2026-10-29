// src/components/Expenses/modals/ExpenseDetailModal.jsx
// Detalle de un gasto y su cancelación (specs/12-modulo-de-gastos.md,
// requisitos 13, 14 y 27). Un gasto no se edita: se cancela con motivo. Si se
// pagó desde caja, al cancelarlo se registra el reingreso mientras su sesión
// siga abierta; si ya se cerró, se avisa. Con expenses.create, el
// comprobante de un gasto activo se agrega o se reemplaza aquí
// (specs/15-comprobante-despues-de-guardar.md).
import { useEffect, useState } from 'react'
import api from '../../../services/api'
import { fmtDateTime } from '../../../utils/dateFormatter'
import { money, fmtExpenseDate, openReceipt, downloadReceipt } from '../expenseForm'
import ReceiptUploadButton from '../ReceiptUploadButton'

const SESSION_CLOSED_NOTICE =
  'La sesión de caja ya se cerró, así que no se registró el reingreso. ' +
  'Si el dinero regresó, regístralo como Ingreso manual en la caja abierta.'

const ExpenseDetailModal = ({ expenseId, canCancel, canAttach = false, onCancelled, onReceiptSaved, onClose }) => {
  const [expense,    setExpense]    = useState(null)
  const [isLoading,  setIsLoading]  = useState(true)
  const [error,      setError]      = useState(null)
  const [cancelMode, setCancelMode] = useState(false)
  const [reason,     setReason]     = useState('')
  const [isSaving,   setIsSaving]   = useState(false)
  const [notice,     setNotice]     = useState(null) // { tone, text }

  useEffect(() => {
    let ignore = false
    setIsLoading(true)
    api.get(`expenses/${expenseId}`)
      .then(({ data }) => { if (!ignore) setExpense(data.data) })
      .catch(err => { if (!ignore) setError(err.response?.data?.message ?? 'Error al cargar el gasto') })
      .finally(() => { if (!ignore) setIsLoading(false) })
    return () => { ignore = true }
  }, [expenseId])

  const handleCancel = async () => {
    if (!reason.trim()) { setError('Escribe el motivo de la cancelación'); return }
    setIsSaving(true)
    setError(null)
    try {
      const { data } = await api.post(`expenses/${expenseId}/cancel`, { reason: reason.trim() })
      const { expense: cancelled, refund } = data.data
      setExpense(cancelled)
      setCancelMode(false)
      if (refund === 'session_closed') setNotice({ tone: 'warn', text: SESSION_CLOSED_NOTICE })
      if (refund === 'registered') {
        setNotice({
          tone: 'ok',
          text: `Se registró el reingreso de ${money(cancelled.amount)} en ${cancelled.cash_movement.register_name}.`,
        })
      }
      onCancelled?.(cancelled)
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al cancelar el gasto')
    } finally {
      setIsSaving(false)
    }
  }

  const handleReceipt = async (action) => {
    try {
      if (action === 'open') await openReceipt(expense.expense_id)
      else await downloadReceipt(expense.expense_id, expense.receipt_name)
    } catch {
      setError('No se pudo abrir el comprobante')
    }
  }

  const handleReceiptSaved = (updated) => {
    setExpense(updated)
    setError(null)
    setNotice({ tone: 'ok', text: 'Comprobante guardado.' })
    onReceiptSaved?.(updated)
  }

  const handleReceiptError = (message) => {
    setNotice(null)
    setError(message)
  }

  const isCancelled = expense?.status === 'cancelled'
  const canChangeReceipt = canAttach && expense && !isCancelled

  return (
    <div className="exp-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="exp-modal" role="dialog" aria-label={`Gasto #${expenseId}`}>
        <div className="exp-modal__header">
          <h3 className="exp-modal__title">
            <i className="bi bi-receipt" /> Gasto #{expenseId}
            {isCancelled && <span className="exp-tag exp-tag--cancelled">Cancelado</span>}
          </h3>
          <button className="exp-modal__close" onClick={onClose} aria-label="Cerrar">
            <i className="bi bi-x-lg" />
          </button>
        </div>

        <div className="exp-modal__body">
          {notice && (
            <div className={`exp-alert exp-alert--${notice.tone}`} role="status">
              <i className={`bi ${notice.tone === 'warn' ? 'bi-exclamation-triangle' : 'bi-check-circle'}`} />
              <span>{notice.text}</span>
            </div>
          )}
          {error && (
            <div className="exp-alert" role="alert">
              <i className="bi bi-exclamation-circle" /><span>{error}</span>
            </div>
          )}

          {isLoading ? (
            <div className="exp-td-muted"><span className="exp-spinner exp-spinner--dark" /> Cargando...</div>
          ) : expense && (
            <>
              <div>
                <span className={`exp-detail__amount ${isCancelled ? 'exp-detail__amount--cancelled' : ''}`}>
                  {money(expense.amount)}
                </span>
                <div className="exp-desc">{expense.description}</div>
              </div>

              <div className="exp-detail__meta">
                <div><span>Fecha del gasto</span><strong>{fmtExpenseDate(expense.expense_date)}</strong></div>
                <div><span>Categoría</span><strong>{expense.category_name}</strong></div>
                <div>
                  <span>Método de pago</span>
                  <strong>{expense.payment_method_name}</strong>
                </div>
                <div><span>Sucursal</span><strong>{expense.branch_name}</strong></div>
                <div><span>Proveedor</span><strong>{expense.provider_name ?? '—'}</strong></div>
                <div><span>Folio</span><strong>{expense.folio ?? '—'}</strong></div>
                <div className="exp-detail__full">
                  <span>Registrado por</span>
                  <strong>{expense.created_by_name} · {fmtDateTime(expense.created_at)}</strong>
                </div>
              </div>

              {expense.cash_movement && (
                <div className="exp-detail__section">
                  <span className="exp-detail__section-title">Salida de caja</span>
                  <span className="exp-td-muted">
                    <span className="exp-tag exp-tag--register"><i className="bi bi-cash-stack" /> Desde caja</span>
                    {' '}{expense.cash_movement.register_name} · sesión #{expense.cash_movement.session_id}
                    {expense.cash_movement.session_open ? ' (abierta)' : ' (cerrada)'}
                  </span>
                </div>
              )}

              <div className="exp-detail__section">
                <span className="exp-detail__section-title">Comprobante</span>
                {expense.has_receipt ? (
                  <>
                    <div className="exp-detail__actions">
                      <button type="button" className="exp-btn exp-btn--ghost" onClick={() => handleReceipt('open')}>
                        <i className="bi bi-eye" /> Ver comprobante
                      </button>
                      <button type="button" className="exp-btn exp-btn--ghost" onClick={() => handleReceipt('download')}>
                        <i className="bi bi-download" /> Descargar
                      </button>
                      {canChangeReceipt && (
                        <ReceiptUploadButton resource="expenses" recordId={expense.expense_id} hasReceipt
                          className="exp-btn exp-btn--ghost"
                          onSaved={handleReceiptSaved} onError={handleReceiptError} />
                      )}
                    </div>
                    {expense.receipt_uploaded_by_name && (
                      <span className="exp-td-muted">
                        Subido por {expense.receipt_uploaded_by_name} · {fmtDateTime(expense.receipt_uploaded_at)}
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <span className="exp-td-muted">Sin comprobante</span>
                    {canChangeReceipt && (
                      <div className="exp-detail__actions">
                        <ReceiptUploadButton resource="expenses" recordId={expense.expense_id} hasReceipt={false}
                          className="exp-btn exp-btn--ghost"
                          onSaved={handleReceiptSaved} onError={handleReceiptError} />
                      </div>
                    )}
                  </>
                )}
              </div>

              {isCancelled && (
                <div className="exp-detail__section">
                  <span className="exp-detail__section-title">Cancelación</span>
                  <div className="exp-detail__meta">
                    <div><span>Cancelado por</span><strong>{expense.cancelled_by_name}</strong></div>
                    <div><span>Fecha</span><strong>{fmtDateTime(expense.cancelled_at)}</strong></div>
                    <div className="exp-detail__full"><span>Motivo</span><strong>{expense.cancel_reason}</strong></div>
                    {expense.paid_from_register && (
                      <div className="exp-detail__full">
                        <span>Reingreso a caja</span>
                        <strong>{expense.refund_registered ? 'Registrado' : 'Sin reingreso (la sesión ya estaba cerrada)'}</strong>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {cancelMode && (
                <div className="exp-field">
                  <label className="exp-field__label" htmlFor="exp-cancel-reason">
                    Motivo de la cancelación <span className="exp-field__req">*</span>
                  </label>
                  <textarea id="exp-cancel-reason" className="exp-field__input" maxLength={255} autoFocus
                    placeholder="Ej. Se capturó dos veces"
                    value={reason} onChange={e => setReason(e.target.value)} />
                  {expense.paid_from_register && (
                    <span className="exp-field__hint">
                      {expense.cash_movement.session_open
                        ? `Se registrará el reingreso de ${money(expense.amount)} en ${expense.cash_movement.register_name}.`
                        : 'La sesión de caja ya se cerró: no se registrará el reingreso.'}
                    </span>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {canCancel && expense && !isCancelled && (
          <div className="exp-modal__footer">
            {cancelMode ? (
              <>
                <button type="button" className="exp-btn exp-btn--ghost" onClick={() => setCancelMode(false)} disabled={isSaving}>
                  Volver
                </button>
                <button type="button" className="exp-btn exp-btn--danger" onClick={handleCancel} disabled={isSaving}>
                  {isSaving ? <span className="exp-spinner" /> : <><i className="bi bi-x-circle" /> Confirmar cancelación</>}
                </button>
              </>
            ) : (
              <button type="button" className="exp-btn exp-btn--danger-ghost" onClick={() => setCancelMode(true)}>
                <i className="bi bi-x-circle" /> Cancelar gasto
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default ExpenseDetailModal
