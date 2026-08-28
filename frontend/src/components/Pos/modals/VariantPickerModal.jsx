// src/components/Pos/modals/VariantPickerModal.jsx
// Se abre al tocar un producto variable en el grid. Muestra sus variantes
// con stock; al elegir una se añade directo al carrito.
//
// La navegación por flechas/Enter para elegir variante usa el mismo
// KeyboardNavGrid que PaymentModal usa para elegir método de pago. Acá se
// usa en modo no controlado (sin activeIndex/onActiveIndexChange): el
// picker es efímero — vive solo mientras el modal está abierto — así que
// no hace falta que el padre recuerde qué variante estaba resaltada.

import KeyboardNavGrid from '../../common/KeyboardNavGrid'

const VariantPickerModal = ({ product, onPick, onClose }) => {
  const variants = product.variants ?? []

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
          {variants.length > 0 ? (
            <KeyboardNavGrid
              items={variants}
              getKey={v => v.variant_id}
              onSelect={v => onPick(v)}
              className="pos-variant-grid"
            >
              {(v, i, { isActive, itemProps }) => {
                const noStock = Number(v.quantity) <= 0
                return (
                  <button
                    type="button"
                    className={`pos-variant-card ${noStock ? 'pos-variant-card--empty' : ''} ${isActive ? 'pos-variant-card--active' : ''}`}
                    {...itemProps}
                  >
                    <span className="pos-variant-card__label">{v.label}</span>
                    <span className={`pos-stock-dot ${noStock ? 'pos-stock-dot--empty' : Number(v.quantity) <= 5 ? 'pos-stock-dot--low' : 'pos-stock-dot--ok'}`}>
                      {v.quantity} disp.
                    </span>
                  </button>
                )
              }}
            </KeyboardNavGrid>
          ) : (
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