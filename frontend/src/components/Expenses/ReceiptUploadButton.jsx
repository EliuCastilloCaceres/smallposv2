// src/components/Expenses/ReceiptUploadButton.jsx
// Agregar o reemplazar el comprobante desde el detalle de un gasto o de una
// compra (specs/15-comprobante-despues-de-guardar.md, requisito 9). Abre el
// selector de archivos (en un teléfono, también la cámara) y valida el archivo
// como el formulario. Si ya hay comprobante, pide confirmación antes de
// reemplazarlo, porque el anterior se borra.
import { useRef, useState } from 'react'
import ConfirmDialog from '../Common/ConfirmDialog'
import { RECEIPT_ACCEPT, receiptError, uploadRecordReceipt } from './expenseForm'

export const REPLACE_RECEIPT_MESSAGE = '¿Reemplazar el comprobante? El anterior se borra y no se puede recuperar.'

// resource: 'expenses' o 'purchases'. onSaved recibe el detalle actualizado;
// onError, el mensaje para mostrar.
const ReceiptUploadButton = ({ resource, recordId, hasReceipt, className, onSaved, onError }) => {
  const inputRef = useRef(null)
  const [pendingFile, setPendingFile] = useState(null)
  const [isUploading, setIsUploading] = useState(false)

  const upload = async (file) => {
    setPendingFile(null)
    setIsUploading(true)
    try {
      onSaved(await uploadRecordReceipt(resource, recordId, file))
    } catch (err) {
      onError(err.response?.data?.message ?? 'No se pudo guardar el comprobante')
    } finally {
      setIsUploading(false)
    }
  }

  const handleChange = (e) => {
    const file = e.target.files?.[0] ?? null
    e.target.value = '' // para poder volver a elegir el mismo archivo
    if (!file) return
    const message = receiptError(file)
    if (message) { onError(message); return }
    if (hasReceipt) setPendingFile(file)
    else upload(file)
  }

  return (
    <>
      <input ref={inputRef} type="file" accept={RECEIPT_ACCEPT} hidden
        aria-label="Archivo del comprobante" onChange={handleChange} />
      <button type="button" className={className} disabled={isUploading}
        onClick={() => inputRef.current?.click()}>
        {isUploading ? 'Subiendo...' : hasReceipt
          ? <><i className="bi bi-arrow-repeat" /> Reemplazar</>
          : <><i className="bi bi-paperclip" /> Agregar comprobante</>}
      </button>

      {pendingFile && (
        <ConfirmDialog
          title="Reemplazar comprobante"
          message={REPLACE_RECEIPT_MESSAGE}
          confirmLabel="Reemplazar"
          cancelLabel="Volver"
          onConfirm={() => upload(pendingFile)}
          onClose={() => setPendingFile(null)}
        />
      )}
    </>
  )
}

export default ReceiptUploadButton
