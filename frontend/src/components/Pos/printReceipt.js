// src/components/Pos/printReceipt.js
// Genera el ticket de venta imprimible para impresora térmica de 80mm.
// Mismo patrón que printCorteReport.js: ventana nueva con HTML propio +
// window.print() — el navegador ya permite "Guardar como PDF" desde ahí.
//
// El backend (orderService.createOrder) solo devuelve { orderId } — no hay
// folio ni fecha de servidor que pedirle — así que el ticket se arma
// enteramente con los datos que el modal ya tiene al momento de imprimir
// (carrito, líneas de pago, totales) más la fecha/hora actual del cliente,
// que coincide prácticamente con la del servidor porque se imprime justo
// después de confirmar la venta.

const money = (n) => Number(n ?? 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })

const fmtDateTime = (d) => new Date(d).toLocaleString('es-MX', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
})

const escapeHtml = (str = '') =>
  String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]))

// [ASUNCIÓN] Se asume que cada item del carrito trae `name` (o `product_name`
// como respaldo) para mostrarlo en el ticket — el backend no lo valida ni lo
// devuelve, así que si el campo real se llama distinto, ajusta aquí.
const itemLabel = (i) => {
  const base = escapeHtml(i.name ?? i.product_name ?? 'Producto')
  return i.variant_label ? `${base} - ${escapeHtml(i.variant_label)}` : base
}

/**
 * @param {object} sale
 * @param {number} sale.orderId
 * @param {object} sale.receipt        — selectedBranch.receipt (puede ser null)
 * @param {string} sale.branchName     — selectedBranch.name (respaldo si no hay receipt)
 * @param {string} sale.registerName   — activeRegister?.name
 * @param {string} sale.cashierName    — user?.username
 * @param {array}  sale.items          — cart.items
 * @param {number} sale.subtotal
 * @param {number} sale.discount       — cart.discount.applied
 * @param {number} sale.total
 * @param {array}  sale.payments       — lines (name, amount, cash_received, cash_change)
 * @param {number} sale.totalChange
 */
export const openReceiptWindow = (sale) => {
  const printWindow = window.open('', '_blank', 'width=380,height=700')
  if (!printWindow) {
    alert('Tu navegador bloqueó la ventana de impresión. Habilita las ventanas emergentes para este sitio.')
    return
  }

  const r = sale.receipt ?? null
  const storeName = r?.store_name ?? sale.branchName ?? 'Tienda'

  const itemRows = sale.items.map(i => `
    <tr>
      <td colspan="2">${itemLabel(i)}</td>
    </tr>
    <tr>
      <td class="muted">${i.quantity} x ${money(i.unit_price)}</td>
      <td class="num">${money(i.subtotal ?? i.unit_price * i.quantity)}</td>
    </tr>
  `).join('')

  const paymentRows = sale.payments.map(p => `
    <tr>
      <td>${escapeHtml(p.name)}</td>
      <td class="num">${money(p.amount)}</td>
    </tr>
    ${p.cash_received > 0 ? `
    <tr>
      <td class="muted">Recibido</td>
      <td class="num muted">${money(p.cash_received)}</td>
    </tr>` : ''}
  `).join('')

  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="utf-8" />
      <title>Ticket #${sale.orderId}</title>
      <style>
        * { box-sizing: border-box; }
        @page { size: 80mm auto; margin: 0; }
        body {
          margin: 0; padding: 6px 10px 16px;
          font-family: 'Courier New', Courier, monospace;
          font-size: 12px; color: #000; width: 80mm;
        }
        .center { text-align: center; }
        .store-name { font-size: 15px; font-weight: 700; margin: 0 0 2px; }
        .meta { font-size: 11px; margin: 0 0 1px; }
        .logo { max-width: 60mm; max-height: 60px; margin: 0 auto 6px; display: block; }
        hr { border: none; border-top: 1px dashed #000; margin: 8px 0; }
        table { width: 100%; border-collapse: collapse; }
        td { padding: 1px 0; vertical-align: top; }
        td.num { text-align: right; white-space: nowrap; }
        td.muted { color: #444; font-size: 11px; }
        .totals td { padding: 2px 0; }
        .totals .grand td { font-size: 14px; font-weight: 700; padding-top: 4px; }
        .footer { text-align: center; font-size: 11px; margin-top: 10px; white-space: pre-wrap; }
        .ticket-id { text-align: center; font-size: 12px; margin: 6px 0; }
      </style>
    </head>
    <body>
      <div class="center">
        ${r?.logo_image ? `<img class="logo" src="${escapeHtml(r.logo_image)}" />` : ''}
        <p class="store-name">${escapeHtml(storeName)}</p>
        ${r?.address    ? `<p class="meta">${escapeHtml(r.address)}</p>` : ''}
        ${r?.rfc        ? `<p class="meta">RFC: ${escapeHtml(r.rfc)}</p>` : ''}
        ${r?.phone      ? `<p class="meta">Tel: ${escapeHtml(r.phone)}</p>` : ''}
      </div>

      <hr />
      <p class="meta">Fecha: ${fmtDateTime(new Date())}</p>
      ${sale.registerName ? `<p class="meta">Caja: ${escapeHtml(sale.registerName)}</p>` : ''}
      ${sale.cashierName  ? `<p class="meta">Atendió: ${escapeHtml(sale.cashierName)}</p>` : ''}
      <p class="ticket-id">Ticket #${sale.orderId}</p>
      <hr />

      <table>
        <tbody>${itemRows}</tbody>
      </table>

      <hr />
      <table class="totals">
        <tbody>
          <tr><td>Subtotal</td><td class="num">${money(sale.subtotal)}</td></tr>
          ${sale.discount > 0 ? `<tr><td>Descuento</td><td class="num">-${money(sale.discount)}</td></tr>` : ''}
          <tr class="grand"><td>Total</td><td class="num">${money(sale.total)}</td></tr>
        </tbody>
      </table>

      <hr />
      <table>
        <tbody>${paymentRows}</tbody>
        ${sale.totalChange > 0 ? `
        <tfoot>
          <tr><td>Cambio</td><td class="num">${money(sale.totalChange)}</td></tr>
        </tfoot>` : ''}
      </table>

      ${r?.footer_text ? `<hr /><div class="footer">${escapeHtml(r.footer_text)}</div>` : ''}

      <script>
        window.onload = function () { window.focus(); window.print(); };
      </script>
    </body>
    </html>
  `)
  printWindow.document.close()
}
