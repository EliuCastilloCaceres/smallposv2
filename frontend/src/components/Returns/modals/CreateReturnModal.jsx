// src/components/Returns/modals/CreateReturnModal.jsx
// Flujo: 1) buscar la venta por folio -> 2) elegir productos/cantidades a
// devolver (con "seleccionar todos") -> 3) monto a reembolsar + método +
// (si es efectivo) la caja de la que sale ese efectivo, con la misma
// validación que ya usan los abonos de crédito/apartado: la caja debe
// estar abierta y ser una sesión propia del usuario. A diferencia de un
// abono, aquí no hay "efectivo recibido / cambio" — el dinero SALE de la
// caja, no entra, así que solo se pide el monto a descontar.

import { useState, useEffect } from 'react'
import { useUser } from '../../../Context/UserContext'
import api from '../../../services/api'

const money = (n) => Number(n ?? 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
const itemLabel = (d) => d.variant_label ? `${d.product_name} - ${d.variant_label}` : d.product_name
const keyOf = (d) => `${d.product_id}-${d.variant_id ?? 0}`

// `branch` es la sucursal física del usuario (BranchContext) — puede venir
// null para admin central, ya que Returns.jsx ya no fuerza su selección
// con BranchGate. En ese caso el modal pide elegir una sucursal aquí mismo
// (necesaria para saber en qué caja aplica el efectivo del reembolso),
// usando `branches` (mismo listado que ya carga el filtro de Returns.jsx).
const CreateReturnModal = ({ branch, branches = [], onClose, onCreated }) => {
  const { user } = useUser()

  const [manualBranchId, setManualBranchId] = useState('')
  const effectiveBranchId = branch?.branch_id ?? (manualBranchId ? Number(manualBranchId) : null)
  const selectedBranch = effectiveBranchId ? { branch_id: effectiveBranchId } : null

  // ── Paso 1: buscar orden ──
  const [orderIdInput, setOrderIdInput] = useState('')
  const [lookupLoading, setLookupLoading] = useState(false)
  const [lookupError,   setLookupError]   = useState(null)
  const [order,  setOrder]  = useState(null)
  const [items,  setItems]  = useState([]) // con returnable_quantity/already_returned

  // ── Paso 2: selección de artículos ──
  const [selected, setSelected] = useState({}) // key -> { checked, quantity }

  // ── Paso 3: reembolso ──
  const [reason,          setReason]          = useState('')
  const [refundAmount,    setRefundAmount]    = useState('')
  const [refundTouched,   setRefundTouched]   = useState(false)
  const [methods,         setMethods]         = useState([])
  const [payMethodId,     setPayMethodId]     = useState('')
  const [registers,       setRegisters]       = useState([])
  const [cashRegisterId,  setCashRegisterId]  = useState('')

  const [isSaving, setIsSaving] = useState(false)
  const [error,    setError]    = useState(null)
  const [result,   setResult]   = useState(null) // { returnId, amountRefunded }

  useEffect(() => {
    if (!effectiveBranchId) return
    api.get('payment-methods?is_active=true').then(({ data }) => setMethods(data.data)).catch(() => {})
    api.get(`cash-registers?branch_id=${effectiveBranchId}`).then(({ data }) => setRegisters(data.data)).catch(() => {})
  }, [effectiveBranchId])

  const selectableItems = items.filter(i => i.returnable_quantity > 0)
  const allSelected = selectableItems.length > 0 && selectableItems.every(i => selected[keyOf(i)]?.checked)

  const selectedTotal = items.reduce((sum, i) => {
    const s = selected[keyOf(i)]
    return s?.checked ? sum + Number(i.unit_price) * Number(s.quantity || 0) : sum
  }, 0)

  // El monto a reembolsar se sincroniza con lo seleccionado hasta que el
  // cajero lo edite a mano — a partir de ahí ya no se sobreescribe solo
  // (puede querer cobrar una tarifa de restock, reembolsar menos, etc).
  useEffect(() => {
    if (!refundTouched) setRefundAmount(selectedTotal > 0 ? String(selectedTotal.toFixed(2)) : '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTotal])

  const selectedMethod   = methods.find(m => m.payment_method_id === payMethodId)
  const isCash            = selectedMethod?.code === 'cash'
  const selectedRegister = registers.find(r => r.cash_register_id === cashRegisterId)

  const registerLabel = (r) => {
    if (!r.is_open) return `${r.name}-Cerrada`
    const who = r.opened_by_user_id === user?.user_id ? 'Tú' : (r.opened_by ?? 'otro usuario')
    return `${r.name}-Abierta-${who}`
  }
  const registerError = !selectedRegister ? null
    : !selectedRegister.is_open
      ? 'Esa caja está cerrada. Necesitas abrir una sesión de esa caja desde el POS.'
      : selectedRegister.opened_by_user_id !== user?.user_id
        ? 'Esa caja está abierta por otro usuario — solo puedes usar una caja que tú tengas abierta.'
        : null

  const handleLookup = async () => {
    if (!orderIdInput) { setLookupError('Ingresa el folio de la venta'); return }
    setLookupLoading(true)
    setLookupError(null)
    setOrder(null)
    setItems([])
    setSelected({})
    try {
      const { data } = await api.get(`returns/order/${orderIdInput}/returnable?branch_id=${selectedBranch.branch_id}`)
      setOrder(data.data.order)
      setItems(data.data.items)
    } catch (err) {
      setLookupError(err.response?.data?.message ?? 'No se pudo cargar la venta')
    } finally {
      setLookupLoading(false)
    }
  }

  const toggleItem = (item, checked) => {
    setSelected(prev => ({
      ...prev,
      [keyOf(item)]: { checked, quantity: checked ? (prev[keyOf(item)]?.quantity || item.returnable_quantity) : 0 },
    }))
  }
  const setItemQuantity = (item, qty) => {
    const clamped = Math.min(Math.max(Number(qty) || 0, 0), item.returnable_quantity)
    setSelected(prev => ({ ...prev, [keyOf(item)]: { checked: prev[keyOf(item)]?.checked ?? true, quantity: clamped } }))
  }
  const toggleAll = (checked) => {
    const next = {}
    for (const i of selectableItems) {
      next[keyOf(i)] = { checked, quantity: checked ? i.returnable_quantity : 0 }
    }
    setSelected(next)
  }

  const selectedItems = items
    .filter(i => selected[keyOf(i)]?.checked && Number(selected[keyOf(i)]?.quantity) > 0)
    .map(i => ({
      product_id: i.product_id,
      variant_id: i.variant_id ?? null,
      quantity:   Number(selected[keyOf(i)].quantity),
    }))

  const amountNum = Number(refundAmount) || 0
  const canConfirm = selectedItems.length > 0
    && !isSaving
    && (amountNum === 0 || (payMethodId && (!isCash || (cashRegisterId && !registerError))))

  const handleConfirm = async () => {
    if (!canConfirm) return
    setIsSaving(true)
    setError(null)
    try {
      const payload = {
        orderId: order.order_id,
        items: selectedItems,
        reason: reason.trim() || null,
        refundAmount: amountNum,
        paymentMethodId: amountNum > 0 ? payMethodId : null,
        cashRegisterId: amountNum > 0 && isCash ? cashRegisterId : null,
      }
      const { data } = await api.post(`returns?branch_id=${selectedBranch.branch_id}`, payload)
      setResult(data.data)
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al registrar la devolución')
    } finally {
      setIsSaving(false)
    }
  }

  const handleFinish = () => {
    onCreated?.()
  }

  return (
    <div className="rtn-overlay" onClick={e => !result && e.target === e.currentTarget && onClose()}>
      <div className="rtn-modal">
        <div className="rtn-modal__header">
          <h3 className="rtn-modal__title"><i className="bi bi-arrow-return-left" /> Nueva devolución</h3>
          {!result && (
            <button className="rtn-modal__close" onClick={onClose} aria-label="Cerrar"><i className="bi bi-x-lg" /></button>
          )}
        </div>

        <div className="rtn-modal__body">
          {!result ? (
            <>
              {!branch && (
                <div className="rtn-field">
                  <label className="rtn-field__label">Sucursal</label>
                  <select className="rtn-field__input" value={manualBranchId} onChange={e => setManualBranchId(e.target.value)}>
                    <option value="">Selecciona la sucursal donde se procesa la devolución...</option>
                    {branches.map(b => (
                      <option key={b.branch_id} value={b.branch_id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Paso 1: folio de venta */}
              <div className="rtn-lookup">
                <div className="rtn-field">
                  <label className="rtn-field__label">Folio de la venta</label>
                  <input
                    type="number" className="rtn-field__input"
                    value={orderIdInput} onChange={e => setOrderIdInput(e.target.value)}
                    placeholder="Ej. 128" onKeyDown={e => e.key === 'Enter' && selectedBranch && handleLookup()}
                    disabled={!selectedBranch}
                  />
                </div>
                <button type="button" className="rtn-btn rtn-btn--primary" style={{ alignSelf: 'flex-end' }} onClick={handleLookup} disabled={lookupLoading || !selectedBranch}>
                  {lookupLoading ? <span className="rtn-spinner" /> : <><i className="bi bi-search" /> Buscar</>}
                </button>
              </div>
              {lookupError && <div className="rtn-alert"><i className="bi bi-exclamation-circle" /><span>{lookupError}</span></div>}
              {error && <div className="rtn-alert"><i className="bi bi-exclamation-circle" /><span>{error}</span></div>}

              {order && (
                <>
                  <div className="rtn-detail__meta">
                    <div><span className="rtn-td-muted">Cliente</span><strong>#{order.customer_id}</strong></div>
                    <div><span className="rtn-td-muted">Total de la venta</span><strong>{money(order.total)}</strong></div>
                  </div>

                  {/* Paso 2: artículos */}
                  <div className="rtn-detail__section">
                    <span className="rtn-detail__section-title">Productos</span>

                    {selectableItems.length > 1 && (
                      <label className="rtn-select-all">
                        <input type="checkbox" className="rtn-item-row__checkbox"
                          checked={allSelected} onChange={e => toggleAll(e.target.checked)} />
                        Seleccionar todos
                      </label>
                    )}

                    <div>
                      {items.map(i => {
                        const disabled = i.returnable_quantity <= 0
                        const sel = selected[keyOf(i)]
                        return (
                          <div key={keyOf(i)} className={`rtn-item-row ${disabled ? 'rtn-item-row--disabled' : ''}`}>
                            <input
                              type="checkbox" className="rtn-item-row__checkbox"
                              checked={!!sel?.checked} disabled={disabled}
                              onChange={e => toggleItem(i, e.target.checked)}
                            />
                            <div className="rtn-item-row__info">
                              <span className="rtn-item-row__name">{itemLabel(i)}</span>
                              <span className="rtn-td-muted">
                                {money(i.unit_price)} c/u · vendidos {i.quantity}
                                {i.already_returned > 0 && ` · ya devueltos ${i.already_returned}`}
                              </span>
                            </div>
                            <input
                              type="number" min="0" max={i.returnable_quantity} step="1"
                              className="rtn-item-row__qty"
                              value={sel?.checked ? sel.quantity : ''}
                              disabled={disabled || !sel?.checked}
                              onChange={e => setItemQuantity(i, e.target.value)}
                            />
                            <span className="rtn-item-row__subtotal">
                              {sel?.checked ? money(i.unit_price * (sel.quantity || 0)) : '—'}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Paso 3: motivo + reembolso */}
                  <div className="rtn-field">
                    <label className="rtn-field__label">Motivo (opcional)</label>
                    <textarea
                      className="rtn-field__input" style={{ fontSize: 14, fontWeight: 400, resize: 'vertical', minHeight: 60, paddingTop: 10 }}
                      value={reason} onChange={e => setReason(e.target.value)}
                      placeholder="Ej. producto defectuoso"
                    />
                  </div>

                  <div className="rtn-field">
                    <label className="rtn-field__label">Monto a reembolsar</label>
                    <input
                      type="number" min="0" step="0.01" className="rtn-field__input"
                      value={refundAmount}
                      onChange={e => { setRefundTouched(true); setRefundAmount(e.target.value) }}
                      placeholder="0.00"
                    />
                  </div>

                  {amountNum > 0 && (
                    <div className="rtn-field">
                      <label className="rtn-field__label">Método del reembolso</label>
                      <select className="rtn-field__input" value={payMethodId} onChange={e => setPayMethodId(Number(e.target.value))}>
                        <option value="">Selecciona...</option>
                        {methods.map(m => <option key={m.payment_method_id} value={m.payment_method_id}>{m.name}</option>)}
                      </select>
                    </div>
                  )}

                  {amountNum > 0 && isCash && (
                    <>
                      <div className="rtn-field">
                        <label className="rtn-field__label">Caja de la que saldrá el efectivo</label>
                        <select className="rtn-field__input" value={cashRegisterId} onChange={e => setCashRegisterId(Number(e.target.value))}>
                          <option value="">Selecciona...</option>
                          {registers.map(r => (
                            <option key={r.cash_register_id} value={r.cash_register_id}>{registerLabel(r)}</option>
                          ))}
                        </select>
                      </div>
                      {registerError && (
                        <div className="rtn-alert"><i className="bi bi-exclamation-circle" /><span>{registerError}</span></div>
                      )}
                    </>
                  )}
                </>
              )}
            </>
          ) : (
            <div className="rtn-detail-loading" style={{ flexDirection: 'column', gap: 10, alignItems: 'center', padding: '20px 0' }}>
              <i className="bi bi-check-circle-fill" style={{ fontSize: 32, color: 'var(--rtn-green)' }} />
              <span style={{ fontWeight: 600, color: 'var(--rtn-text)' }}>Devolución #{result.returnId} registrada</span>
              <span className="rtn-td-muted">Reembolsado: {money(result.amountRefunded)}</span>
            </div>
          )}
        </div>

        <div className="rtn-modal__footer">
          {!result ? (
            order && (
              <button type="button" className="rtn-btn rtn-btn--primary rtn-btn--block" onClick={handleConfirm} disabled={!canConfirm}>
                {isSaving ? <span className="rtn-spinner" /> : <><i className="bi bi-arrow-return-left" /> Registrar devolución</>}
              </button>
            )
          ) : (
            <button type="button" className="rtn-btn rtn-btn--primary rtn-btn--block" onClick={handleFinish}>
              <i className="bi bi-check-lg" /> Listo
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default CreateReturnModal