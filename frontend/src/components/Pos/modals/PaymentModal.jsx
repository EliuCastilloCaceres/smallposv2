// src/components/Pos/modals/PaymentModal.jsx
import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { usePos } from '../../../Context/PosContext'
import { useBranch } from '../../../Context/BranchContext'
import { useUser } from '../../../context/UserContext'
import api from '../../../services/api'
import { openReceiptWindow } from '../printReceipt'
import KeyboardNavGrid from '../../common/KeyboardNavGrid'

const money = (n) => Number(n ?? 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
const QUICK_AMOUNTS = [20, 50, 100, 200, 500, 1000]

/* ── Focus trap: mantiene Tab dentro del modal ── */
const useFocusTrap = (ref, isActive) => {
  useEffect(() => {
    if (!isActive || !ref.current) return
    const el = ref.current
    const focusables = () =>
      el.querySelectorAll('button, input, select, textarea, [tabindex]:not([tabindex="-1"])')
    const onKey = (e) => {
      if (e.key !== 'Tab') return
      const nodes = Array.from(focusables())
      if (nodes.length === 0) return
      const first = nodes[0], last = nodes[nodes.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus()
      }
    }
    el.addEventListener('keydown', onKey)
    return () => el.removeEventListener('keydown', onKey)
  }, [isActive, ref])
}

const PaymentModal = ({ onClose, onSaleCompleted }) => {
  const {
    cart, subtotal, total, paymentMethods,
    activeRegisterId, activeRegister, branchId, completeSale,
  } = usePos()
  const { selectedBranch } = useBranch()
  const { user } = useUser()

  const [lines,        setLines]        = useState([])
  const [cashPanel,     setCashPanel]    = useState(false)
  const [cashReceived,  setCashReceived] = useState('')

  const [isSaving, setIsSaving] = useState(false)
  const [error,    setError]    = useState(null)
  const [result,   setResult]   = useState(null)

  /* ── Navegación por teclado ── */
  const [activeMethodIdx, setActiveMethodIdx] = useState(0)
  const [activeLineIdx,   setActiveLineIdx]   = useState(null)
  const modalRef        = useRef(null)
  const methodsGridApi  = useRef(null) // API imperativa de KeyboardNavGrid (focusActive, etc.)
  const confirmBtnRef   = useRef(null)
  const cashInputRef    = useRef(null)

  useFocusTrap(modalRef, !result)

  const assigned  = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0)
  const remaining = Math.max(0, +(total - assigned).toFixed(2))
  const totalChange = lines.reduce((s, l) => s + (l.cash_change ?? 0), 0)
  const isFreeSale = total === 0
  const availableMethods = paymentMethods.filter(m => m.code !== 'credit')
  const canConfirm = !isSaving && (isFreeSale || (remaining === 0 && lines.length > 0))

  /* ── Foco inicial inteligente ──
     El grid de métodos (KeyboardNavGrid) ya sincroniza su propio foco cada
     vez que cambia su índice activo, así que acá solo hace falta pedirle
     que se enfoque cuando corresponde mostrarlo — no hace falta duplicar
     esa lógica ni depender de activeMethodIdx. ── */
  useEffect(() => {
    if (result) { confirmBtnRef.current?.focus(); return }
    if (cashPanel) return // el input de efectivo maneja su propio autoFocus
    if (lines.length > 0 && remaining === 0) {
      confirmBtnRef.current?.focus(); return
    }
    methodsGridApi.current?.focusActive()
  }, [result, cashPanel, lines.length, remaining])

  /* ── Atajos en panel de efectivo: E = exacto, Escape = cancelar ──
     Antes había también atajos F7-F12 para sumar montos rápidos, pero se
     quitaron: los botones de monto rápido siguen ahí y funcionan con
     click/Enter (navegables con flechas si se le da foco al panel), solo
     ya no tienen atajo de teclado dedicado. El de "exacto" (E) sí se
     mantiene como atajo global del panel y a propósito funciona SIEMPRE,
     incluso con el input de "monto recibido" enfocado — es el atajo que el
     cajero más usa y no tiene sentido obligarlo a desenfocar el input
     primero. Esto sí le gana la mano a la "e" nativa de notación
     científica de <input type="number">, pero es el trade-off buscado. ── */
  useEffect(() => {
    if (!cashPanel) return
    const handler = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setCashPanel(false)
        setCashReceived('')
        setTimeout(() => methodsGridApi.current?.focusActive(), 0)
        return
      }
      if (e.key.toLowerCase() === 'e') {
        e.preventDefault()
        setCashReceived(String(remaining))
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [cashPanel, remaining])

  /* ── Escape en la pantalla base (sin panel de efectivo, sin resultado):
     cierra el modal completo. Junto con el Escape del panel de efectivo
     de arriba (que retrocede al listado de métodos), esto arma el
     comportamiento de "ir retrocediendo pasos": Escape en el panel de
     efectivo → vuelve a métodos; Escape en métodos/líneas → cierra el
     modal. No aplica mientras se está guardando ni en la pantalla de
     éxito (ahí no hay paso atrás, solo Enter para nueva venta). ── */
  useEffect(() => {
    if (cashPanel || result || isSaving) return
    const handler = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [cashPanel, result, isSaving, onClose])

  /* ── Confirmar venta: Ctrl+Enter o F10 ── */
  useEffect(() => {
    if (!canConfirm || result) return
    const handler = (e) => {
      if ((e.ctrlKey && e.key === 'Enter') || e.key === 'F10') {
        e.preventDefault()
        handleConfirmSale()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [canConfirm, result])

  /* ── Post-venta: Enter = nueva venta, P = imprimir ── */
  useEffect(() => {
    if (!result) return
    const handler = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); handleFinish() }
      if (e.key === 'p' || e.key === 'P') { e.preventDefault(); handlePrint() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [result])

  const removeLine = (idx) => {
    setLines(prev => prev.filter((_, i) => i !== idx))
    if (activeLineIdx === idx) setActiveLineIdx(null)
    else if (activeLineIdx !== null && activeLineIdx > idx) setActiveLineIdx(p => p - 1)
  }

  const updateLineAmount = (idx, value) => {
    if (value === '') {
      setLines(prev => prev.map((l, i) => i === idx ? { ...l, amount: '' } : l))
      return
    }
    const n = Math.max(0, Number(value) || 0)
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, amount: n } : l))
  }

  const blurLineAmount = (idx) => {
    setLines(prev => prev.map((l, i) => (i === idx && l.amount === '') ? { ...l, amount: 0 } : l))
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
    cashInputRef.current?.focus()
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

  const handleConfirmSale = useCallback(async () => {
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
          amount:            Number(l.amount) || 0,
          cash_received:     l.cash_received,
          cash_change:       l.cash_change,
        })),
      }
      const { data } = await api.post(`orders?branch_id=${branchId}`, payload)
      setResult(data.data)
      onSaleCompleted?.()
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al procesar la venta')
    } finally {
      setIsSaving(false)
    }
  }, [cart, subtotal, total, lines, activeRegisterId, branchId, onSaleCompleted])

  const handleFinish = useCallback(() => {
    completeSale()
    onClose()
  }, [completeSale, onClose])

  const handlePrint = useCallback(() => {
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
  }, [result, selectedBranch, activeRegister, user, cart.items, subtotal, total, lines, totalChange])

  return (
    <div className="pos-overlay" onClick={e => !result && !isSaving && e.target === e.currentTarget && onClose()}>
      <div className="pos-modal" ref={modalRef}>

        <div className="pos-modal__header">
          <h3 className="pos-modal__title"><i className="bi bi-cash-coin" /> Cobrar</h3>
          {!result && (
            <button className="pos-modal__close" onClick={onClose} aria-label="Cerrar"><i className="bi bi-x-lg" /></button>
          )}
        </div>

        <div className="pos-modal__body">
          {/* Anuncios para lectores de pantalla */}
          <div aria-live="polite" className="sr-only">
            {result
              ? `Venta completada. Orden número ${result.orderId}.`
              : remaining > 0
                ? `Falta por asignar ${money(remaining)}`
                : 'Pago completo. Listo para confirmar.'}
          </div>

          {!result ? (
            <>
              <div className="pos-pay-total">
                <span>Total a pagar</span>
                <strong>{money(total)}</strong>
              </div>

              {error && (
                <div className="pos-alert pos-alert--error"><i className="bi bi-exclamation-circle" /><span>{error}</span></div>
              )}

              {isFreeSale ? (
                <div className="pos-alert pos-alert--info">
                  <i className="bi bi-info-circle" />
                  <span>Esta venta no tiene costo. No se requiere método de pago.</span>
                </div>
              ) : (
                <>
                  {lines.length > 0 && (
                    <div className="pos-pay-lines">
                      {lines.map((l, i) => (
                        <div
                          key={i}
                          className={`pos-pay-line ${activeLineIdx === i ? 'pos-pay-line--active' : ''}`}
                          onClick={() => setActiveLineIdx(i)}
                        >
                          <span className="pos-pay-line__name">{l.name}</span>
                          <input
                            type="number" min="0" step="0.01"
                            className="pos-pay-line__amount"
                            value={l.amount}
                            onChange={e => updateLineAmount(i, e.target.value)}
                            onBlur={() => blurLineAmount(i)}
                            onFocus={() => setActiveLineIdx(i)}
                            onKeyDown={e => {
                              if ((e.key === 'Delete' || e.key === 'Backspace') && (l.amount === '' || l.amount === 0 || l.amount === '0')) {
                                e.preventDefault()
                                removeLine(i)
                                setTimeout(() => {
                                  const next = modalRef.current?.querySelector('.pos-pay-methods button, .pos-modal__footer button')
                                  next?.focus()
                                }, 0)
                              }
                              if (e.key === 'Enter' && remaining === 0) {
                                e.preventDefault()
                                confirmBtnRef.current?.focus()
                              }
                            }}
                          />
                          {l.cash_change > 0 && (
                            <span className="pos-pay-line__change">cambio {money(l.cash_change)}</span>
                          )}
                          <button type="button" className="pos-pay-line__remove" onClick={() => removeLine(i)} tabIndex={-1}>
                            <i className="bi bi-x" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {remaining > 0 && (
                    <div className="pos-pay-remaining">
                      Falta por asignar: <strong>{money(remaining)}</strong>
                    </div>
                  )}

                  {cashPanel ? (
                    <div className="pos-pay-cash-panel">
                      <div className="pos-field pos-field__prefix">
                        <label className="pos-field__label">Monto recibido</label>
                        <span>$</span>
                        <input
                          ref={cashInputRef}
                          type="number" min="0" step="0.01"
                          className="pos-field__input"
                          value={cashReceived}
                          onChange={e => setCashReceived(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              confirmCashLine()
                            }
                            // Escape lo maneja el listener global del panel de
                            // efectivo (ver useEffect de atajos): así queda un
                            // solo lugar con la lógica de "retroceder al paso
                            // anterior" y no se duplica.
                          }}
                          placeholder="0.00"
                          autoFocus
                        />
                      </div>
                      <div className="pos-pay-quick-grid">
                        <button type="button" className="pos-btn pos-btn--ghost pos-pay-quick-exact"
                          onClick={() => { setCashReceived(String(remaining)); cashInputRef.current?.focus() }}>
                          Exacto ({money(remaining)}) <kbd className="pos-key-hint-inline">E</kbd>
                        </button>
                        {QUICK_AMOUNTS.map((n) => (
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
                    <KeyboardNavGrid
                      ref={methodsGridApi}
                      items={availableMethods}
                      getKey={m => m.payment_method_id}
                      onSelect={pickMethod}
                      className="pos-pay-methods"
                      activeIndex={activeMethodIdx}
                      onActiveIndexChange={setActiveMethodIdx}
                    >
                      {(m, i, { isActive, itemProps }) => (
                        <button
                          type="button"
                          className={`pos-pay-method-btn ${isActive ? 'pos-pay-method-btn--active' : ''}`}
                          {...itemProps}
                        >
                          <i className={`bi ${m.code === 'cash' ? 'bi-cash' : 'bi-credit-card'}`} />
                          <span>{m.name}</span>
                        </button>
                      )}
                    </KeyboardNavGrid>
                  )}
                </>
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
            <button
              type="button"
              className="pos-btn pos-btn--primary pos-btn--block"
              ref={confirmBtnRef}
              onClick={handleConfirmSale}
              disabled={!canConfirm}
            >
              {isSaving ? <span className="pos-spinner" /> : <><i className="bi bi-check-lg" /> Confirmar venta (Enter o F10)</>}
            </button>
          ) : (
            <>
              <button type="button" className="pos-btn pos-btn--ghost" onClick={handlePrint}>
                <i className="bi bi-printer" /> Imprimir recibo <kbd className="pos-key-hint-inline">P</kbd>
              </button>
              <button
                type="button"
                className="pos-btn pos-btn--primary"
                ref={confirmBtnRef}
                onClick={handleFinish}
              >
                <i className="bi bi-plus-lg" /> Nueva venta <kbd className="pos-key-hint-inline">Enter</kbd>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default PaymentModal