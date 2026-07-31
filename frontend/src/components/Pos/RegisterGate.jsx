// src/components/Pos/RegisterGate.jsx
import { useState } from 'react'
import { usePos } from '../../Context/PosContext'

const formatDateTime = (iso) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

const formatShortDateTime = (iso) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

const formatCurrency = (amount) => {
  if (amount == null || amount === '') return '—'
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
  }).format(amount)
}

const RegisterGate = () => {
  const {
    registers, registersLoading, registerError,
    openRegister,
  } = usePos()

  const [expandedId,  setExpandedId]  = useState(null)
  const [openAmount,  setOpenAmount]  = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [localError,  setLocalError]  = useState(null)

  const startOpen = (registerId) => {
    setExpandedId(registerId)
    setOpenAmount('')
    setLocalError(null)
  }

  const cancelOpen = () => {
    setExpandedId(null)
    setOpenAmount('')
    setLocalError(null)
  }

  const confirmOpen = async (registerId) => {
    const amount = Number(openAmount)
    if (openAmount === '' || isNaN(amount) || amount < 0) {
      setLocalError('Ingresa un monto inicial válido')
      return
    }
    setIsSubmitting(true)
    setLocalError(null)
    const ok = await openRegister(registerId, amount)
    setIsSubmitting(false)
    if (ok) {
      setExpandedId(null)
      setOpenAmount('')
    }
  }

  return (
    <div className="pos-gate">
      <div className="pos-gate__brand">
        <i className="bi bi-pc-display-horizontal" />
        <h1>Punto de venta</h1>
        <span>Selecciona una caja para comenzar a vender</span>
      </div>

      {registerError && (
        <div className="pos-alert pos-alert--error pos-gate__alert">
          <i className="bi bi-exclamation-circle" />
          <span>{registerError}</span>
        </div>
      )}

      {registersLoading ? (
        <div className="pos-gate__empty">
          <span className="pos-spinner pos-spinner--dark" />
          <span>Cargando cajas...</span>
        </div>
      ) : registers.length === 0 ? (
        <div className="pos-gate__empty">
          <i className="bi bi-cash-coin" />
          <span>No hay cajas configuradas para esta sucursal.<br />Pide a un administrador que cree una en Configuración.</span>
        </div>
      ) : (
        <div className="pos-gate__grid">
          {registers.map(r => {
            const isOpen       = !!r.is_open
            const isExpanded   = expandedId === r.cash_register_id
            const hasLastClose = r.last_closed_at != null

            return (
              <div
                key={r.cash_register_id}
                className={`pos-register-card ${isOpen ? 'pos-register-card--open' : 'pos-register-card--closed'}`}
              >
                {/* Header: nombre + estado */}
                <div className="pos-register-card__header">
                  <div className="pos-register-card__title">
                    <i className="bi bi-cash-register" />
                    <span>{r.name}</span>
                  </div>
                  <span className={`pos-badge ${isOpen ? 'pos-badge--open' : 'pos-badge--closed'}`}>
                    {isOpen ? (
                      <><i className="bi bi-circle-fill" /> Abierta</>
                    ) : (
                      <><i className="bi bi-lock-fill" /> Cerrada</>
                    )}
                  </span>
                </div>

                {/* Body: info de sesión */}
                <div className="pos-register-card__body">
                  {isOpen ? (
                    <div className="pos-register-card__session pos-register-card__session--open">
                      <div className="pos-session-row">
                        <i className="bi bi-person-fill" />
                        <span>
                          <strong>Abierta por:</strong> {r.opened_by ?? 'Desconocido'}
                        </span>
                      </div>
                      <div className="pos-session-row">
                        <i className="bi bi-clock-fill" />
                        <span>
                          <strong>Desde:</strong> {formatDateTime(r.opened_at)}
                        </span>
                      </div>
                      <div className="pos-session-row">
                        <i className="bi bi-cash-stack" />
                        <span>
                          <strong>Monto inicial:</strong> {formatCurrency(r.open_amount)}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="pos-register-card__session pos-register-card__session--closed">
                      {hasLastClose ? (
                        <>
                          <div className="pos-session-row pos-session-row--highlight">
                            <i className="bi bi-cash-coin" />
                            <span>
                              <strong>Último cierre:</strong>{' '}
                              <span className="pos-session-amount">{formatCurrency(r.last_close_amount)}</span>
                            </span>
                          </div>
                          <div className="pos-session-row">
                            <i className="bi bi-person-fill" />
                            <span>
                              <strong>Por:</strong> {r.last_closed_by ?? 'Desconocido'}
                            </span>
                          </div>
                          <div className="pos-session-row">
                            <i className="bi bi-calendar-event" />
                            <span>
                              <strong>Apertura:</strong> {formatShortDateTime(r.last_opened_at)}
                            </span>
                          </div>
                          <div className="pos-session-row">
                            <i className="bi bi-calendar-check" />
                            <span>
                              <strong>Cierre:</strong> {formatShortDateTime(r.last_closed_at)}
                            </span>
                          </div>
                        </>
                      ) : (
                        <div className="pos-session-row pos-session-row--muted">
                          <i className="bi bi-info-circle" />
                          <span>Sin sesiones previas registradas</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Footer: acción */}
                <div className="pos-register-card__footer">
                  {isOpen ? (
                    <button
                      type="button"
                      className="pos-btn pos-btn--ghost pos-btn--block"
                      disabled
                      title="Esta caja está siendo utilizada"
                    >
                      <i className="bi bi-lock" /> Caja ocupada
                    </button>
                  ) : isExpanded ? (
                    <div className="pos-register-card__open-form">
                      {localError && (
                        <div className="pos-alert pos-alert--error">
                          <i className="bi bi-exclamation-circle" />
                          <span>{localError}</span>
                        </div>
                      )}
                      <div className="pos-field pos-field__prefix">
                        <label className="pos-field__label">Monto inicial en caja</label>
                        <span>$</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="pos-field__input"
                          value={openAmount}
                          onChange={e => setOpenAmount(e.target.value)}
                          placeholder="0.00"
                          autoFocus
                        />
                      </div>
                      <div className="pos-register-card__open-form-row">
                        <button
                          type="button"
                          className="pos-btn pos-btn--ghost"
                          style={{ flex: 1 }}
                          onClick={cancelOpen}
                          disabled={isSubmitting}
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          className="pos-btn pos-btn--primary"
                          style={{ flex: 1 }}
                          onClick={() => confirmOpen(r.cash_register_id)}
                          disabled={isSubmitting}
                        >
                          {isSubmitting ? (
                            <span className="pos-spinner" />
                          ) : (
                            <><i className="bi bi-unlock" /> Abrir</>
                          )}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="pos-btn pos-btn--primary pos-btn--block"
                      onClick={() => startOpen(r.cash_register_id)}
                    >
                      <i className="bi bi-unlock" /> Abrir caja
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default RegisterGate