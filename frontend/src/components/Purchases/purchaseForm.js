// src/components/Purchases/purchaseForm.js
// Piezas que comparten el módulo Compras y la compra del POS
// (specs/14-modulo-de-compras.md): las líneas de la compra, su total, el
// FormData de POST /purchases y ver o descargar el comprobante. El comprobante
// sigue las mismas reglas que el de un gasto.
import { openRecordReceipt, downloadRecordReceipt } from '../Expenses/expenseForm'

export { money, fmtExpenseDate as fmtPurchaseDate, receiptError, RECEIPT_ACCEPT, MAX_RECEIPT_MB } from '../Expenses/expenseForm'

export const MAX_LINES = 200

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100
const round3 = (n) => Math.round(n * 1000) / 1000

// Un producto o una variante solo va en una línea (requisito 3)
const lineKey = (productId, variantId) => `${productId}:${variantId ?? 0}`

// Línea nueva de un producto de GET /purchases/products, o de una de sus
// variantes. El costo unitario empieza con el costo actual, si tiene
// (requisito 33).
const newLine = (product, variant) => ({
  key:          lineKey(product.product_id, variant?.variant_id),
  productId:    product.product_id,
  variantId:    variant?.variant_id ?? null,
  name:         product.name,
  variantLabel: variant?.label ?? null,
  sku:          variant?.sku ?? product.sku,
  uom:          product.uom,
  currentCost:  product.purchase_price,
  quantity:     '1',
  unitCost:     product.purchase_price > 0 ? String(product.purchase_price) : '',
})

// Agrega el producto (o la variante) a la compra; si ya está, suma 1 a su
// cantidad en lugar de repetir la línea
export const addLine = (lines, product, variant = null) => {
  const key = lineKey(product.product_id, variant?.variant_id)
  const existing = lines.find(l => l.key === key)
  if (!existing) return [...lines, newLine(product, variant)]
  return lines.map(l => (l.key === key ? { ...l, quantity: String(round3((Number(l.quantity) || 0) + 1)) } : l))
}

// null si la cantidad o el costo no son válidos todavía
export const lineSubtotal = (line) => {
  const quantity = Number(line.quantity)
  const unitCost = Number(line.unitCost)
  if (!line.quantity || !line.unitCost || !(quantity > 0) || !(unitCost > 0)) return null
  return round2(quantity * unitCost)
}

export const purchaseTotal = (lines) => round2(lines.reduce((sum, l) => sum + (lineSubtotal(l) ?? 0), 0))

export const lineLabel = (line) => (line.variantLabel ? `${line.name} (${line.variantLabel})` : line.name)

// Mensaje del primer problema de las líneas, o null si se pueden mandar. El
// backend vuelve a validar todo.
export const linesError = (lines) => {
  if (lines.length === 0) return 'Agrega al menos un producto a la compra'
  if (lines.length > MAX_LINES) return `La compra no puede tener más de ${MAX_LINES} productos`
  for (const [i, line] of lines.entries()) {
    if (!(Number(line.quantity) > 0)) return `Línea ${i + 1}: la cantidad debe ser mayor a 0`
    if (!(Number(line.unitCost) > 0)) return `Línea ${i + 1}: el costo unitario debe ser mayor a 0`
  }
  return null
}

// FormData para POST /purchases: los campos vacíos no se mandan y las líneas
// van como JSON en "items"
export const buildPurchaseFormData = (fields, lines, receipt) => {
  const form = new FormData()
  Object.entries(fields).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '' || value === false) return
    form.append(key, String(value))
  })
  form.append('items', JSON.stringify(lines.map(l => ({
    product_id: l.productId,
    variant_id: l.variantId,
    quantity:   Number(l.quantity),
    unit_cost:  Number(l.unitCost),
  }))))
  if (receipt) form.append('receipt', receipt)
  return form
}

export const openPurchaseReceipt = (purchaseId) => openRecordReceipt('purchases', purchaseId)

export const downloadPurchaseReceipt = (purchaseId, fileName) =>
  downloadRecordReceipt('purchases', purchaseId, fileName || `comprobante-compra-${purchaseId}`)
