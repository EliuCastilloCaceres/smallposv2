// src/components/Common/ConfirmDialog.jsx
import "./confirmDialog.css"

const ConfirmDialog = ({
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel  = 'Cancelar',
  variant      = 'danger', // 'danger' | 'default'
  onConfirm,
  onClose,
}) => {
  return (
    <div className="cfd-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="cfd-modal cfd-modal--sm">
        <div className="cfd-modal__header">
          <h3 className="cfd-modal__title">
            <i className={`bi ${variant === 'danger' ? 'bi-exclamation-triangle' : 'bi-question-circle'}`} />
            {title}
          </h3>
          <button className="cfd-modal__close" onClick={onClose} aria-label="Cerrar">
            <i className="bi bi-x-lg" />
          </button>
        </div>

        <div className="cfd-modal__body">
          <p className="cfd-confirm__text">{message}</p>

          <div className="cfd-modal__footer">
            <button type="button" className="cfd-btn cfd-btn--ghost" onClick={onClose}>
              {cancelLabel}
            </button>
            <button
              type="button"
              className={`cfd-btn ${variant === 'danger' ? 'cfd-btn--danger' : 'cfd-btn--primary'}`}
              onClick={onConfirm}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ConfirmDialog