// src/components/Layaways/modals/LayawayDetailModal.jsx
import { useState, useEffect } from 'react'
import api from '../../../services/api'
import ConfirmDialog from '../../Common/ConfirmDialog'
import { useUser } from '../../../Context/UserContext'

const money = (n) => Number(n ?? 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const fmtDateTime = (d) => new Date(d).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
const itemLabel = (d) => d.variant_label ? `${d.product_name} - ${d.variant_label}` : d.product_name

const LayawayDetailModal = ({ layawayId, canManage, onClose, onChanged, branch }) => {
  const { user } = useUser()

  const [data,      setData]      = useState(null) // { layaway, details, payments }
  const [isLoading, setIsLoading] = useState(true)
  const [error,     setError]     = useState(null)

  const [methods,   setMethods]   = useState([])
  const [registers, setRegisters] = useState([])

  // FIX: branch puede venir null (admin central sin sucursal "operativa"
  // seleccionada en ningún otro lado de la app — ver Layaways.jsx). El
  // abono siempre necesita una sucursal (layawayService.addPayment la
  // exige, sin importar el método de pago) — pero para efectivo, la caja
  // elegida YA determina la sucursal (una caja pertenece a una sola), así
  // que el selector propio de sucursal solo hace falta para abonos NO en
  // efectivo, donde no hay una caja de la cual derivarla.
  const [branches,        setBranches]        = useState([])
  const [paymentBranchId, setPaymentBranchId]  = useState('')

  const [showPayForm,    setShowPayForm]    = useState(false)
  const [payAmount,      setPayAmount]      = useState('')
  const [payMethodId,    setPayMethodId]    = useState('')
  const [receivedAmount, setReceivedAmount] = useState('')
  const [cashRegisterId, setCashRegisterId] = useState('')
  const [isPaying,       setIsPaying]       = useState(false)
  const [payError,       setPayError]       = useState(null)

  const [confirmCancel, setConfirmCancel] = useState(false)
  const [isCancelling,  setIsCancelling]  = useState(false)
  const [cancelError,   setCancelError]   = useState(null)

  const load = () => {
    setIsLoading(true)
    setError(null)
    api.get(`layaways/${layawayId}`)
      .then(({ data }) => setData(data.data))
      .catch(err => setError(err.response?.data?.message ?? 'No se pudo cargar el apartado'))
      .finally(() => setIsLoading(false))
  }

  useEffect(load, [layawayId])
  useEffect(() => {
    api.get('payment-methods?is_active=true').then(({ data }) => setMethods(data.data)).catch(() => {})
    // FIX: si no hay branch (admin central), se trae el listado de
    // sucursales para el selector propio del abono. /branches/list en vez
    // de /branches — no exige branches:read ni restringe a la sucursal
    // propia (ver Layaways.jsx)
    if (!branch) {
      api.get('branches/list').then(({ data }) => setBranches(data.data)).catch(() => {})
    }
  }, [branch])
  // FIX: la caja depende del USUARIO, no de la sucursal "operativa"
  // (branch) — un usuario sin sucursal asignada (admin central) ve TODAS
  // las cajas registradoras de todas las sucursales, sin importar si tiene
  // una sucursal operativa seleccionada en otro lado de la app; un usuario
  // con sucursal asignada solo ve las de la suya. El backend ya resuelve
  // esto (resolveOptionalBranchId en cashRegistersController.getAll), así
  // que aquí ya no se manda branch_id ni depende de `branch` — se carga
  // una sola vez, igual que en CreditDetailModal.
  useEffect(() => {
    api.get('cash-registers').then(({ data }) => setRegisters(data.data)).catch(() => setRegisters([]))
  }, [])

  const layaway = data?.layaway

  const selectedMethod   = methods.find(m => m.payment_method_id === payMethodId)
  const isCash            = selectedMethod?.code === 'cash'
  const selectedRegister = registers.find(r => r.cash_register_id === cashRegisterId)

  // FIX: para efectivo, la sucursal la determina la caja elegida — solo
  // cuando NO es efectivo se usa el selector manual de sucursal
  const effectiveBranchId = branch?.branch_id
    ?? (isCash
          ? (selectedRegister?.branch_id ?? null)
          : (paymentBranchId ? Number(paymentBranchId) : null))

  const registerLabel = (r) => {
    // FIX: en la vista "todas las cajas" (usuario sin sucursal asignada)
    // se antepone el nombre de la sucursal para poder distinguirlas —
    // criterio alineado con Credits: depende de user.branch_id, no de si
    // hay una sucursal "operativa" (branch) seleccionada.
    const branchTag = !user?.branch_id ? `${r.branch_name} · ` : ''
    if (!r.is_open) return `${branchTag}${r.name}-Cerrada`
    const who = r.opened_by_user_id === user?.user_id ? 'Tú' : (r.opened_by ?? 'otro usuario')
    return `${branchTag}${r.name}-Abierta-${who}`
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
    if (amount > Number(layaway.balance)) { setPayError(`El abono no puede superar el saldo pendiente (${money(layaway.balance)})`); return }
    // FIX: el abono siempre necesita una sucursal (efectivo o no) — antes
    // se asumía branch.branch_id sin validar, y tronaba si branch era null
    if (!effectiveBranchId) { setPayError('Selecciona la sucursal donde se recibe este abono'); return }

    if (isCash) {
      if (!cashRegisterId) { setPayError('Selecciona la caja donde se registrará el efectivo'); return }
      if (registerError) { setPayError(registerError); return }
      if (received < amount) { setPayError('El efectivo recibido no puede ser menor al monto del abono'); return }
    }

    setIsPaying(true)
    setPayError(null)
    try {
      await api.post(`layaways/${layawayId}/payments`, {
        payments: [{
          payment_method_id: payMethodId,
          amount,
          cash_received: isCash ? received : null,
          cash_change:   isCash ? change   : null,
        }],
        cashRegisterId: isCash ? cashRegisterId : null,
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

  const handleCancel = async () => {
    setIsCancelling(true)
    setCancelError(null)
    try {
      await api.patch(`layaways/${layawayId}/cancel`)
      setConfirmCancel(false)
      load()
      onChanged?.()
    } catch (err) {
      setCancelError(err.response?.data?.message ?? 'Error al cancelar el apartado')
    } finally {
      setIsCancelling(false)
    }
  }

  return (
    <div className="lwy-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="lwy-modal">
        <div className="lwy-modal__header">
          <h3 className="lwy-modal__title">
            <i className="bi bi-bag-check" /> Apartado {layaway ? `#${layaway.layaway_id}` : ''}
          </h3>
          <button className="lwy-modal__close" onClick={onClose}><i className="bi bi-x-lg" /></button>
        </div>

        <div className="lwy-modal__body">
          {error && <div className="lwy-alert"><i className="bi bi-exclamation-circle" /><span>{error}</span></div>}
          {cancelError && <div className="lwy-alert"><i className="bi bi-exclamation-circle" /><span>{cancelError}</span></div>}

          {isLoading ? (
            <div className="lwy-detail-loading"><span className="lwy-spinner lwy-spinner--dark" /> Cargando...</div>
          ) : data && (
            <>
              <div className="lwy-detail__meta">
                <div><span className="lwy-td-muted">Cliente</span><strong>{layaway.first_name} {layaway.last_name}</strong></div>
                <div><span className="lwy-td-muted">Teléfono</span><strong>{layaway.phone_number ?? '—'}</strong></div>
                <div><span className="lwy-td-muted">Creado</span><strong>{fmtDate(layaway.created_at)}</strong></div>
                <div><span className="lwy-td-muted">Entrega</span><strong>{fmtDate(layaway.due_date)}</strong></div>
              </div>

              {layaway.notes && (
                <div className="lwy-detail__section">
                  <span className="lwy-detail__section-title">Notas</span>
                  <p className="lwy-detail__notes">{layaway.notes}</p>
                </div>
              )}

              <div className="lwy-detail__section">
                <span className="lwy-detail__section-title">Productos apartados</span>
                <div className="lwy-detail-items">
                  {data.details.map((d, i) => (
                    <div key={i} className="lwy-detail-item">
                      <div className="lwy-detail-item__info">
                        <span className="lwy-detail-item__name">{itemLabel(d)}</span>
                        <span className="lwy-td-muted">{d.quantity} x {money(d.unit_price)}</span>
                      </div>
                      <span className="lwy-detail-item__subtotal">{money(d.unit_price * d.quantity)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="lwy-detail__totals">
                <div className="lwy-detail__row"><span>Total</span><span>{money(layaway.total_amount)}</span></div>
                <div className="lwy-detail__row"><span>Pagado</span><span>{money(layaway.amount_paid)}</span></div>
                <div className="lwy-detail__row lwy-detail__row--total"><span>Saldo pendiente</span><span>{money(layaway.balance)}</span></div>
              </div>

              <div className="lwy-detail__section">
                <span className="lwy-detail__section-title">Abonos</span>
                {data.payments.length === 0 ? (
                  <p className="lwy-td-muted" style={{ margin: 0 }}>Sin abonos registrados aún</p>
                ) : (
                  <div className="lwy-detail-items">
                    {data.payments.map(p => (
                      <div key={p.payment_id} className="lwy-detail-item">
                        <div className="lwy-detail-item__info">
                          <span className="lwy-detail-item__name">{fmtDateTime(p.created_at)} · {p.branch_name}</span>
                          <span className="lwy-td-muted">{p.details.map(d => d.method_name).join(', ')} · recibió {p.received_by}</span>
                        </div>
                        <span className="lwy-detail-item__subtotal">{money(p.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {layaway.status === 'active' && (
                  showPayForm ? (
                    <div className="lwy-limit-edit">
                      {payError && <div className="lwy-alert"><i className="bi bi-exclamation-circle" /><span>{payError}</span></div>}

                      {/* FIX: solo se muestra para abonos NO en efectivo de
                          un admin central — en efectivo, la caja elegida ya
                          determina la sucursal (ver effectiveBranchId) */}
                      {!branch && !isCash && (
                        <div className="lwy-field">
                          <label className="lwy-field__label">Sucursal donde se recibe el abono</label>
                          <select className="lwy-field__input" value={paymentBranchId} onChange={e => setPaymentBranchId(e.target.value)}>
                            <option value="">Selecciona...</option>
                            {branches.map(b => <option key={b.branch_id} value={b.branch_id}>{b.name}</option>)}
                          </select>
                        </div>
                      )}

                      <div className="lwy-field">
                        <label className="lwy-field__label">Monto</label>
                        <input type="number" min="0" step="0.01" className="lwy-field__input"
                          value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder="0.00" autoFocus />
                      </div>

                      <div className="lwy-field">
                        <label className="lwy-field__label">Método</label>
                        <select className="lwy-field__input" value={payMethodId} onChange={e => setPayMethodId(Number(e.target.value))}>
                          <option value="">Selecciona...</option>
                          {methods.map(m => <option key={m.payment_method_id} value={m.payment_method_id}>{m.name}</option>)}
                        </select>
                      </div>

                      {isCash && (
                        <>
                          <div className="lwy-field">
                            <label className="lwy-field__label">Efectivo recibido</label>
                            <input type="number" min="0" step="0.01" className="lwy-field__input"
                              value={receivedAmount} onChange={e => setReceivedAmount(e.target.value)} placeholder="0.00" />
                          </div>
                          <div className="lwy-detail__row">
                            <span>Cambio</span>
                            <strong>{money(change)}</strong>
                          </div>

                          <div className="lwy-field">
                            <label className="lwy-field__label">Caja donde se registrará el efectivo</label>
                            <select className="lwy-field__input" value={cashRegisterId} onChange={e => setCashRegisterId(Number(e.target.value))}>
                              <option value="">Selecciona...</option>
                              {registers.map(r => (
                                <option key={r.cash_register_id} value={r.cash_register_id}>{registerLabel(r)}</option>
                              ))}
                            </select>
                          </div>
                          {registerError && (
                            <div className="lwy-alert"><i className="bi bi-exclamation-circle" /><span>{registerError}</span></div>
                          )}
                        </>
                      )}

                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="lwy-btn lwy-btn--ghost" style={{ flex: 1 }} onClick={() => setShowPayForm(false)} disabled={isPaying}>Cancelar</button>
                        <button
                          className="lwy-btn lwy-btn--primary" style={{ flex: 1 }}
                          onClick={handlePay}
                          disabled={isPaying || !effectiveBranchId || (isCash && (!cashRegisterId || !!registerError))}
                        >
                          {isPaying ? <span className="lwy-spinner" /> : 'Registrar abono'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button className="lwy-btn lwy-btn--ghost" style={{ marginTop: 8 }} onClick={() => setShowPayForm(true)}>
                      <i className="bi bi-plus-lg" /> Registrar abono
                    </button>
                  )
                )}
              </div>
            </>
          )}
        </div>

        {canManage && layaway?.status === 'active' && (
          <div className="lwy-modal__footer">
            <button className="lwy-btn lwy-btn--danger-ghost" onClick={() => setConfirmCancel(true)}>
              <i className="bi bi-x-circle" /> Cancelar apartado
            </button>
          </div>
        )}
      </div>

      {confirmCancel && (
        <ConfirmDialog
          title="Cancelar apartado"
          message={`¿Cancelar el apartado #${layawayId}? Se devolverá el stock reservado al inventario disponible. Esta acción no se puede deshacer.`}
          confirmLabel="Cancelar apartado"
          variant="danger"
          onClose={() => setConfirmCancel(false)}
          onConfirm={handleCancel}
        />
      )}
    </div>
  )
}

export default LayawayDetailModal