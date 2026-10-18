// src/components/Common/ConfirmDialog.test.jsx
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import ConfirmDialog from './ConfirmDialog'

const renderDialog = (props = {}) => {
  const onConfirm = vi.fn()
  const onClose   = vi.fn()
  render(
    <ConfirmDialog
      title="Cancelar venta"
      message="¿Seguro que quieres cancelar la venta?"
      onConfirm={onConfirm}
      onClose={onClose}
      {...props}
    />
  )
  return { onConfirm, onClose }
}

describe('ConfirmDialog', () => {
  it('shows its title and message', () => {
    renderDialog()

    expect(screen.getByRole('heading', { name: 'Cancelar venta' })).toBeInTheDocument()
    expect(screen.getByText('¿Seguro que quieres cancelar la venta?')).toBeInTheDocument()
  })

  it('calls onConfirm when the confirm button is clicked', () => {
    const { onConfirm, onClose } = renderDialog()

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))

    expect(onConfirm).toHaveBeenCalledOnce()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('calls onClose from the cancel and close buttons', () => {
    const { onConfirm, onClose } = renderDialog()

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))

    expect(onClose).toHaveBeenCalledTimes(2)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('uses custom button labels', () => {
    renderDialog({ confirmLabel: 'Sí, cancelar', cancelLabel: 'Volver' })

    expect(screen.getByRole('button', { name: 'Sí, cancelar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Volver' })).toBeInTheDocument()
  })
})
