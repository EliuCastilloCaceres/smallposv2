// src/components/Reports/components/SummaryNote.jsx
// Aviso dentro de la tarjeta de resumen, con una acción opcional; por
// ejemplo, el de ventas o productos sin costo con "Excluirlas" o "Incluirlas"
// (specs/07 y 08). tone: 'warn' (amarillo) o 'info' (azul). Con onDismiss
// lleva el botón × para cerrarlo (specs/16-reporte-de-compras.md,
// requisito 23); quien lo usa decide cuándo vuelve a salir.

const SummaryNote = ({ tone = 'warn', children, actionLabel, onAction, onDismiss }) => (
  <div
    className={`rpt-note ${tone === 'info' ? 'rpt-note--info' : ''} ${onDismiss ? 'rpt-note--dismissible' : ''}`}
    role="status"
  >
    <i className={`bi ${tone === 'info' ? 'bi-info-circle' : 'bi-exclamation-triangle'}`} aria-hidden="true" />
    <span>{children}</span>
    {actionLabel && <button type="button" onClick={onAction}>{actionLabel}</button>}
    {onDismiss && (
      <button type="button" className="rpt-note__close" aria-label="Cerrar aviso" onClick={onDismiss}>
        <i className="bi bi-x-lg" aria-hidden="true" />
      </button>
    )}
  </div>
)

export default SummaryNote
