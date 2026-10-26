// src/components/Reports/components/FilterCard.test.jsx
// Tarjeta de filtros de Reportes (spec 08, T1).
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import FilterCard from './FilterCard'

describe('FilterCard', () => {
  it('shows the top always and opens the rest with the "Filtros" button', () => {
    const { container } = render(
      <FilterCard top={<span>periodo</span>}>
        <select aria-label="Sucursal" />
      </FilterCard>
    )
    const button = screen.getByRole('button', { name: /^Filtros/ })
    const body = container.querySelector('.rpt-filter-card__body')

    expect(screen.getByText('periodo')).toBeInTheDocument()
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(body).not.toHaveClass('rpt-filter-card__body--open')

    fireEvent.click(button)

    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(body).toHaveClass('rpt-filter-card__body--open')
  })

  it('shows how many filters are active, and nothing when there are none', () => {
    const { rerender } = render(<FilterCard top={null} activeCount={0}><select aria-label="Sucursal" /></FilterCard>)
    expect(within(screen.getByRole('button', { name: /^Filtros/ })).queryByText(/\d/)).toBeNull()

    rerender(<FilterCard top={null} activeCount={2}><select aria-label="Sucursal" /></FilterCard>)

    expect(within(screen.getByRole('button', { name: /^Filtros/ })).getByText('2')).toBeInTheDocument()
  })

  it('has no "Filtros" button when everything is in the top', () => {
    render(<FilterCard top={<span>periodo</span>}>{false}</FilterCard>)

    expect(screen.queryByRole('button', { name: /^Filtros/ })).toBeNull()
  })
})
