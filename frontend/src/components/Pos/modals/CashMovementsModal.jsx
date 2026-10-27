// src/components/Pos/modals/CashMovementsModal.jsx
// Movimientos de efectivo de la sesión abierta y registro de un Ingreso, un
// Retiro o un Gasto (specs/12-modulo-de-gastos.md, requisitos 17 y 20).
//
// - Ingreso y Retiro son movimientos manuales de la caja (income y
//   withdrawal).
// - Gasto: solo con expenses.create. Es un gasto pagado en efectivo desde la
//   caja del POS, de hoy (POST /expenses); el backend crea su salida de caja,
//   que aparece en la lista como "Gasto".
import { useState, useEffect, useCallback } from 'react'
import { usePos } from '../../../context/PosContext'
import { useUser } from '../../../context/UserContext'
import api from '../../../services/api'
import { fmtTime } from '../../../utils/dateFormatter'
import { RECEIPT_ACCEPT, MAX_RECEIPT_MB, receiptError, buildExpenseFormData } from '../../Expenses/expenseForm'

const money = (n) => Number(n ?? 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })

// Tipos de movimiento de caja (specs/12-modulo-de-gastos.md, requisito 15)
export const MOVEMENT_LABELS = {
  sale:             { label: 'Venta',                      cls: 'pos-mov--in'  },
  income:           { label: 'Ingreso manual',             cls: 'pos-mov--in'  },
  credit_payment:   { label: 'Abono a crédito',            cls: 'pos-mov--in'  },
  layaway_payment:  { label: 'Abono a apartado',           cls: 'pos-mov--in'  },
  expense_refund:   { label: 'Reingreso de gasto',         cls: 'pos-mov--in'  },
  withdrawal:       { label: 'Retiro',                     cls: 'pos-mov--out' },
  expense:          { label: 'Gasto',                      cls: 'pos-mov--out' },
  legacy_expense:   { label: 'Salida de caja (histórico)', cls: 'pos-mov--out' },
  return:           { label: 'Devolución',                 cls: 'pos-mov--out' },
}

const TYPES = [
  { id: 'income',     label: 'Ingreso', icon: 'bi-plus-circle',  activeCls: 'pos-btn--primary' },
  { id: 'withdrawal', label: 'Retiro',  icon: 'bi-dash-circle',  activeCls: 'pos-btn--danger'  },
  { id: 'expense',    label: 'Gasto',   icon: 'bi-receipt',      activeCls: 'pos-btn--danger'  },
]

const EMPTY_EXPENSE = { categoryId: '', providerId: '', folio: '', receipt: null }

const CashMovementsModal = ({ onClose }) => {
  const { activeRegister, activeRegisterId, branchId, fetchRegisterStatus, createCashMovement } = usePos()
  const { hasPermission } = useUser()
  const canExpense = hasPermission('expenses', 'create')

  const [status,    setStatus]    = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error,     setError]     = useState(null)

  // Formulario: ingreso, retiro o gasto
  const [showForm,    setShowForm]    = useState(false)
  const [movType,     setMovType]     = useState('income')
  const [amount,      setAmount]      = useState('')
  const [description, setDescription] = useState('')
  const [expense,     setExpense]     = useState(EMPTY_EXPENSE)
  const [options,     setOptions]     = useState(null) // GET /expenses/options, al elegir Gasto
  const [isSaving,    setIsSaving]    = useState(false)

  const loadStatus = useCallback(async () => {
    setIsLoading(true)
    const data = await fetchRegisterStatus()
    if (data) setStatus(data)
    else setError('No se pudo cargar el estado de la caja')
    setIsLoading(false)
  }, [fetchRegisterStatus])

  useEffect(() => { loadStatus() }, [loadStatus])

  useEffect(() => {
    if (movType !== 'expense' || options) return
    api.get(`expenses/options?branch_id=${branchId}`)
      .then(({ data }) => setOptions(data.data))
      .catch(err => setError(err.response?.data?.message ?? 'No se pudieron cargar las categorías de gasto'))
  }, [movType, options, branchId])

  const types = TYPES.filter(t => t.id !== 'expense' || canExpense)
  const isExpense = movType === 'expense'
  const cashMethod = options?.payment_methods.find(m => m.code === 'cash')

  const resetForm = () => {
    setAmount(''); setDescription(''); setExpense(EMPTY_EXPENSE); setShowForm(false)
  }

  const changeReceipt = (file) => {
    const message = receiptError(file)
    setError(message)
    setExpense(prev => ({ ...prev, receipt: message ? null : file }))
  }

  // Lo que le falta al gasto para poder mandarlo, o null
  const expenseError = () => {
    if (!expense.categoryId) return 'Elige la categoría del gasto'
    if (!description.trim()) return 'Escribe la descripción del gasto'
    if (!cashMethod) return 'El método de pago Efectivo no está activo'
    return null
  }

  const saveExpense = (n) =>
    api.post('expenses', buildExpenseFormData({
      branch_id:           branchId,
      expense_category_id: expense.categoryId,
      amount:              n,
      description:         description.trim(),
      payment_method_id:   cashMethod.payment_method_id,
      provider_id:         expense.providerId,
      folio:               expense.folio.trim(),
      paid_from_register:  true,
      cash_register_id:    activeRegisterId,
    }, expense.receipt))

  const handleSubmit = async (e) => {
    e.preventDefault()
    const n = Number(amount)
    if (!amount || isNaN(n) || n <= 0) {
      setError('Ingresa un monto válido mayor a 0')
      return
    }
    const missing = isExpense ? expenseError() : null
    if (missing) { setError(missing); return }
    setIsSaving(true)
    setError(null)
    try {
      if (isExpense) await saveExpense(n)
      else await createCashMovement({ movementType: movType, amount: n, description: description.trim() || null })
      resetForm()
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
            <div className="pos-alert pos-alert--error" role="alert">
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
                  <i className="bi bi-plus-lg" /> {canExpense ? 'Registrar ingreso, retiro o gasto' : 'Registrar ingreso o retiro'}
                </button>
              )}

              {showForm && (
                <form className="pos-cashmov-form" onSubmit={handleSubmit}>
                  <div className="pos-cashmov-form__type" role="group" aria-label="Tipo de movimiento">
                    {types.map(t => (
                      <button key={t.id} type="button" aria-pressed={movType === t.id}
                        className={`pos-btn ${movType === t.id ? t.activeCls : 'pos-btn--ghost'}`}
                        onClick={() => { setMovType(t.id); setError(null) }}>
                        <i className={`bi ${t.icon}`} /> {t.label}
                      </button>
                    ))}
                  </div>

                  {isExpense && (
                    <>
                      <p className="pos-cashmov-form__hint">
                        Se paga con el efectivo de esta caja y queda registrado en Gastos.
                      </p>
                      <div className="pos-field">
                        <label className="pos-field__label" htmlFor="pos-exp-category">Categoría</label>
                        <select id="pos-exp-category" className="pos-field__input pos-cashmov-form__input"
                          value={expense.categoryId} disabled={!options}
                          onChange={e => setExpense(prev => ({ ...prev, categoryId: e.target.value }))}>
                          <option value="">{options ? 'Elige la categoría' : 'Cargando...'}</option>
                          {options?.categories.map(c => (
                            <option key={c.expense_category_id} value={c.expense_category_id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                    </>
                  )}

                  <div className="pos-field pos-field__prefix">
                    <label className="pos-field__label" htmlFor="pos-mov-amount">Monto</label>
                    <span>$</span>
                    <input id="pos-mov-amount" type="number" min="0.01" step="0.01" inputMode="decimal" className="pos-field__input"
                      value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" autoFocus />
                  </div>
                  <div className="pos-field">
                    <label className="pos-field__label" htmlFor="pos-mov-description">
                      {isExpense ? 'Descripción' : 'Descripción (opcional)'}
                    </label>
                    <input id="pos-mov-description" type="text" maxLength={isExpense ? 255 : 100}
                      className="pos-field__input pos-cashmov-form__input"
                      value={description} onChange={e => setDescription(e.target.value)}
                      placeholder={isExpense ? 'Ej. Garrafones de agua' : movType === 'withdrawal' ? 'Ej. Retiro para depósito' : 'Ej. Sobrante'} />
                  </div>

                  {isExpense && (
                    <>
                      <div className="pos-field">
                        <label className="pos-field__label" htmlFor="pos-exp-provider">Proveedor (opcional)</label>
                        <select id="pos-exp-provider" className="pos-field__input pos-cashmov-form__input"
                          value={expense.providerId} disabled={!options}
                          onChange={e => setExpense(prev => ({ ...prev, providerId: e.target.value }))}>
                          <option value="">Sin proveedor</option>
                          {options?.providers.map(p => (
                            <option key={p.provider_id} value={p.provider_id}>{p.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="pos-field">
                        <label className="pos-field__label" htmlFor="pos-exp-folio">Folio (opcional)</label>
                        <input id="pos-exp-folio" type="text" maxLength={50} className="pos-field__input pos-cashmov-form__input"
                          value={expense.folio} placeholder="Factura o ticket"
                          onChange={e => setExpense(prev => ({ ...prev, folio: e.target.value }))} />
                      </div>
                      <div className="pos-field">
                        <label className="pos-field__label" htmlFor="pos-exp-receipt">Comprobante (opcional)</label>
                        <input id="pos-exp-receipt" type="file" accept={RECEIPT_ACCEPT} className="pos-cashmov-form__file"
                          onChange={e => changeReceipt(e.target.files?.[0] ?? null)} />
                        <span className="pos-cashmov-form__hint">Foto o PDF de hasta {MAX_RECEIPT_MB} MB; en el teléfono puedes tomarla con la cámara.</span>
                      </div>
                    </>
                  )}

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
