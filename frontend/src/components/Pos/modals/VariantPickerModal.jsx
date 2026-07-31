// src/components/Pos/modals/VariantPickerModal.jsx
// Se abre al tocar un producto variable en el grid. Muestra sus variantes
// con stock; al elegir una se añade directo al carrito.

const VariantPickerModal = ({ product, onPick, onClose }) => {
  return (
    <div className="pos-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="pos-modal">
        <div className="pos-modal__header">
          <h3 className="pos-modal__title">
            <i className="bi bi-layers" /> {product.name}
          </h3>
          <button className="pos-modal__close" onClick={onClose} aria-label="Cerrar"><i className="bi bi-x-lg" /></button>
        </div>

        <div className="pos-modal__body">
          <div className="pos-variant-grid">
            {product.variants.map(v => {
              const noStock = Number(v.quantity) <= 0
              return (
                <button
                  key={v.variant_id}
                  type="button"
                  className={`pos-variant-card ${noStock ? 'pos-variant-card--empty' : ''}`}
                  onClick={() => onPick(v)}
                >
                  <span className="pos-variant-card__label">{v.label}</span>
                  <span className={`pos-stock-dot ${noStock ? 'pos-stock-dot--empty' : Number(v.quantity) <= 5 ? 'pos-stock-dot--low' : 'pos-stock-dot--ok'}`}>
                    {v.quantity} disp.
                  </span>
                </button>
              )
            })}
          </div>
          {product.variants.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--pos-muted)', textAlign: 'center' }}>
              Este producto no tiene variantes activas.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export default VariantPickerModal
