// src/components/Pos/modals/CloseRegisterModal.jsx
// Corte de caja: tabla con una fila por método de pago activo. Solo la fila
// de EFECTIVO cierra la caja de verdad (es lo único que el backend persiste
// en cash_register_sessions.close_amount); las demás filas son de
// verificación visual contra la terminal/registro externo, no se guardan.
//
// "Retirar efectivo": resta del saldo final mostrado y, al confirmar, se
// registra como un movimiento real de retiro (expense) ANTES de cerrar la
// caja — así el backend recalcula el esperado ya neto del retiro y la
// diferencia sigue cuadrando correctamente.

import { useState, useEffect, useMemo } from 'react'
import { usePos } from '../../../Context/PosContext'
import { openCorteReportWindow } from '../printCorteReport'

const money = (n) => Number(n ?? 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })

const diffClass = (diff) => {
  if (diff < 0) return 'pos-cut-diff--neg'
  if (diff === 0) return 'pos-cut-diff--zero'
  return 'pos-cut-diff--pos'
}

const CloseRegisterModal = ({ onClose }) => {
  const { activeRegister, fetchRegisterStatus, closeRegister, createCashMovement } = usePos()

  const [status,        setStatus]        = useState(null) // { session, movements, paymentBreakdown, summary }
  const [loadingStatus, setLoadingStatus] = useState(true)
  const [counted,       setCounted]       = useState({}) // { [payment_method_id]: 'string' }
  const [withdrawal,    setWithdrawal]    = useState('')
  const [isSaving,      setIsSaving]      = useState(false)
  const [error,         setError]         = useState(null)
  const [result,        setResult]        = useState(null)

  useEffect(() => {
    fetchRegisterStatus()
      .then(data => {
        setStatus(data)
        // Precargar cada "contado" con el esperado — el cajero solo ajusta
        // si hay diferencia, en vez de escribir todo desde cero.
        const initial = {}
        data.paymentBreakdown.forEach(m => { initial[m.payment_method_id] = String(m.expected) })
        setCounted(initial)
      })
      .catch(() => setError('No se pudo cargar el estado de la caja'))
      .finally(() => setLoadingStatus(false))
  }, [fetchRegisterStatus])

  const cashRow = status?.paymentBreakdown.find(m => m.code === 'cash')
  const cashCounted = Number(counted[cashRow?.payment_method_id]) || 0
  const withdrawAmt  = Number(withdrawal) || 0
  const finalCashBalance = +(cashCounted - withdrawAmt).toFixed(2)

  const withdrawError = withdrawAmt > cashCounted
    ? 'No puedes retirar más de lo contado en efectivo'
    : null

  const handleCountChange = (methodId, value) => {
    setCounted(prev => ({ ...prev, [methodId]: value }))
  }

  const handleConfirm = async () => {
    if (!cashRow) return
    if (counted[cashRow.payment_method_id] === '' || isNaN(cashCounted)) {
      setError('Ingresa el monto de efectivo contado')
      return
    }
    if (withdrawAmt < 0) { setError('El retiro no puede ser negativo'); return }
    if (withdrawError) { setError(withdrawError); return }

    setIsSaving(true)
    setError(null)
    try {
      if (withdrawAmt > 0) {
        await createCashMovement({
          movementType: 'expense',
          amount:       withdrawAmt,
          description:  'Retiro en corte de caja',
        })
      }
      const data = await closeRegister(finalCashBalance)
      if (data) {
        const fullResult = { ...data, withdrawAmt }
        setResult(fullResult)
        // Se genera el reporte automáticamente al cerrar, como pediste.
        // Si el navegador bloquea la ventana emergente, queda el botón
        // "Imprimir reporte" en la pantalla de resultado como respaldo.
        openCorteReportWindow(fullResult)
      } else {
        setError('No se pudo cerrar la caja, intenta de nuevo')
      }
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al procesar el corte de caja')
    } finally {
      setIsSaving(false)
    }
  }

  const handlePrintReport = () => {
    if (result) openCorteReportWindow(result)
  }

  return (
    <div className="pos-overlay" onClick={e => e.target === e.currentTarget && !result && onClose()}>
      <div className="pos-modal pos-modal--lg">
        <div className="pos-modal__header">
          <h3 className="pos-modal__title"><i className="bi bi-calculator" /> Corte de caja</h3>
          {!result && (
            <button className="pos-modal__close" onClick={onClose} aria-label="Cerrar"><i className="bi bi-x-lg" /></button>
          )}
        </div>

        <div className="pos-modal__body">
          {!result ? (
            <>
              <p style={{ fontSize: 13, color: 'var(--pos-muted)', margin: 0 }}>{activeRegister?.name}</p>

              {error && (
                <div className="pos-alert pos-alert--error"><i className="bi bi-exclamation-circle" /><span>{error}</span></div>
              )}

              {loadingStatus ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--pos-muted)', fontSize: 13 }}>
                  <span className="pos-spinner pos-spinner--dark" /> Calculando saldos esperados...
                </div>
              ) : status && (
                <>
                  <div className="pos-cut-table">
                    <div className="pos-cut-table__head">
                      <span>Método</span>
                      <span>Calculado</span>
                      <span>Contado</span>
                      <span>Diferencia</span>
                    </div>
                    {status.paymentBreakdown.map(m => {
                      const c    = Number(counted[m.payment_method_id]) || 0
                      const diff = +(c - m.expected).toFixed(2)
                      return (
                        <div key={m.payment_method_id} className="pos-cut-table__row">
                          <span className="pos-cut-table__method">
                            <i className={`bi ${m.code === 'cash' ? 'bi-cash' : m.code === 'credit' ? 'bi-clock-history' : 'bi-credit-card'}`} />
                            {m.name}
                          </span>
                          <input className="pos-cut-input" type="number" value={m.expected} disabled />
                          <input
                            className="pos-cut-input"
                            type="number" step="0.01" inputMode="decimal"
                            value={counted[m.payment_method_id] ?? ''}
                            onChange={e => handleCountChange(m.payment_method_id, e.target.value)}
                          />
                          <input
                            className={`pos-cut-input ${diffClass(diff)}`}
                            type="number" value={diff} disabled
                          />
                        </div>
                      )
                    })}
                  </div>

                  <div className="pos-cut-withdraw">
                    <label htmlFor="cut-withdraw"><i className="bi bi-cash-stack" /> Retirar efectivo</label>
                    <input
                      id="cut-withdraw" className="pos-cut-input"
                      type="number" min="0" step="0.01" inputMode="decimal"
                      value={withdrawal}
                      onChange={e => setWithdrawal(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>

                  <div className="pos-cut-final">
                    <span>Saldo en efectivo que quedaría en caja</span>
                    <strong>{money(finalCashBalance)}</strong>
                  </div>
                </>
              )}
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                padding: '16px 12px', borderRadius: 'var(--pos-radius)',
                background: result.difference === 0 ? 'var(--pos-green-bg)' : 'var(--pos-warn-bg)',
              }}>
                <i className={`bi ${result.difference === 0 ? 'bi-check-circle' : 'bi-exclamation-triangle'}`}
                  style={{ fontSize: 28, color: result.difference === 0 ? 'var(--pos-green)' : 'var(--pos-warn)' }} />
                <span style={{ fontWeight: 700, fontSize: 15 }}>
                  {result.difference === 0 ? 'Caja cuadrada' : `Diferencia de ${money(Math.abs(result.difference))} ${result.difference > 0 ? 'sobrante' : 'faltante'}`}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--pos-muted)' }}>Esperado (neto del retiro)</span><span>{money(result.expectedClose)}</span>
              </div>
              {result.withdrawAmt > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'var(--pos-muted)' }}>Retirado</span><span>{money(result.withdrawAmt)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--pos-muted)' }}>Queda en caja</span><span>{money(result.closeAmount)}</span>
              </div>
            </div>
          )}
        </div>

        <div className="pos-modal__footer">
          {!result ? (
            <>
              <button type="button" className="pos-btn pos-btn--ghost" onClick={onClose} disabled={isSaving}>Cancelar</button>
              <button type="button" className="pos-btn pos-btn--danger" onClick={handleConfirm} disabled={isSaving || loadingStatus}>
                {isSaving ? <span className="pos-spinner" /> : <><i className="bi bi-lock" /> Cerrar caja</>}
              </button>
            </>
          ) : (
            <>
              <button type="button" className="pos-btn pos-btn--ghost" onClick={handlePrintReport}>
                <i className="bi bi-printer" /> Imprimir reporte
              </button>
              <button type="button" className="pos-btn pos-btn--primary" style={{ flex: 1 }} onClick={onClose}>
                <i className="bi bi-check-lg" /> Listo
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default CloseRegisterModal