// src/components/Pos/modals/CashMovementsModal.jsx
import { useState, useEffect, useCallback } from 'react'
import { usePos } from '../../../Context/PosContext'
import { fmtDateTime, fmtTime } from '../../../utils/dateFormatter'

const money = (n) => Number(n ?? 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })

// const fmtTime = (iso) => iso
//   ? new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
//   : '—'

const MOVEMENT_LABELS = {
  sale:             { label: 'Venta',            cls: 'pos-mov--in'  },
  income:           { label: 'Ingreso manual',   cls: 'pos-mov--in'  },
  credit_payment:   { label: 'Abono a crédito',  cls: 'pos-mov--in'  },
  layaway_payment:  { label: 'Abono a apartado', cls: 'pos-mov--in'  },
  expense:          { label: 'Retiro manual',    cls: 'pos-mov--out' },
  return:           { label: 'Devolución',       cls: 'pos-mov--out' },
}

const CashMovementsModal = ({ onClose }) => {
  const { activeRegister, fetchRegisterStatus, createCashMovement } = usePos()

  const [status,    setStatus]    = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error,     setError]     = useState(null)

  // Formulario de movimiento manual
  const [showForm,    setShowForm]    = useState(false)
  const [movType,     setMovType]     = useState('income')
  const [amount,      setAmount]      = useState('')
  const [description, setDescription] = useState('')
  const [isSaving,    setIsSaving]    = useState(false)

  const loadStatus = useCallback(async () => {
    setIsLoading(true)
    const data = await fetchRegisterStatus()
    if (data) setStatus(data)
    else setError('No se pudo cargar el estado de la caja')
    setIsLoading(false)
  }, [fetchRegisterStatus])

  useEffect(() => { loadStatus() }, [loadStatus])

  const handleSubmit = async (e) => {
    e.preventDefault()
    const n = Number(amount)
    if (!amount || isNaN(n) || n <= 0) {
      setError('Ingresa un monto válido mayor a 0')
      return
    }
    setIsSaving(true)
    setError(null)
    try {
      await createCashMovement({ movementType: movType, amount: n, description: description.trim() || null })
      setAmount(''); setDescription(''); setShowForm(false)
      await loadStatus()
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al registrar el movimiento')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="pos-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="pos-modal">
        <div className="pos-modal__header">
          <h3 className="pos-modal__title"><i className="bi bi-cash-stack" /> Movimientos de efectivo</h3>
          <button className="pos-modal__close" onClick={onClose} aria-label="Cerrar"><i className="bi bi-x-lg" /></button>
        </div>

        <div className="pos-modal__body">
          <p style={{ fontSize: 13, color: 'var(--pos-muted)', margin: 0 }}>{activeRegister?.name}</p>

          {error && (
            <div className="pos-alert pos-alert--error">
              <i className="bi bi-exclamation-circle" /><span>{error}</span>
            </div>
          )}

          {isLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--pos-muted)', fontSize: 13 }}>
              <span className="pos-spinner pos-spinner--dark" /> Cargando...
            </div>
          ) : status && (
            <>
              {/* Resumen */}
              <div className="pos-cashmov-summary">
                <div><span>Apertura</span><strong>{money(status.summary.open_amount)}</strong></div>
                <div><span>Entradas</span><strong className="pos-mov--in">+{money(status.summary.total_in)}</strong></div>
                <div><span>Salidas</span><strong className="pos-mov--out">-{money(status.summary.total_out)}</strong></div>
                <div className="pos-cashmov-summary__total"><span>Esperado</span><strong>{money(status.summary.expected_close)}</strong></div>
              </div>

              {/* Botón para desplegar formulario */}
              {!showForm && (
                <button type="button" className="pos-btn pos-btn--ghost pos-btn--block" onClick={() => setShowForm(true)}>
                  <i className="bi bi-plus-lg" /> Registrar entrada / salida manual
                </button>
              )}

              {showForm && (
                <form className="pos-cashmov-form" onSubmit={handleSubmit}>
                  <div className="pos-cashmov-form__type">
                    <button type="button"
                      className={`pos-btn ${movType === 'income' ? 'pos-btn--primary' : 'pos-btn--ghost'}`}
                      onClick={() => setMovType('income')}>
                      <i className="bi bi-plus-circle" /> Entrada
                    </button>
                    <button type="button"
                      className={`pos-btn ${movType === 'expense' ? 'pos-btn--danger' : 'pos-btn--ghost'}`}
                      onClick={() => setMovType('expense')}>
                      <i className="bi bi-dash-circle" /> Salida
                    </button>
                  </div>
                  <div className="pos-field pos-field__prefix">
                    <label className="pos-field__label">Monto</label>
                    <span>$</span>
                    <input type="number" min="0.01" step="0.01" className="pos-field__input"
                      value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" autoFocus />
                  </div>
                  <div className="pos-field">
                    <label className="pos-field__label">Descripción (opcional)</label>
                    <input type="text" className="pos-field__input" style={{ fontSize: 14, fontWeight: 400 }}
                      value={description} onChange={e => setDescription(e.target.value)}
                      placeholder="Ej. Pago a proveedor de refrescos" />
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" className="pos-btn pos-btn--ghost" style={{ flex: 1 }}
                      onClick={() => setShowForm(false)} disabled={isSaving}>Cancelar</button>
                    <button type="submit" className="pos-btn pos-btn--primary" style={{ flex: 1 }} disabled={isSaving}>
                      {isSaving ? <span className="pos-spinner" /> : <><i className="bi bi-check-lg" /> Registrar</>}
                    </button>
                  </div>
                </form>
              )}

              {/* Lista de movimientos */}
              <div className="pos-cashmov-list">
                {status.movements.length === 0 ? (
                  <p style={{ fontSize: 13, color: 'var(--pos-muted)', textAlign: 'center', padding: '12px 0' }}>
                    Sin movimientos registrados aún
                  </p>
                ) : status.movements.map((m, i) => {
                  const meta = MOVEMENT_LABELS[m.movement_type] ?? { label: m.movement_type, cls: '' }
                  return (
                    <div key={i} className="pos-cashmov-row">
                      <div>
                        <span className={`pos-cashmov-row__type ${meta.cls}`}>{meta.label}</span>
                        {m.description && <span className="pos-cashmov-row__desc">{m.description}</span>}
                        {m.created_at && <span className="pos-cashmov-row__desc">{fmtTime(m.created_at)}</span>}
                      </div>
                      <span className={meta.cls}>
                        {meta.cls === 'pos-mov--in' ? '+' : '-'}{money(m.amount)}
                      </span>
                     
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default CashMovementsModal
