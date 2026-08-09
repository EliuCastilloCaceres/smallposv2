// src/components/Pos/modals/LayawayModal.jsx
// Convierte el carrito activo en un apartado en vez de una venta completa.
// Distinto de PaymentModal: aquí el pago NO tiene que cubrir el total — el
// anticipo es opcional y el resto queda pendiente (layaways.balance), y el
// stock se RESERVA (layaway_reserve) en vez de descontarse como venta.
//
// [LIMITACIÓN A PROPÓSITO] createLayaway calcula el total sumando
// unit_price * quantity de los items — no tiene campo para el descuento de
// carrito. Por eso este modal bloquea la creación si cart.discount.applied
// > 0, en vez de ignorar el descuento en silencio y cobrar de más.

import { useState } from 'react'
import { usePos } from '../../../Context/PosContext'
import api from '../../../services/api'

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
  d.setDate(d.getDate() + 15)
  return toLocalDateStr(d)
}

const itemLabel = (i) => i.name

const LayawayModal = ({ onClose }) => {
  const { cart, subtotal, paymentMethods, branchId, completeSale } = usePos()

  const isGenericCustomer = !cart.customerId || cart.customerId === GENERIC_CUSTOMER_ID
  const hasDiscount       = cart.discount.applied > 0

  // Anticipo — un solo método a propósito (mantener el flujo simple); el
  // backend acepta un arreglo mixto pero el POS no necesita esa complejidad
  // aquí. Excluye 'credit' — mezclar dos instrumentos de pago diferido
  // (crédito + apartado) en la misma operación es confuso para el cajero.
  const anticipoMethods = paymentMethods.filter(m => m.code !== 'credit')
  const [methodId,  setMethodId]  = useState(anticipoMethods[0]?.payment_method_id ?? '')
  const [downAmount, setDownAmount] = useState('')
  const [dueDate,    setDueDate]    = useState(defaultDueDate())
  const [notes,      setNotes]      = useState('')

  const [isSaving, setIsSaving] = useState(false)
  const [error,    setError]    = useState(null)
  const [result,   setResult]   = useState(null) // { layawayId, totalAmount, balance }

  const downAmt   = Math.max(0, Number(downAmount) || 0)
  const downError = downAmt > subtotal ? 'El anticipo no puede ser mayor al total' : null

  const handleConfirm = async () => {
    if (downError) { setError(downError); return }
    setIsSaving(true)
    setError(null)
    try {
      const initialPayments = downAmt > 0 ? [{
        payment_method_id: methodId,
        amount: downAmt,
        cash_received: downAmt,
        cash_change: 0,
      }] : []

      const payload = {
        customerId: cart.customerId,
        items: cart.items.map(i => ({
          product_id: i.product_id,
          variant_id: i.variant_id ?? null,
          quantity:   i.quantity,
          unit_price: i.unit_price,
        })),
        initialPayments,
        dueDate,
        notes: notes.trim() || null,
      }
      const { data } = await api.post(`layaways?branch_id=${branchId}`, payload)
      setResult(data.data)
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al crear el apartado')
    } finally {
      setIsSaving(false)
    }
  }

  const handleFinish = () => {
    completeSale() // limpia el carrito igual que al terminar una venta
    onClose()
  }

  return (
    <div className="pos-overlay" onClick={e => !result && e.target === e.currentTarget && onClose()}>
      <div className="pos-modal">
        <div className="pos-modal__header">
          <h3 className="pos-modal__title"><i className="bi bi-bag-check" /> Apartado</h3>
          {!result && (
            <button className="pos-modal__close" onClick={onClose} aria-label="Cerrar"><i className="bi bi-x-lg" /></button>
          )}
        </div>

        <div className="pos-modal__body">
          {!result ? (
            <>
              {hasDiscount ? (
                <div className="pos-alert pos-alert--error">
                  <i className="bi bi-exclamation-circle" />
                  <span>No se puede crear un apartado con un descuento de carrito aplicado — quita el descuento primero.</span>
                </div>
              ) : isGenericCustomer ? (
                <div className="pos-alert pos-alert--error">
                  <i className="bi bi-exclamation-circle" />
                  <span>Selecciona un cliente (no Público general) para crear un apartado.</span>
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

                  <div className="pos-pay-total">
                    <span>Total del apartado</span>
                    <strong>{money(subtotal)}</strong>
                  </div>

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
                    Saldo pendiente: <strong>{money(Math.max(0, subtotal - downAmt))}</strong>
                  </div>

                  <div className="pos-field">
                    <label className="pos-field__label">Fecha límite de entrega</label>
                    <input
                      type="date" className="pos-field__input"
                      value={dueDate} onChange={e => setDueDate(e.target.value)}
                    />
                  </div>

                  <div className="pos-field">
                    <label className="pos-field__label">Notas (opcional)</label>
                    <textarea
                      className="pos-field__input" style={{ fontSize: 14, fontWeight: 400, resize: 'vertical', minHeight: 60 }}
                      value={notes} onChange={e => setNotes(e.target.value)}
                      placeholder="Ej. cliente recoge después de las 5pm"
                    />
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="pos-pay-success">
              <i className="bi bi-check-circle-fill" />
              <span className="pos-pay-success__title">Apartado creado</span>
              <span className="pos-pay-success__order">Apartado #{result.layawayId}</span>
              <div className="pos-pay-success__change">
                <span>Saldo pendiente</span>
                <strong>{money(result.balance)}</strong>
              </div>
            </div>
          )}
        </div>

        <div className="pos-modal__footer">
          {!result ? (
            <button
              type="button" className="pos-btn pos-btn--primary pos-btn--block"
              onClick={handleConfirm}
              disabled={isSaving || hasDiscount || isGenericCustomer || !dueDate || !!downError}
            >
              {isSaving ? <span className="pos-spinner" /> : <><i className="bi bi-bag-check" /> Crear apartado</>}
            </button>
          ) : (
            <button type="button" className="pos-btn pos-btn--primary" style={{ flex: 1 }} onClick={handleFinish}>
              <i className="bi bi-check-lg" /> Listo
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default LayawayModal
