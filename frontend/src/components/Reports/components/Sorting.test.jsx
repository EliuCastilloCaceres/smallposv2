// src/components/Reports/components/Sorting.test.jsx
// Orden de las tablas de Reportes (spec 08, T1).
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SortHeader, SortSelect, nextSort } from './Sorting'

const SORTS = [
  { id: 'profit', label: 'Utilidad', more: 'Mayor utilidad', less: 'Menor utilidad' },
  { id: 'margin', label: 'Margen',   more: 'Mayor margen',   less: 'Menor margen' },
]

const renderHeaders = (sortBy, sortDir, onSort = vi.fn()) => render(
  <table><thead><tr>
    {SORTS.map(s => <SortHeader key={s.id} sort={s} sortBy={sortBy} sortDir={sortDir} onSort={onSort} />)}
  </tr></thead></table>
)

describe('SortHeader', () => {
  it('marks the sorted column with aria-sort and the others with none', () => {
    renderHeaders('profit', 'asc')

    expect(screen.getByRole('columnheader', { name: /Utilidad/ })).toHaveAttribute('aria-sort', 'ascending')
    expect(screen.getByRole('columnheader', { name: /Margen/ })).toHaveAttribute('aria-sort', 'none')
  })

  it('calls onSort with its column when clicked', () => {
    const onSort = vi.fn()
    renderHeaders('profit', 'desc', onSort)

    fireEvent.click(screen.getByRole('button', { name: /Margen/ }))

    expect(onSort).toHaveBeenCalledWith('margin')
  })
})

describe('nextSort', () => {
  it('inverts the direction of the same column', () => {
    expect(nextSort({ sortBy: 'profit', sortDir: 'desc' }, 'profit')).toEqual({ sortBy: 'profit', sortDir: 'asc' })
    expect(nextSort({ sortBy: 'profit', sortDir: 'asc' }, 'profit')).toEqual({ sortBy: 'profit', sortDir: 'desc' })
  })

  it('starts another column from highest to lowest', () => {
    expect(nextSort({ sortBy: 'profit', sortDir: 'asc' }, 'margin')).toEqual({ sortBy: 'margin', sortDir: 'desc' })
  })
})

describe('SortSelect', () => {
  it('offers each column in both directions and sends the column and the direction', () => {
    const onChange = vi.fn()
    render(<SortSelect sorts={SORTS} sortBy="profit" sortDir="desc" onChange={onChange} />)
    const select = screen.getByRole('combobox', { name: 'Ordenar' })

    expect([...select.options].map(o => o.textContent)).toEqual(['Mayor utilidad', 'Menor utilidad', 'Mayor margen', 'Menor margen'])
    expect(select).toHaveValue('profit:desc')

    fireEvent.change(select, { target: { value: 'margin:asc' } })

    expect(onChange).toHaveBeenCalledWith({ sortBy: 'margin', sortDir: 'asc' })
  })
})
