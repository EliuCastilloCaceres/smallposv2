// src/components/Reports/components/Sorting.jsx
// Orden de las tablas de Reportes: un clic en el encabezado ordena de mayor a
// menor y otro invierte el orden; en móvil, donde la tabla son tarjetas, un
// selector con la columna y la dirección (specs/07 y 08).
//
// sort: { id, label, more, less }; `more` y `less` son las opciones del
// selector ("Mayor utilidad", "Menor utilidad").

export const SortHeader = ({ sort, sortBy, sortDir, onSort }) => {
  const active = sortBy === sort.id
  const arrow  = !active ? 'bi-arrow-down-up' : sortDir === 'desc' ? 'bi-arrow-down' : 'bi-arrow-up'
  return (
    <th className="num" aria-sort={active ? (sortDir === 'desc' ? 'descending' : 'ascending') : 'none'}>
      <button type="button" className={`rpt-sort ${active ? 'rpt-sort--active' : ''}`} onClick={() => onSort(sort.id)}>
        {sort.label}
        <i className={`bi ${arrow}`} aria-hidden="true" />
      </button>
    </th>
  )
}

// Siguiente orden al tocar una columna: la misma invierte, otra empieza de mayor a menor
export const nextSort = ({ sortBy, sortDir }, id) =>
  id === sortBy
    ? { sortBy, sortDir: sortDir === 'desc' ? 'asc' : 'desc' }
    : { sortBy: id, sortDir: 'desc' }

export const SortSelect = ({ sorts, sortBy, sortDir, onChange }) => (
  <select
    className="rpt-select rpt-only-mobile" aria-label="Ordenar"
    value={`${sortBy}:${sortDir}`}
    onChange={e => {
      const [id, dir] = e.target.value.split(':')
      onChange({ sortBy: id, sortDir: dir })
    }}
  >
    {sorts.flatMap(s => [
      <option key={`${s.id}:desc`} value={`${s.id}:desc`}>{s.more}</option>,
      <option key={`${s.id}:asc`} value={`${s.id}:asc`}>{s.less}</option>,
    ])}
  </select>
)
