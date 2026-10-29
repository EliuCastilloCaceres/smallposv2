// src/components/Expenses/expenseForm.js
// Piezas que comparten el formulario del módulo Gastos y el gasto del POS
// (specs/12-modulo-de-gastos.md): validación del comprobante, el FormData de
// POST /expenses, ver o descargar el comprobante y agregarlo o reemplazarlo
// después de guardar (specs/15-comprobante-despues-de-guardar.md).
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import api from '../../services/api'

export const MAX_RECEIPT_MB = 5
// En un teléfono, este accept deja elegir entre la cámara y los archivos
export const RECEIPT_ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf'
const RECEIPT_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'pdf']

export const money = (n) => Number(n ?? 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })

// 'YYYY-MM-DD' → "27 oct 2026"
export const fmtExpenseDate = (iso) =>
  iso ? format(parseISO(`${iso}T12:00:00`), 'd MMM yyyy', { locale: es }).replace(/\./g, '') : '—'

// Mensaje de error del comprobante elegido, o null si se puede subir. El
// backend vuelve a validar el formato con el contenido real del archivo.
export const receiptError = (file) => {
  if (!file) return null
  const ext = file.name.split('.').pop().toLowerCase()
  if (!RECEIPT_EXTENSIONS.includes(ext)) return 'El comprobante debe ser una foto (JPG, PNG o WEBP) o un PDF.'
  if (file.size > MAX_RECEIPT_MB * 1024 * 1024) return `El comprobante no puede pesar más de ${MAX_RECEIPT_MB} MB.`
  return null
}

// FormData para POST /expenses; los campos vacíos no se mandan
export const buildExpenseFormData = (fields, receipt) => {
  const form = new FormData()
  Object.entries(fields).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '' || value === false) return
    form.append(key, String(value))
  })
  if (receipt) form.append('receipt', receipt)
  return form
}

// resource: 'expenses' o 'purchases' (specs/14-modulo-de-compras.md, requisito 13)
const fetchReceipt = async (resource, id) => {
  const { data } = await api.get(`${resource}/${id}/receipt`, { responseType: 'blob' })
  return URL.createObjectURL(data)
}

// Abre el comprobante en una pestaña nueva. La pestaña se abre antes de pedir
// el archivo, para que el navegador no la bloquee como ventana emergente.
export const openRecordReceipt = async (resource, id) => {
  const tab = window.open('', '_blank')
  try {
    const url = await fetchReceipt(resource, id)
    if (tab) tab.location.href = url
    else window.location.href = url
  } catch (err) {
    tab?.close()
    throw err
  }
}

export const downloadRecordReceipt = async (resource, id, fileName) => {
  const url = await fetchReceipt(resource, id)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// Agrega o reemplaza el comprobante de un gasto o de una compra ya
// guardados. Devuelve su detalle actualizado.
export const uploadRecordReceipt = async (resource, id, file) => {
  const form = new FormData()
  form.append('receipt', file)
  const { data } = await api.put(`${resource}/${id}/receipt`, form)
  return data.data
}

export const openReceipt = (expenseId) => openRecordReceipt('expenses', expenseId)

export const downloadReceipt = (expenseId, fileName) =>
  downloadRecordReceipt('expenses', expenseId, fileName || `comprobante-gasto-${expenseId}`)
