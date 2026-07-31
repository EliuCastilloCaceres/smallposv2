// src/components/Inventory/modals/PrintBarcodesModal.jsx
//
// Modal para imprimir códigos de barras (CODE128) de productos/variantes.
// Recibe una lista de "renglones" ya resueltos a nivel SKU real:
//   - Producto simple  -> { sku: product.sku, ... }
//   - Producto variable -> { sku: variant.sku, ... } (uno por variante, NUNCA el sku del padre)
//
// Requiere la librería `jsbarcode` (sin dependencias, ~9kb gzip):
//   npm install jsbarcode
//
// Usa las mismas clases de inventory.css que el resto del módulo
// (inv-overlay, inv-modal, inv-btn, inv-action-btn, inv-field__input...).

import { useState, useMemo } from 'react'
import JsBarcode from 'jsbarcode'

// ── Genera un PNG (data URL) del código de barras para un SKU ─────────────────
const buildBarcodeDataUrl = (sku) => {
  try {
    const canvas = document.createElement('canvas')
    JsBarcode(canvas, sku, {
      format: 'CODE128',
      displayValue: true,
      fontSize: 16,
      textMargin: 2,
      height: 45,
      margin: 8,
    })
    return canvas.toDataURL('image/png')
  } catch {
    // SKU no válido para CODE128 (p.ej. vacío) — se filtra antes, pero por si acaso
    return null
  }
}

const escapeHtml = (str = '') =>
  String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]))

// ── Arma el documento HTML de impresión y lo abre en una ventana nueva ────────
const openPrintWindow = (labels) => {
  const printWindow = window.open('', '_blank', 'width=900,height=700')
  if (!printWindow) {
    alert('Tu navegador bloqueó la ventana de impresión. Habilita las ventanas emergentes para este sitio.')
    return
  }

  const tags = []
  labels.forEach(label => {
    const dataUrl = buildBarcodeDataUrl(label.sku)
    if (!dataUrl) return
    const copies = Math.max(0, parseInt(label.print_qty, 10) || 0)
    for (let i = 0; i < copies; i++) {
      tags.push(`
        <div class="label">
          <div class="label__name">${escapeHtml(label.name)}</div>
          <img src="${dataUrl}" alt="${escapeHtml(label.sku)}" />
        </div>
      `)
    }
  })

  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="utf-8" />
      <title>Códigos de barras</title>
      <style>
        * { box-sizing: border-box; }
        body { margin: 0; padding: 12px; font-family: Arial, Helvetica, sans-serif; }
        .sheet { display: flex; flex-wrap: wrap; gap: 10px; }
        .label {
          width: 220px; padding: 8px 6px; border: 1px dashed #bbb;
          text-align: center; page-break-inside: avoid;
        }
        .label__name {
          font-size: 11px; font-weight: 600; margin-bottom: 4px;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .label img { max-width: 100%; height: auto; }
        @media print { .label { border-color: #eee; } }
      </style>
    </head>
    <body>
      <div class="sheet">${tags.join('')}</div>
      <script>
        window.onload = function () { window.focus(); window.print(); };
      </script>
    </body>
    </html>
  `)
  printWindow.document.close()
}

// ── Modal principal ─────────────────────────────────────────────────────────
// items: [{ key, sku, name, qty }]
const PrintBarcodesModal = ({ items, onClose }) => {
  const initial = useMemo(() => items
    .filter(i => i.sku && String(i.sku).trim() !== '')
    .map(i => ({ ...i, print_qty: i.qty > 0 ? i.qty : 1 })),
  [items])

  const [labels, setLabels] = useState(initial)
  const skippedCount = items.length - initial.length

  const updateQty = (key, value) => {
    const n = Math.max(0, parseInt(value, 10) || 0)
    setLabels(prev => prev.map(l => l.key === key ? { ...l, print_qty: n } : l))
  }

  const removeLabel = (key) => {
    setLabels(prev => prev.filter(l => l.key !== key))
  }

  const totalLabels = labels.reduce((sum, l) => sum + (parseInt(l.print_qty, 10) || 0), 0)

  const handlePrint = () => {
    const toPrint = labels.filter(l => (parseInt(l.print_qty, 10) || 0) > 0)
    if (toPrint.length === 0) return
    openPrintWindow(toPrint)
  }

  return (
    <div className="inv-overlay" onClick={onClose}>
      <div className="inv-modal" onClick={e => e.stopPropagation()}>
        <div className="inv-modal__header">
          <h3 className="inv-modal__title"><i className="bi bi-upc-scan" /> Imprimir códigos de barras</h3>
          <button className="inv-modal__close" onClick={onClose}><i className="bi bi-x-lg" /></button>
        </div>

        <div className="inv-modal__body">
          {skippedCount > 0 && (
            <div className="inv-alert">
              <i className="bi bi-exclamation-triangle" />
              {skippedCount === 1
                ? '1 producto no tiene SKU y fue omitido.'
                : `${skippedCount} productos no tienen SKU y fueron omitidos.`}
            </div>
          )}

          {labels.length === 0 ? (
            <div className="inv-empty">
              <i className="bi bi-upc-scan" />
              No hay productos con SKU para imprimir.
            </div>
          ) : (
            <div className="inv-print-list">
              {labels.map(l => (
                <div key={l.key} className="inv-print-row">
                  <div className="inv-print-row__info">
                    <span className="inv-print-row__name">{l.name}</span>
                    <span className="inv-sku">SKU: {l.sku}</span>
                    <span className="inv-td-muted">Existencia: {l.qty}</span>
                  </div>
                  <div className="inv-print-row__actions">
                    <input
                      type="number"
                      min="0"
                      className="inv-field__input inv-print-qty"
                      value={l.print_qty}
                      onChange={e => updateQty(l.key, e.target.value)}
                    />
                    <button className="inv-action-btn inv-action-btn--danger" title="Quitar de la lista"
                      onClick={() => removeLabel(l.key)}>
                      <i className="bi bi-trash3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="inv-modal__footer inv-modal__footer--split">
          <span className="inv-text-muted">{totalLabels} etiqueta{totalLabels !== 1 ? 's' : ''} a imprimir</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="inv-btn inv-btn--ghost" onClick={onClose}>Cancelar</button>
            <button className="inv-btn inv-btn--primary" onClick={handlePrint} disabled={totalLabels === 0}>
              <i className="bi bi-printer" /> Imprimir
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PrintBarcodesModal