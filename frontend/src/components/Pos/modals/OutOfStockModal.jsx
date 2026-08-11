// src/components/Pos/modals/OutOfStockModal.jsx
// Se abre cuando el cajero intenta agregar al carrito un producto/variante
// con stock 0. Solo permite registrar entrada de stock real antes de
// agregarlo — ya no existe "agregar de todos modos": ese override solo
// relajaba el tope de cantidad en el carrito (frontend), pero la venta
// igual reventaba al cobrar porque el backend valida el stock real
// (stockService.applyStockMovement) y nunca se enteraba de que el cajero
// había forzado el alta. Mejor no ofrecer un camino que siempre termina
// en error al final del cobro.
//
// `target` es el mismo objeto que se le pasaría a addItem():
//   { product_id, variant_id, name, sku, image, unit_price, purchase_price, stock }

import { useState } from 'react'
import { usePos } from '../../../Context/PosContext'
import api from '../../../services/api'

const REASONS = ['Conteo físico', 'Compra a proveedor', 'Otro']

const OutOfStockModal = ({ target, onClose, onStockAdded }) => {
  const { branchId, addItem } = usePos()

  const [quantity,   setQuantity]   = useState('')
  const [reason,     setReason]     = useState(REASONS[0])
  const [customReason, setCustomReason] = useState('')
  const [isSaving,   setIsSaving]   = useState(false)
  const [error,      setError]      = useState(null)

  const finalReason = reason === 'Otro' ? customReason.trim() : reason

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
      onStockAdded?.()
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

          <form className="pos-oos-form" onSubmit={handleRegisterStock}>
            <div className="pos-field pos-field__prefix" style={{ position: 'static' }}>
              <label className="pos-field__label">Cantidad a ingresar</label>
              <input
                type="number" min="0.001" step="any" inputMode="decimal"
                className="pos-field__input pos-oos-qty-input"
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
                onClick={onClose} disabled={isSaving}>Cancelar</button>
              <button type="submit" className="pos-btn pos-btn--primary" style={{ flex: 1 }} disabled={isSaving}>
                {isSaving ? <span className="pos-spinner" /> : <><i className="bi bi-check-lg" /> Registrar y agregar</>}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default OutOfStockModal