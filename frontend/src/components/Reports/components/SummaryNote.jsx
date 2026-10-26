// src/components/Reports/components/SummaryNote.jsx
// Aviso dentro de la tarjeta de resumen, con una acción opcional; por
// ejemplo, el de ventas o productos sin costo con "Excluirlas" o "Incluirlas"
// (specs/07 y 08). tone: 'warn' (amarillo) o 'info' (azul).

const SummaryNote = ({ tone = 'warn', children, actionLabel, onAction }) => (
  <div className={`rpt-note ${tone === 'info' ? 'rpt-note--info' : ''}`} role="status">
    <i className={`bi ${tone === 'info' ? 'bi-info-circle' : 'bi-exclamation-triangle'}`} aria-hidden="true" />
    <span>{children}</span>
    {actionLabel && <button type="button" onClick={onAction}>{actionLabel}</button>}
  </div>
)

export default SummaryNote
