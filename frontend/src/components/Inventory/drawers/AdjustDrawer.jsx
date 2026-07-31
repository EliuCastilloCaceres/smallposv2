// src/components/Inventory/drawers/AdjustDrawer.jsx
import { useState } from 'react'
import api from '../../../services/api'
import { useBranch } from '../../../context/BranchContext'

const REASONS = [
  'Conteo físico',
  'Merma',
  'Producto dañado',
  'Error de registro',
  'Compra a proveedor',
  'Devolución de cliente',
  'Otro',
]

const AdjustDrawer = ({ product, variant, onDone, onClose }) => {
   const {selectedBranch} = useBranch()
  const [operationType, setOperationType] = useState('entry')
  const [quantity,      setQuantity]      = useState('')
  const [reason,        setReason]        = useState(REASONS[0])
  const [customReason,  setCustomReason]  = useState('')
  const [isSaving,      setIsSaving]      = useState(false)
  const [error,         setError]         = useState(null)

  const currentStock = variant ? variant.quantity : product.total_stock
  const finalReason  = reason === 'Otro' ? customReason.trim() : reason

  const previewStock = (() => {
    const qty = Number(quantity)
    if (!qty || qty <= 0) return null
    return operationType === 'entry'
      ? currentStock + qty
      : currentStock - qty
  })()

  const handleSubmit = async (e) => {
    if(!selectedBranch.branch_id) return
    e.preventDefault()
    if (!quantity || Number(quantity) <= 0) {
      setError('La cantidad debe ser mayor a 0')
      return
    }
    if (!finalReason) {
      setError('El motivo es requerido')
      return
    }

    setIsSaving(true)
    setError(null)
    try {
      await api.post('inventory/adjustments', {
        branch_id: selectedBranch.branch_id,
        product_id:     product.product_id,
        variant_id:     variant?.variant_id ?? null,
        operation_type: operationType,
        quantity:       Number(quantity),
        reason:         finalReason,
      })
      onDone()
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al registrar el ajuste')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <>
      {/* Overlay */}
      <div className="inv-drawer-overlay" onClick={onClose} />

      {/* Drawer */}
      <div className="inv-drawer">
        {/* Header */}
        <div className="inv-drawer__header">
          <div className="inv-drawer__title-wrap">
            <h3 className="inv-drawer__title">Ajuste de stock</h3>
            <span className="inv-drawer__subtitle">
              {product.name}
              {variant && <span className="inv-muted"> · {variant.label}</span>}
            </span>
          </div>
          <button className="inv-drawer__close" onClick={onClose} aria-label="Cerrar">
            <i className="bi bi-x-lg" />
          </button>
        </div>

        {/* Stock actual */}
        <div className="inv-drawer__stock">
          <div className="inv-drawer__stock-item">
            <span className="inv-muted">Stock actual</span>
            <strong className="inv-drawer__stock-val">{currentStock}</strong>
          </div>
          {previewStock !== null && (
            <>
              <i className="bi bi-arrow-right inv-muted" />
              <div className="inv-drawer__stock-item">
                <span className="inv-muted">Después del ajuste</span>
                <strong className={`inv-drawer__stock-val ${
                  previewStock < 0         ? 'inv-drawer__stock-val--red'  :
                  previewStock <= 5        ? 'inv-drawer__stock-val--warn' :
                                            'inv-drawer__stock-val--green'
                }`}>{previewStock}</strong>
              </div>
            </>
          )}
        </div>

        {/* Formulario */}
        <form className="inv-drawer__body" onSubmit={handleSubmit}>

          {/* Tipo de operación */}
          <div className="inv-drawer__op-selector">
            <button
              type="button"
              className={`inv-drawer__op-btn ${operationType === 'entry' ? 'inv-drawer__op-btn--entry' : ''}`}
              onClick={() => { setOperationType('entry'); setError(null) }}
            >
              <i className="bi bi-plus-circle" />
              <span>Entrada</span>
            </button>
            <button
              type="button"
              className={`inv-drawer__op-btn ${operationType === 'exit' ? 'inv-drawer__op-btn--exit' : ''}`}
              onClick={() => { setOperationType('exit'); setError(null) }}
            >
              <i className="bi bi-dash-circle" />
              <span>Salida</span>
            </button>
          </div>

          {/* Cantidad */}
          <div className="inv-field">
            <label className="inv-field__label" htmlFor="adj-qty">
              Cantidad <span className="inv-field__req">*</span>
            </label>
            <input
              id="adj-qty" type="number" min="1" step="1"
              className="inv-field__input inv-field__input--lg"
              value={quantity}
              onChange={e => { setQuantity(e.target.value); setError(null) }}
              placeholder="0"
              autoFocus
            />
          </div>

          {/* Motivo */}
          <div className="inv-field">
            <label className="inv-field__label" htmlFor="adj-reason">
              Motivo <span className="inv-field__req">*</span>
            </label>
            <select id="adj-reason" className="inv-field__input inv-field__select"
              value={reason} onChange={e => { setReason(e.target.value); setError(null) }}>
              {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          {reason === 'Otro' && (
            <div className="inv-field">
              <label className="inv-field__label" htmlFor="adj-custom">
                Describe el motivo <span className="inv-field__req">*</span>
              </label>
              <input id="adj-custom" className="inv-field__input"
                value={customReason}
                onChange={e => { setCustomReason(e.target.value); setError(null) }}
                placeholder="Escribe el motivo..." autoFocus />
            </div>
          )}

          {error && (
            <div className="inv-alert">
              <i className="bi bi-exclamation-circle" /><span>{error}</span>
            </div>
          )}

          {/* Footer */}
          <div className="inv-drawer__footer">
            <button type="button" className="inv-btn inv-btn--ghost" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className={`inv-btn ${operationType === 'entry' ? 'inv-btn--primary' : 'inv-btn--danger'}`}
              disabled={isSaving || !quantity || Number(quantity) <= 0}>
              {isSaving
                ? <><span className="inv-spinner inv-spinner--white" /> Guardando...</>
                : <>
                    <i className={`bi ${operationType === 'entry' ? 'bi-plus-circle' : 'bi-dash-circle'}`} />
                    {operationType === 'entry' ? 'Registrar entrada' : 'Registrar salida'}
                  </>
              }
            </button>
          </div>
        </form>
      </div>
    </>
  )
}

export default AdjustDrawer