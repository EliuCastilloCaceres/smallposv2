// src/components/Reports/components/FilterCard.jsx
// Tarjeta de filtros de las pestañas de Reportes: lo que cambia toda la
// pestaña va aquí, arriba de todo (specs/08-rediseno-ventas-y-tendencia.md,
// requisitos 1 y 5). `top` siempre se ve; el resto (`children`) se abre en
// móvil con el botón "Filtros", que dice cuántos hay activos. En desktop todo
// se ve siempre.
import { Children, useState } from 'react'

const FilterCard = ({ top, activeCount = 0, children }) => {
  const [open, setOpen] = useState(false)
  const hasMore = Children.toArray(children).length > 0

  return (
    <section className="rpt-filter-card" aria-label="Filtros">
      <div className="rpt-filter-card__top">
        {top}
        {hasMore && (
          <button
            type="button" className="rpt-toggle rpt-only-mobile"
            aria-expanded={open} onClick={() => setOpen(v => !v)}
          >
            <i className="bi bi-sliders" />
            Filtros
            {activeCount > 0 && <span className="rpt-badge" aria-label={`${activeCount} activos`}>{activeCount}</span>}
          </button>
        )}
      </div>

      {hasMore && (
        <div className={`rpt-filter-card__body ${open ? 'rpt-filter-card__body--open' : ''}`}>
          {children}
        </div>
      )}
    </section>
  )
}

export default FilterCard
