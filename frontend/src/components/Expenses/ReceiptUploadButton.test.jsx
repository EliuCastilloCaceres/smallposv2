// src/components/Expenses/ReceiptUploadButton.test.jsx
// Agregar o reemplazar el comprobante desde un detalle, con la API simulada
// (spec 15, T3): la subida, la confirmación al reemplazar y la validación
// antes de subir.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import api from '../../services/api'
import ReceiptUploadButton, { REPLACE_RECEIPT_MESSAGE } from './ReceiptUploadButton'

vi.mock('../../services/api', () => ({ default: { put: vi.fn() } }))

const photo = () => new File(['foto'], 'factura.png', { type: 'image/png' })

const renderButton = ({ hasReceipt = false } = {}) => {
  const onSaved = vi.fn()
  const onError = vi.fn()
  render(
    <ReceiptUploadButton resource="purchases" recordId={7} hasReceipt={hasReceipt} className="pur-btn"
      onSaved={onSaved} onError={onError} />
  )
  return { onSaved, onError }
}

// La ventana de confirmación del reemplazo
const confirmDialog = () => within(screen.getByText(REPLACE_RECEIPT_MESSAGE).closest('.cfd-modal'))

const choose = (file) =>
  fireEvent.change(screen.getByLabelText('Archivo del comprobante'), { target: { files: [file] } })

describe('ReceiptUploadButton', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('opens the file picker, with the formats of the receipt', () => {
    renderButton()
    const input = screen.getByLabelText('Archivo del comprobante')
    const click = vi.spyOn(input, 'click')

    fireEvent.click(screen.getByRole('button', { name: /Agregar comprobante/ }))

    expect(click).toHaveBeenCalledOnce()
    expect(input).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp,application/pdf')
  })

  it('uploads the receipt of a record without one right away, and returns the updated detail', async () => {
    const detail = { purchase_id: 7, has_receipt: true }
    api.put.mockResolvedValue({ data: { data: detail } })
    const { onSaved } = renderButton()
    const file = photo()

    choose(file)

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(detail))
    const [url, form] = api.put.mock.calls[0]
    expect(url).toBe('purchases/7/receipt')
    expect(form.get('receipt')).toBe(file)
    expect(screen.queryByText(REPLACE_RECEIPT_MESSAGE)).not.toBeInTheDocument()
  })

  it('disables the button while the receipt uploads', async () => {
    let resolve
    api.put.mockReturnValue(new Promise(r => { resolve = r }))
    renderButton()

    choose(photo())

    expect(await screen.findByRole('button', { name: 'Subiendo...' })).toBeDisabled()
    resolve({ data: { data: {} } })
    expect(await screen.findByRole('button', { name: /Agregar comprobante/ })).toBeEnabled()
  })

  it('asks before replacing a receipt, and uploads it only when confirmed', async () => {
    api.put.mockResolvedValue({ data: { data: { purchase_id: 7 } } })
    const { onSaved } = renderButton({ hasReceipt: true })

    choose(photo())
    expect(screen.getByText(REPLACE_RECEIPT_MESSAGE)).toBeInTheDocument()
    expect(api.put).not.toHaveBeenCalled()

    fireEvent.click(confirmDialog().getByRole('button', { name: 'Reemplazar' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(api.put).toHaveBeenCalledOnce()
    expect(screen.queryByText(REPLACE_RECEIPT_MESSAGE)).not.toBeInTheDocument()
  })

  it('keeps the current receipt when the replacement is not confirmed', () => {
    renderButton({ hasReceipt: true })

    choose(photo())
    fireEvent.click(confirmDialog().getByRole('button', { name: 'Volver' }))

    expect(screen.queryByText(REPLACE_RECEIPT_MESSAGE)).not.toBeInTheDocument()
    expect(api.put).not.toHaveBeenCalled()
  })

  it('validates the file before uploading it', () => {
    const { onError } = renderButton()

    choose(new File(['hola'], 'notas.txt', { type: 'text/plain' }))

    expect(onError).toHaveBeenCalledWith('El comprobante debe ser una foto (JPG, PNG o WEBP) o un PDF.')
    expect(api.put).not.toHaveBeenCalled()
  })

  it('passes on the message of the backend when the upload fails', async () => {
    api.put.mockRejectedValue({ response: { data: { message: 'No se puede cambiar el comprobante de una compra cancelada.' } } })
    const { onSaved, onError } = renderButton()

    choose(photo())

    await waitFor(() => expect(onError).toHaveBeenCalledWith('No se puede cambiar el comprobante de una compra cancelada.'))
    expect(onSaved).not.toHaveBeenCalled()
  })
})
