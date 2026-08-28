// src/components/Credits/modals/CreditDetailModal.jsx
import { useState, useEffect } from 'react'
import api from '../../../services/api'
import { useUser } from '../../../context/UserContext'
import { fmtDateTime } from '../../../utils/dateFormatter'

const money = (n) => Number(n ?? 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const itemLabel = (d) => d.variant_label ? `${d.product_name} - ${d.variant_label}` : d.product_name

const CreditDetailModal = ({ creditSaleId, canApprove, onClose, onChanged, branch }) => {
  const { user } = useUser()

  const [data,      setData]      = useState(null) // { credit, payments }
  const [isLoading, setIsLoading] = useState(true)
  const [error,     setError]     = useState(null)

  const [methods,   setMethods]   = useState([])
  const [registers, setRegisters] = useState([])

  // ── Abono ──
  const [showPayForm,     setShowPayForm]     = useState(false)
  const [payAmount,       setPayAmount]       = useState('')
  const [payMethodId,     setPayMethodId]     = useState('')
  const [receivedAmount,  setReceivedAmount]  = useState('')
  const [cashRegisterId,  setCashRegisterId]  = useState('')
  const [isPaying,        setIsPaying]        = useState(false)
  const [payError,        setPayError]        = useState(null)

  // ── Límite ──
  const [editingLimit, setEditingLimit] = useState(false)
  const [newLimit,      setNewLimit]      = useState('')
  const [isSavingLimit, setIsSavingLimit] = useState(false)
  const [limitError,    setLimitError]    = useState(null)

  const load = () => {
    setIsLoading(true)
    setError(null)
    api.get(`credits/${creditSaleId}`)
      .then(({ data }) => setData(data.data))
      .catch(err => setError(err.response?.data?.message ?? 'No se pudo cargar el crédito'))
      .finally(() => setIsLoading(false))
  }

  useEffect(load, [creditSaleId])
  useEffect(() => {
    api.get('payment-methods?is_active=true').then(({ data }) => setMethods(data.data)).catch(() => {})
  }, [])

  // FIX: la caja depende del USUARIO, no de la sucursal elegida para el
  // abono — un usuario sin sucursal asignada (admin central) ve TODAS las
  // cajas registradoras de todas las sucursales; un usuario con sucursal
  // asignada solo ve las de la suya. El backend ya resuelve esto
  // (resolveOptionalBranchId en cashRegistersController.getAll), así que
  // aquí ya no se manda branch_id ni se espera a que haya un
  // effectiveBranchId — se carga una sola vez, igual que methods.
  useEffect(() => {
    api.get('cash-registers').then(({ data }) => setRegisters(data.data)).catch(() => {})
  }, [])

  const credit = data?.credit

  const selectedMethod   = methods.find(m => m.payment_method_id === payMethodId)
  const isCash            = selectedMethod?.code === 'cash'
  const selectedRegister = registers.find(r => r.cash_register_id === cashRegisterId)

  // FIX: la caja ahora es obligatoria para CUALQUIER abono (no solo
  // efectivo), así que la sucursal siempre se deriva de la caja elegida —
  // ya no hace falta un selector manual de sucursal aparte. Igual que en
  // LayawayDetailModal.
  const effectiveBranchId = branch?.branch_id ?? (selectedRegister?.branch_id ?? null)

  // FIX: cuando el usuario no tiene sucursal asignada, ve cajas de TODAS
  // las sucursales — sin el nombre de sucursal, dos cajas iguales en
  // sucursales distintas serían indistinguibles en el selector.
  const registerLabel = (r) => {
    const branchPrefix = !user?.branch_id ? `${r.branch_name} · ` : ''
    if (!r.is_open) return `${branchPrefix}${r.name}-Cerrada`
    const who = r.opened_by_user_id === user?.user_id ? 'Tú' : (r.opened_by ?? 'otro usuario')
    return `${branchPrefix}${r.name}-Abierta-${who}`
  }

  // El usuario solo puede aplicar el efectivo del abono a una caja que él
  // mismo tenga abierta — igual que en el POS, no se puede tocar la sesión
  // de otro cajero ni una caja cerrada.
  const registerError = !selectedRegister ? null
    : !selectedRegister.is_open
      ? 'Esa caja está cerrada. Necesitas abrir una sesión de esa caja desde el POS.'
      : selectedRegister.opened_by_user_id !== user?.user_id
        ? 'Esa caja está abierta por otro usuario — solo puedes usar una caja que tú tengas abierta.'
        : null

  const amountNum = Number(payAmount) || 0
  const received   = Math.max(0, Number(receivedAmount) || 0)
  const change     = isCash ? Math.max(0, received - amountNum) : 0

  const handlePay = async () => {
    const amount = amountNum
    if (!payMethodId) { setPayError('Selecciona un método de pago'); return }
    if (!(amount > 0)) { setPayError('Ingresa un monto válido'); return }
    if (amount > Number(credit.balance)) { setPayError(`El abono no puede superar el saldo pendiente (${money(credit.balance)})`); return }
    // FIX: la caja ahora es obligatoria para cualquier abono — antes solo
    // se exigía para efectivo. Igual que en Layaways, cada línea de pago
    // debe quedar ligada a una caja para que payment_events sea exacto, y
    // de ahí se deriva effectiveBranchId — ya no hace falta validarla
    // aparte.
    if (!cashRegisterId) { setPayError('Selecciona la caja donde se registrará este abono'); return }
    if (registerError) { setPayError(registerError); return }
    if (isCash && received < amount) { setPayError('El efectivo recibido no puede ser menor al monto del abono'); return }

    setIsPaying(true)
    setPayError(null)
    try {
      await api.post(`credits/${creditSaleId}/payments`, {
        payments: [{
          payment_method_id: payMethodId,
          amount,
          cash_received: isCash ? received : null,
          cash_change:   isCash ? change   : null,
        }],
        cashRegisterId,
        branch_id: effectiveBranchId,
      })
      setShowPayForm(false)
      setPayAmount('')
      setPayMethodId('')
      setReceivedAmount('')
      setCashRegisterId('')
      load()
      onChanged?.()
    } catch (err) {
      setPayError(err.response?.data?.message ?? 'Error al registrar el abono')
    } finally {
      setIsPaying(false)
    }
  }

  const handleSaveLimit = async () => {
    const val = Number(newLimit)
    if (isNaN(val) || val < 0) { setLimitError('Ingresa un límite válido'); return }
    setIsSavingLimit(true)
    setLimitError(null)
    try {
      await api.patch(`credits/customers/${credit.customer_id}/limit`, { creditLimit: val, branch_id: effectiveBranchId })
      setEditingLimit(false)
      load()
      onChanged?.()
    } catch (err) {
      setLimitError(err.response?.data?.message ?? 'Error al actualizar el límite')
    } finally {
      setIsSavingLimit(false)
    }
  }

  return (
    <div className="crd-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="crd-modal">
        <div className="crd-modal__header">
          <h3 className="crd-modal__title">
            <i className="bi bi-credit-card" /> Crédito {credit ? `#${credit.credit_sale_id}` : ''}
          </h3>
          <button className="crd-modal__close" onClick={onClose}><i className="bi bi-x-lg" /></button>
        </div>

        <div className="crd-modal__body">
          {error && <div className="crd-alert"><i className="bi bi-exclamation-circle" /><span>{error}</span></div>}

          {isLoading ? (
            <div className="crd-detail-loading"><span className="crd-spinner crd-spinner--dark" /> Cargando...</div>
          ) : data && (
            <>
              <div className="crd-detail__meta">
                <div><span className="crd-td-muted">Cliente</span><strong>{credit.first_name} {credit.last_name}</strong></div>
                <div><span className="crd-td-muted">Teléfono</span><strong>{credit.phone_number ?? '—'}</strong></div>
                <div><span className="crd-td-muted">Creado</span><strong>{fmtDate(credit.created_at)}</strong></div>
                <div><span className="crd-td-muted">Vence</span><strong>{fmtDate(credit.due_date)}</strong></div>
              </div>

              <div className="crd-detail__section">
                <span className="crd-detail__section-title">Productos</span>
                <div className="crd-detail-items">
                  {data.details.map((d, i) => (
                    <div key={i} className="crd-detail-item">
                      <div className="crd-detail-item__info">
                        <span className="crd-detail-item__name">{itemLabel(d)}</span>
                        <span className="crd-td-muted">{d.quantity} x {money(d.unit_price)}</span>
                      </div>
                      <span className="crd-detail-item__subtotal">{money(d.unit_price * d.quantity)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="crd-detail__totals">
                <div className="crd-detail__row"><span>Total del crédito</span><span>{money(credit.total_amount)}</span></div>
                <div className="crd-detail__row"><span>Pagado</span><span>{money(credit.amount_paid)}</span></div>
                <div className="crd-detail__row crd-detail__row--total"><span>Saldo pendiente</span><span>{money(credit.balance)}</span></div>
              </div>

              {/* Límite del cliente */}
              <div className="crd-detail__section">
                <span className="crd-detail__section-title">Línea de crédito del cliente</span>
                {editingLimit ? (
                  <div className="crd-limit-edit">
                    {limitError && <div className="crd-alert"><i className="bi bi-exclamation-circle" /><span>{limitError}</span></div>}
                    <div className="crd-field">
                      <label className="crd-field__label">Nuevo límite</label>
                      <input type="number" min="0" step="0.01" className="crd-field__input"
                        value={newLimit} onChange={e => setNewLimit(e.target.value)} autoFocus />
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="crd-btn crd-btn--ghost" style={{ flex: 1 }} onClick={() => setEditingLimit(false)} disabled={isSavingLimit}>Cancelar</button>
                      <button className="crd-btn crd-btn--primary" style={{ flex: 1 }} onClick={handleSaveLimit} disabled={isSavingLimit}>
                        {isSavingLimit ? <span className="crd-spinner" /> : 'Guardar'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="crd-detail__row">
                    <span>Límite actual: <strong>{money(credit.credit_limit)}</strong> · Usado: {money(credit.credit_balance)}</span>
                    {canApprove && (
                      <button className="crd-btn crd-btn--ghost" onClick={() => { setEditingLimit(true); setNewLimit(String(credit.credit_limit)) }}>
                        <i className="bi bi-pencil" /> Editar
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Abonos */}
              <div className="crd-detail__section">
                <span className="crd-detail__section-title">Abonos</span>
                {data.payments.length === 0 ? (
                  <p className="crd-td-muted" style={{ margin: 0 }}>Sin abonos registrados aún</p>
                ) : (
                  <div className="crd-detail-items">
                    {data.payments.map(p => (
                      <div key={p.payment_id} className="crd-detail-item">
                        <div className="crd-detail-item__info">
                          <span className="crd-detail-item__name">{fmtDateTime(p.created_at)} · {p.branch_name}</span>
                          <span className="crd-td-muted">{p.details.map(d => d.method_name).join(', ')} · recibió {p.received_by}</span>
                        </div>
                        <span className="crd-detail-item__subtotal">{money(p.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {credit.status === 'active' || credit.status === 'overdue' ? (
                  showPayForm ? (
                    <div className="crd-limit-edit">
                      {payError && <div className="crd-alert"><i className="bi bi-exclamation-circle" /><span>{payError}</span></div>}

                      <div className="crd-field">
                        <label className="crd-field__label">Monto</label>
                        <input type="number" min="0" step="0.01" className="crd-field__input"
                          value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder="0.00" autoFocus />
                      </div>

                      <div className="crd-field">
                        <label className="crd-field__label">Método</label>
                        <select className="crd-field__input" value={payMethodId} onChange={e => setPayMethodId(Number(e.target.value))}>
                          <option value="">Selecciona...</option>
                          {methods.map(m => <option key={m.payment_method_id} value={m.payment_method_id}>{m.name}</option>)}
                        </select>
                      </div>

                      {isCash && (
                        <>
                          <div className="crd-field">
                            <label className="crd-field__label">Efectivo recibido</label>
                            <input type="number" min="0" step="0.01" className="crd-field__input"
                              value={receivedAmount} onChange={e => setReceivedAmount(e.target.value)} placeholder="0.00" />
                          </div>
                          <div className="crd-detail__row">
                            <span>Cambio</span>
                            <strong>{money(change)}</strong>
                          </div>
                        </>
                      )}

                      {/* FIX: la caja ahora es obligatoria para cualquier
                          abono, no solo efectivo — igual que en Layaways. */}
                      <div className="crd-field">
                        <label className="crd-field__label">Caja donde se registrará el abono</label>
                        <select className="crd-field__input" value={cashRegisterId} onChange={e => setCashRegisterId(Number(e.target.value))}>
                          <option value="">Selecciona...</option>
                          {registers.map(r => (
                            <option key={r.cash_register_id} value={r.cash_register_id}>{registerLabel(r)}</option>
                          ))}
                        </select>
                      </div>
                      {registerError && (
                        <div className="crd-alert"><i className="bi bi-exclamation-circle" /><span>{registerError}</span></div>
                      )}

                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="crd-btn crd-btn--ghost" style={{ flex: 1 }} onClick={() => setShowPayForm(false)} disabled={isPaying}>Cancelar</button>
                        <button
                          className="crd-btn crd-btn--primary" style={{ flex: 1 }}
                          onClick={handlePay}
                          disabled={isPaying || !cashRegisterId || !!registerError}
                        >
                          {isPaying ? <span className="crd-spinner" /> : 'Registrar abono'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button className="crd-btn crd-btn--ghost" style={{ marginTop: 8 }} onClick={() => setShowPayForm(true)}>
                      <i className="bi bi-plus-lg" /> Registrar abono
                    </button>
                  )
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default CreditDetailModal