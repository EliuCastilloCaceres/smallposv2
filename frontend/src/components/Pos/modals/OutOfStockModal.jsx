// src/components/Pos/modals/OutOfStockModal.jsx
// Se abre cuando el cajero intenta agregar al carrito un producto/variante
// con stock 0. Ofrece 3 salidas:
//   1) Registrar entrada de stock ahora (queda en el inventario real)
//   2) Agregar de todos modos (solo un override local para esta venta)
//   3) Cancelar
//
// `target` es el mismo objeto que se le pasaría a addItem():
//   { product_id, variant_id, name, sku, image, unit_price, purchase_price, stock }

import { useState } from 'react'
import { usePos } from '../../../Context/PosContext'
import api from '../../../services/api'

const REASONS = ['Conteo físico', 'Compra a proveedor', 'Otro']

const OutOfStockModal = ({ target, onClose }) => {
  const { branchId, addItem, addStockOverride } = usePos()

  const [mode,       setMode]       = useState(null) // null | 'form'
  const [quantity,   setQuantity]   = useState('')
  const [reason,     setReason]     = useState(REASONS[0])
  const [customReason, setCustomReason] = useState('')
  const [isSaving,   setIsSaving]   = useState(false)
  const [error,      setError]      = useState(null)

  const finalReason = reason === 'Otro' ? customReason.trim() : reason

  const handleAddAnyway = () => {
    addStockOverride(target.product_id, target.variant_id)
    addItem({ ...target, stock: 999 })
    onClose()
  }

  const handleRegisterStock = async (e) => {
    e.preventDefault()
    const qty = Number(quantity)
    if (!qty || qty <= 0) { setError('La cantidad debe ser mayor a 0'); return }
    if (!finalReason) { setError('El motivo es requerido'); return }

    setIsSaving(true)
    setError(null)
    try {
      await api.post(`inventory/adjustments?branch_id=${branchId}`, {
        branch_id:      branchId,
        product_id:     target.product_id,
        variant_id:     target.variant_id ?? null,
        operation_type: 'entry',
        quantity:       qty,
        reason:         finalReason,
      })
      addItem({ ...target, stock: qty })
      onClose()
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al registrar la entrada de stock')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="pos-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="pos-modal">
        <div className="pos-modal__header">
          <h3 className="pos-modal__title"><i className="bi bi-exclamation-triangle" /> Producto agotado</h3>
          <button className="pos-modal__close" onClick={onClose} aria-label="Cerrar"><i className="bi bi-x-lg" /></button>
        </div>

        <div className="pos-modal__body">
          <div className="pos-oos-header">
            <i className="bi bi-box-seam" />
            <strong>{target.name}</strong>
            <span>No hay stock disponible registrado para este producto en esta sucursal.</span>
          </div>

          {error && (
            <div className="pos-alert pos-alert--error"><i className="bi bi-exclamation-circle" /><span>{error}</span></div>
          )}

          {mode === 'form' ? (
            <form className="pos-oos-form" onSubmit={handleRegisterStock}>
              <div className="pos-field pos-field__prefix" style={{ position: 'static' }}>
                <label className="pos-field__label">Cantidad a ingresar</label>
                <input
                  type="number" min="0.001" step="any" inputMode="decimal"
                  className="pos-field__input"
                  value={quantity}
                  onChange={e => setQuantity(e.target.value)}
                  placeholder="0"
                  autoFocus
                />
              </div>
              <div className="pos-field">
                <label className="pos-field__label">Motivo</label>
                <select className="pos-field__input" style={{ fontSize: 14, fontWeight: 500 }}
                  value={reason} onChange={e => setReason(e.target.value)}>
                  {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              {reason === 'Otro' && (
                <div className="pos-field">
                  <label className="pos-field__label">Describe el motivo</label>
                  <input className="pos-field__input" style={{ fontSize: 14, fontWeight: 500 }}
                    value={customReason} onChange={e => setCustomReason(e.target.value)}
                    placeholder="Escribe el motivo..." />
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="pos-btn pos-btn--ghost" style={{ flex: 1 }}
                  onClick={() => setMode(null)} disabled={isSaving}>Atrás</button>
                <button type="submit" className="pos-btn pos-btn--primary" style={{ flex: 1 }} disabled={isSaving}>
                  {isSaving ? <span className="pos-spinner" /> : <><i className="bi bi-check-lg" /> Registrar y agregar</>}
                </button>
              </div>
            </form>
          ) : (
            <div className="pos-oos-actions">
              <button type="button" className="pos-btn pos-btn--primary pos-btn--block" onClick={() => setMode('form')}>
                <i className="bi bi-plus-circle" /> Registrar entrada de stock ahora
              </button>
              <button type="button" className="pos-btn pos-btn--ghost pos-btn--block" onClick={handleAddAnyway}>
                <i className="bi bi-cart-plus" /> Agregar de todos modos
              </button>
              <button type="button" className="pos-btn pos-btn--ghost pos-btn--block" onClick={onClose}>
                Cancelar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default OutOfStockModal
