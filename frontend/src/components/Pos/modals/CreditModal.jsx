// src/components/Pos/modals/CreditModal.jsx
// Convierte el carrito activo en una venta a crédito, separada del modal de
// Cobrar. Antes 'credit' vivía como un método de pago más dentro de
// PaymentModal (mezclable con otros); ahora es su propio flujo, calcado del
// de Apartar: anticipo opcional con un solo método de pago (no efectivo con
// cambio, solo monto) y el resto queda a crédito.
//
// Distinto de LayawayModal: aquí SÍ se completa una venta real (se sigue
// usando el endpoint `orders`, igual que hacía PaymentModal al combinar
// efectivo + crédito) — no se reserva stock, se descuenta como cualquier
// venta. Por eso, a diferencia del apartado, el descuento de carrito NO se
// bloquea: `orders` ya soporta el campo discount y el backend ya sabe crear
// el credit_sale a partir de la línea de pago con code 'credit' dentro del
// arreglo `payments` (createCreditSale se dispara desde orderService). Al
// reusar el mismo endpoint y la misma forma de `payments` que ya usaba el
// combo efectivo+crédito de PaymentModal, el anticipo en efectivo cae en el
// mismo camino que ya registra el movimiento de caja — no hace falta tocar
// el backend.

import { useState, useEffect } from 'react'
import { usePos } from '../../../Context/PosContext'
import { useBranch } from '../../../Context/BranchContext'
import { useUser } from '../../../Context/UserContext'
import api from '../../../services/api'
import { openReceiptWindow } from '../printReceipt'

const money = (n) => Number(n ?? 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
const GENERIC_CUSTOMER_ID = 1

const toLocalDateStr = (d) => {
  const yyyy = d.getFullYear()
  const mm   = String(d.getMonth() + 1).padStart(2, '0')
  const dd   = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}
const defaultDueDate = () => {
  const d = new Date()
  d.setDate(d.getDate() + 30) // mismo plazo que usaba el panel de crédito dentro de PaymentModal
  return toLocalDateStr(d)
}

const itemLabel = (i) => i.name

const CreditModal = ({ onClose }) => {
  const {
    cart, subtotal, total, paymentMethods,
    activeRegisterId, activeRegister, branchId, completeSale,
  } = usePos()
  const { selectedBranch } = useBranch()
  const { user } = useUser()

  const isGenericCustomer = !cart.customerId || cart.customerId === GENERIC_CUSTOMER_ID
  const creditMethod = paymentMethods.find(m => m.code === 'credit')

  // Anticipo — un solo método a propósito, igual que en LayawayModal (mismo
  // razonamiento: no mezclar crédito con crédito, y mantener el flujo
  // simple — sin panel de "monto recibido / cambio" como en Cobrar).
  const anticipoMethods = paymentMethods.filter(m => m.code !== 'credit')
  const [methodId,   setMethodId]   = useState(anticipoMethods[0]?.payment_method_id ?? '')
  const [downAmount, setDownAmount] = useState('')
  const [dueDate,    setDueDate]    = useState(defaultDueDate())

  const [customerCredit, setCustomerCredit] = useState(null) // { credit_limit, credit_balance }
  const [creditLoading,  setCreditLoading]  = useState(false)

  const [isSaving, setIsSaving] = useState(false)
  const [error,    setError]    = useState(null)
  const [result,   setResult]   = useState(null) // { orderId } tras éxito

  const downAmt   = Math.max(0, Number(downAmount) || 0)
  const remaining = +(Math.max(0, total - downAmt)).toFixed(2)

  useEffect(() => {
    if (isGenericCustomer || !cart.customerId) return
    setCreditLoading(true)
    setCustomerCredit(null)
    api.get(`customers/${cart.customerId}`)
      .then(({ data }) => setCustomerCredit(data.data))
      .catch(() => {
        // Si falla la consulta no bloqueamos el flujo — el backend igual
        // valida el límite al confirmar la venta; esto es solo un adelanto
        // informativo para el cajero.
      })
      .finally(() => setCreditLoading(false))
  }, [cart.customerId, isGenericCustomer])

  const availableCredit = customerCredit
    ? +(Number(customerCredit.credit_limit) - Number(customerCredit.credit_balance)).toFixed(2)
    : null

  const downError = downAmt >= total
    ? 'El anticipo debe ser menor al total — si cubres todo, usa "Cobrar"'
    : null
  const creditShortError = (!downError && customerCredit && availableCredit < remaining)
    ? 'El cliente no tiene crédito suficiente para el saldo restante'
    : null

  const canConfirm = !isSaving && !isGenericCustomer && !!creditMethod
    && !downError && !creditShortError && !!dueDate

  const handleConfirm = async () => {
    if (!canConfirm) return
    setIsSaving(true)
    setError(null)
    try {
      const downLine = downAmt > 0 ? {
        payment_method_id: methodId,
        amount: downAmt,
        cash_received: downAmt,
        cash_change: 0,
      } : null

      const creditLine = {
        payment_method_id: creditMethod.payment_method_id,
        amount: remaining,
        cash_received: null,
        cash_change: null,
        due_date: dueDate,
      }

      const payments = downLine ? [downLine, creditLine] : [creditLine]

      const payload = {
        cashRegisterId: activeRegisterId,
        customerId:     cart.customerId,
        subtotal,
        discount:       cart.discount.applied,
        total,
        notes:          cart.note || null,
        due_date:       dueDate,
        items: cart.items.map(i => ({
          product_id:     i.product_id,
          variant_id:     i.variant_id ?? null,
          quantity:       i.quantity,
          unit_price:     i.unit_price,
          purchase_price: i.purchase_price,
          discount:       0,
        })),
        payments,
      }
      const { data } = await api.post(`orders?branch_id=${branchId}`, payload)
      setResult(data.data)
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al procesar la venta a crédito')
    } finally {
      setIsSaving(false)
    }
  }

  const handleFinish = () => {
    completeSale() // limpia el carrito igual que al terminar una venta normal
    onClose()
  }

  const handlePrint = () => {
    if (!result) return
    const anticipoMethod = anticipoMethods.find(m => m.payment_method_id === methodId)
    const receiptLines = [
      ...(downAmt > 0 ? [{
        payment_method_id: methodId,
        code: anticipoMethod?.code,
        name: anticipoMethod?.name ?? 'Anticipo',
        amount: downAmt,
        cash_received: downAmt,
        cash_change: 0,
      }] : []),
      {
        payment_method_id: creditMethod?.payment_method_id,
        code: 'credit',
        name: creditMethod?.name ?? 'Crédito',
        amount: remaining,
        cash_received: null,
        cash_change: null,
        due_date: dueDate,
      },
    ]
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
      payments:     receiptLines,
      totalChange:  0,
    })
  }

  return (
    <div className="pos-overlay" onClick={e => !result && e.target === e.currentTarget && onClose()}>
      <div className="pos-modal">
        <div className="pos-modal__header">
          <h3 className="pos-modal__title"><i className="bi bi-clock-history" /> Venta a crédito</h3>
          {!result && (
            <button className="pos-modal__close" onClick={onClose} aria-label="Cerrar"><i className="bi bi-x-lg" /></button>
          )}
        </div>

        <div className="pos-modal__body">
          {!result ? (
            <>
              {isGenericCustomer ? (
                <div className="pos-alert pos-alert--error">
                  <i className="bi bi-exclamation-circle" />
                  <span>Selecciona un cliente (no Público general) para vender a crédito.</span>
                </div>
              ) : !creditMethod ? (
                <div className="pos-alert pos-alert--error">
                  <i className="bi bi-exclamation-circle" />
                  <span>El método de pago "Crédito" no está configurado.</span>
                </div>
              ) : (
                <>
                  {error && (
                    <div className="pos-alert pos-alert--error"><i className="bi bi-exclamation-circle" /><span>{error}</span></div>
                  )}

                  {/* Resumen de items (solo lectura) */}
                  <div className="pos-pay-lines">
                    {cart.items.map((i, idx) => (
                      <div key={idx} className="pos-pay-line">
                        <span className="pos-pay-line__name">{i.quantity}x {itemLabel(i)}</span>
                        <span>{money(i.unit_price * i.quantity)}</span>
                      </div>
                    ))}
                  </div>

                  {cart.discount.applied > 0 && (
                    <div className="pos-pay-line">
                      <span className="pos-pay-line__name">Descuento</span>
                      <span>-{money(cart.discount.applied)}</span>
                    </div>
                  )}

                  <div className="pos-pay-total">
                    <span>Total de la venta</span>
                    <strong>{money(total)}</strong>
                  </div>

                  {creditLoading ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--pos-muted)', fontSize: 13 }}>
                      <span className="pos-spinner pos-spinner--dark" /> Consultando crédito disponible...
                    </div>
                  ) : customerCredit && (
                    <div className="pos-pay-credit-summary">
                      <span>Crédito disponible</span>
                      <strong className={availableCredit >= remaining ? 'pos-mov--in' : 'pos-mov--out'}>
                        {money(availableCredit)}
                      </strong>
                    </div>
                  )}

                  {/* Anticipo */}
                  <div className="pos-field pos-field__prefix">
                    <label className="pos-field__label">Anticipo (opcional)</label>
                    <span>$</span>
                    <input
                      type="number" min="0" step="0.01"
                      className="pos-field__input"
                      value={downAmount}
                      onChange={e => setDownAmount(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                  {downError && (
                    <div className="pos-alert pos-alert--error"><i className="bi bi-exclamation-circle" /><span>{downError}</span></div>
                  )}

                  {downAmt > 0 && (
                    <div className="pos-field">
                      <label className="pos-field__label">Método del anticipo</label>
                      <select
                        className="pos-field__input"
                        value={methodId}
                        onChange={e => setMethodId(Number(e.target.value))}
                      >
                        {anticipoMethods.map(m => (
                          <option key={m.payment_method_id} value={m.payment_method_id}>{m.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="pos-pay-remaining">
                    Saldo a crédito: <strong>{money(remaining)}</strong>
                  </div>
                  {creditShortError && (
                    <div className="pos-alert pos-alert--error"><i className="bi bi-exclamation-circle" /><span>{creditShortError}</span></div>
                  )}

                  <div className="pos-field">
                    <label className="pos-field__label">Fecha de vencimiento</label>
                    <input
                      type="date" className="pos-field__input"
                      value={dueDate} onChange={e => setDueDate(e.target.value)}
                    />
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="pos-pay-success">
              <i className="bi bi-check-circle-fill" />
              <span className="pos-pay-success__title">Venta a crédito completada</span>
              <span className="pos-pay-success__order">Orden #{result.orderId}</span>
              <div className="pos-pay-success__change">
                <span>Saldo a crédito</span>
                <strong>{money(remaining)}</strong>
              </div>
            </div>
          )}
        </div>

        <div className="pos-modal__footer">
          {!result ? (
            <button
              type="button" className="pos-btn pos-btn--primary pos-btn--block"
              onClick={handleConfirm}
              disabled={!canConfirm}
            >
              {isSaving ? <span className="pos-spinner" /> : <><i className="bi bi-clock-history" /> Crear venta a crédito</>}
            </button>
          ) : (
            <>
              <button type="button" className="pos-btn pos-btn--ghost" onClick={handlePrint}>
                <i className="bi bi-printer" /> Imprimir recibo
              </button>
              <button type="button" className="pos-btn pos-btn--primary" onClick={handleFinish}>
                <i className="bi bi-check-lg" /> Listo
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default CreditModal
