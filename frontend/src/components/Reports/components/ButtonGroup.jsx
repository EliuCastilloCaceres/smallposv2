// src/components/Reports/components/ButtonGroup.jsx
// Botones de una sola opción para los controles de una sección: "Ver por",
// métrica, granularidad o comparación (specs/07 y 08). Cada opción:
// { id, label, disabled?, title? }. Con `caption` se muestra una etiqueta
// visible antes de los botones ("Por", "Comparar").

const ButtonGroup = ({ label, caption, options, value, onChange }) => (
  <div className="rpt-button-group">
    {caption && <span className="rpt-button-group__caption" aria-hidden="true">{caption}</span>}
    <div className="rpt-presets" role="group" aria-label={label}>
      {options.map(o => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          disabled={o.disabled}
          title={o.title}
          className={`rpt-preset ${value === o.id ? 'rpt-preset--active' : ''}`}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  </div>
)

export default ButtonGroup
