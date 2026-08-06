// src/components/Pos/modals/PaymentModal.jsx
// Multi-step: 1) asignar métodos de pago (soporta mixto) 2) confirmación/éxito.
// Flujo rápido: un solo click en un método no-efectivo asigna todo el
// restante; para efectivo se despliega el panel de monto recibido con
// botones rápidos ($20/$50/.../$1000, acumulables) y calcula el cambio.

import { useState, useMemo } from 'react'
import { usePos } from '../../../Context/PosContext'
import { useBranch } from '../../../Context/BranchContext'
import { useUser } from '../../../Context/UserContext'
import api from '../../../services/api'
import { openReceiptWindow } from '../printReceipt'

const money = (n) => Number(n ?? 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
const QUICK_AMOUNTS = [20, 50, 100, 200, 500, 1000]

const PaymentModal = ({ onClose }) => {
  const {
    cart, subtotal, total, paymentMethods,
    activeRegisterId, activeRegister, branchId, completeSale,
  } = usePos()
  const { selectedBranch } = useBranch()
  const { user } = useUser()

  const [lines,        setLines]        = useState([]) // { payment_method_id, code, name, amount, cash_received, cash_change }
  const [cashPanel,     setCashPanel]    = useState(false)
  const [cashReceived,  setCashReceived] = useState('')

  const [isSaving, setIsSaving] = useState(false)
  const [error,    setError]    = useState(null)
  const [result,   setResult]   = useState(null) // { orderId } tras éxito

  const assigned  = lines.reduce((s, l) => s + l.amount, 0)
  const remaining = Math.max(0, +(total - assigned).toFixed(2))
  const totalChange = lines.reduce((s, l) => s + (l.cash_change ?? 0), 0)

  const removeLine = (idx) => setLines(prev => prev.filter((_, i) => i !== idx))
  const updateLineAmount = (idx, value) => {
    const n = Math.max(0, Number(value) || 0)
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, amount: n } : l))
  }

  const pickMethod = (method) => {
    if (remaining <= 0) return
    if (method.code === 'cash') {
      setCashPanel(true)
      setCashReceived('')
      return
    }
    setLines(prev => [...prev, {
      payment_method_id: method.payment_method_id,
      code: method.code,
      name: method.name,
      amount: remaining,
      cash_received: null,
      cash_change: null,
    }])
  }

  const addQuickAmount = (n) => {
    setCashReceived(prev => String((Number(prev) || 0) + n))
  }

  const confirmCashLine = () => {
    const received = Number(cashReceived) || 0
    if (received <= 0) return
    const applied = Math.min(received, remaining)
    const change  = +(received - applied).toFixed(2)
    const cashMethod = paymentMethods.find(m => m.code === 'cash')
    setLines(prev => [...prev, {
      payment_method_id: cashMethod?.payment_method_id,
      code: 'cash',
      name: cashMethod?.name ?? 'Efectivo',
      amount: applied,
      cash_received: received,
      cash_change: change,
    }])
    setCashPanel(false)
    setCashReceived('')
  }

  const canConfirm = remaining === 0 && lines.length > 0 && !isSaving

  const handleConfirmSale = async () => {
    setIsSaving(true)
    setError(null)
    try {
      const payload = {
        cashRegisterId: activeRegisterId,
        customerId:     cart.customerId,
        subtotal,
        discount:       cart.discount.applied,
        total,
        notes:          cart.note || null,
        items: cart.items.map(i => ({
          product_id:     i.product_id,
          variant_id:     i.variant_id ?? null,
          quantity:       i.quantity,
          unit_price:     i.unit_price,
          purchase_price: i.purchase_price,
          discount:       0,
        })),
        payments: lines.map(l => ({
          payment_method_id: l.payment_method_id,
          amount:            l.amount,
          cash_received:     l.cash_received,
          cash_change:       l.cash_change,
        })),
      }
      const { data } = await api.post(`orders?branch_id=${branchId}`, payload)
      setResult(data.data)
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al procesar la venta')
    } finally {
      setIsSaving(false)
    }
  }

  const handleFinish = () => {
    // [FIX] Antes usaba clearCart(), que solo vacía items y deja el mismo
    // carrito (ahora vacío) como pestaña activa. completeSale() lo elimina
    // por completo y promueve un suspendido, o reinicia a "Carrito 1" si no
    // queda ninguno.
    completeSale()
    onClose()
  }

  const handlePrint = () => {
    if (!result) return
    openReceiptWindow({
      orderId:      result.orderId,
      receipt:      selectedBranch?.receipt ?? null,
      branchName:   selectedBranch?.name,
      registerName: activeRegister?.name,
      cashierName:  user?.username,
      items:        cart.items,
      subtotal,
      discount:     cart.discount.applied,
      total,
      payments:     lines,
      totalChange,
    })
  }

  return (
    <div className="pos-overlay" onClick={e => !result && e.target === e.currentTarget && onClose()}>
      <div className="pos-modal">
        <div className="pos-modal__header">
          <h3 className="pos-modal__title"><i className="bi bi-cash-coin" /> Cobrar</h3>
          {!result && (
            <button className="pos-modal__close" onClick={onClose} aria-label="Cerrar"><i className="bi bi-x-lg" /></button>
          )}
        </div>

        <div className="pos-modal__body">
          {!result ? (
            <>
              {/* Totales */}
              <div className="pos-pay-total">
                <span>Total a pagar</span>
                <strong>{money(total)}</strong>
              </div>

              {error && (
                <div className="pos-alert pos-alert--error"><i className="bi bi-exclamation-circle" /><span>{error}</span></div>
              )}

              {/* Líneas de pago ya asignadas */}
              {lines.length > 0 && (
                <div className="pos-pay-lines">
                  {lines.map((l, i) => (
                    <div key={i} className="pos-pay-line">
                      <span className="pos-pay-line__name">{l.name}</span>
                      <input
                        type="number" min="0" step="0.01"
                        className="pos-pay-line__amount"
                        value={l.amount}
                        onChange={e => updateLineAmount(i, e.target.value)}
                      />
                      {l.cash_change > 0 && (
                        <span className="pos-pay-line__change">cambio {money(l.cash_change)}</span>
                      )}
                      <button type="button" className="pos-pay-line__remove" onClick={() => removeLine(i)}>
                        <i className="bi bi-x" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Restante por asignar */}
              {remaining > 0 && (
                <div className="pos-pay-remaining">
                  Falta por asignar: <strong>{money(remaining)}</strong>
                </div>
              )}

              {/* Panel de efectivo recibido */}
              {cashPanel ? (
                <div className="pos-pay-cash-panel">
                  <div className="pos-field pos-field__prefix">
                    <label className="pos-field__label">Monto recibido</label>
                    <span>$</span>
                    <input
                      type="number" min="0" step="0.01"
                      className="pos-field__input"
                      value={cashReceived}
                      onChange={e => setCashReceived(e.target.value)}
                      placeholder="0.00"
                      autoFocus
                    />
                  </div>
                  <div className="pos-pay-quick-grid">
                    {QUICK_AMOUNTS.map(n => (
                      <button key={n} type="button" className="pos-btn pos-btn--ghost" onClick={() => addQuickAmount(n)}>
                        +${n}
                      </button>
                    ))}
                  </div>
                  {Number(cashReceived) > 0 && (
                    <div className="pos-pay-change-preview">
                      Cambio: <strong>{money(Math.max(0, Number(cashReceived) - remaining))}</strong>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" className="pos-btn pos-btn--ghost" style={{ flex: 1 }}
                      onClick={() => { setCashPanel(false); setCashReceived('') }}>Cancelar</button>
                    <button type="button" className="pos-btn pos-btn--primary" style={{ flex: 1 }}
                      onClick={confirmCashLine} disabled={!(Number(cashReceived) > 0)}>
                      <i className="bi bi-check-lg" /> Agregar pago
                    </button>
                  </div>
                </div>
              ) : remaining > 0 && (
                <div className="pos-pay-methods">
                  {paymentMethods.map(m => (
                    <button key={m.payment_method_id} type="button" className="pos-pay-method-btn" onClick={() => pickMethod(m)}>
                      <i className={`bi ${m.code === 'cash' ? 'bi-cash' : m.code === 'credit' ? 'bi-clock-history' : 'bi-credit-card'}`} />
                      <span>{m.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="pos-pay-success">
              <i className="bi bi-check-circle-fill" />
              <span className="pos-pay-success__title">Venta completada</span>
              <span className="pos-pay-success__order">Orden #{result.orderId}</span>
              {totalChange > 0 && (
                <div className="pos-pay-success__change">
                  <span>Cambio a entregar</span>
                  <strong>{money(totalChange)}</strong>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="pos-modal__footer">
          {!result ? (
            <button type="button" className="pos-btn pos-btn--primary pos-btn--block"
              onClick={handleConfirmSale} disabled={!canConfirm}>
              {isSaving ? <span className="pos-spinner" /> : <><i className="bi bi-check-lg" /> Confirmar venta</>}
            </button>
          ) : (
            <>
              <button type="button" className="pos-btn pos-btn--ghost" onClick={handlePrint}>
                <i className="bi bi-printer" /> Imprimir recibo
              </button>
              <button type="button" className="pos-btn pos-btn--primary" onClick={handleFinish}>
                <i className="bi bi-plus-lg" /> Nueva venta
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default PaymentModal