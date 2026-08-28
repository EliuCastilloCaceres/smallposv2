// src/components/Pos/printCorteReport.js
// Genera el reporte imprimible del corte de caja. Mismo patrón que
// PrintBarcodesModal.jsx: abre una ventana nueva con HTML propio y llama a
// window.print() — el navegador ya permite "Guardar como PDF" desde ahí,
// así que no hace falta ninguna librería de PDF nueva.
import { fmtDateTime } from "../../utils/dateFormatter"

const money = (n) => Number(n ?? 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })

// DDMMAAAAHHmm (24hrs) para el título de la ventana/pestaña — ej. cierre
// 04/08/2026 10:50pm -> "040820262250"
const fmtFileDate = (d) => {
  const date = d ? new Date(d) : new Date()
  const dd   = String(date.getDate()).padStart(2, '0')
  const mm   = String(date.getMonth() + 1).padStart(2, '0')
  const yyyy = date.getFullYear()
  const hh   = String(date.getHours()).padStart(2, '0')
  const min  = String(date.getMinutes()).padStart(2, '0')
  return `${dd}${mm}${yyyy}${hh}${min}`
}

const MOVEMENT_LABELS = {
  sale:            'Venta',
  income:          'Ingreso manual',
  credit_payment:  'Abono a crédito',
  layaway_payment: 'Abono a apartado',
  expense:         'Retiro manual',
  return:          'Devolución',
}

const escapeHtml = (str = '') =>
  String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]))

const productLabel = (p) =>
  escapeHtml(p.variant_label ? `${p.product_name} - ${p.variant_label}` : p.product_name)

export const openCorteReportWindow = (report) => {
  const printWindow = window.open('', '_blank', 'width=900,height=700')
  if (!printWindow) {
    alert('Tu navegador bloqueó la ventana de impresión. Habilita las ventanas emergentes para este sitio.')
    return
  }

  const diffLabel = report.difference === 0
    ? 'Caja cuadrada'
    : `${report.difference > 0 ? 'Sobrante' : 'Faltante'} de ${money(Math.abs(report.difference))}`
  const diffColor = report.difference === 0 ? '#16a34a' : report.difference > 0 ? '#d97706' : '#dc2626'

  const paymentRows = report.paymentBreakdown.map(m => `
    <tr>
      <td>${escapeHtml(m.name)}</td>
      <td class="num">${money(m.total)}</td>
    </tr>
  `).join('')
  const totalVendido = report.paymentBreakdown.reduce((sum, m) => sum + Number(m.total ?? 0), 0)
  const registerSlug = String(report.registerName ?? '').replace(/\s+/g, '')
  const windowTitle   = `Corte-${registerSlug}-${fmtFileDate(report.closedAt)}`

  const movementRows = report.movements.length > 0
    ? report.movements.map(m => `
        <tr>
          <td>${fmtDateTime(m.created_at)}</td>
          <td>${MOVEMENT_LABELS[m.movement_type] ?? m.movement_type}</td>
          <td class="num">${money(m.amount)}</td>
          <td>${escapeHtml(m.description ?? '—')}</td>
          <td>${escapeHtml(m.user_name ?? '—')}</td>
        </tr>
      `).join('')
    : `<tr><td colspan="5" class="empty">Sin movimientos manuales registrados</td></tr>`

  const productRows = report.productsSold.length > 0
    ? report.productsSold.map(p => `
        <tr>
          <td>${productLabel(p)}</td>
          <td class="num">${p.total_sold}</td>
          <td class="num">${p.remaining_stock}</td>
        </tr>
      `).join('')
    : `<tr><td colspan="3" class="empty">No se vendieron productos en esta sesión</td></tr>`

  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="utf-8" />
      <title>${escapeHtml(windowTitle)}</title>
      <style>
        * { box-sizing: border-box; }
        body { margin: 0; padding: 24px; font-family: Arial, Helvetica, sans-serif; color: #0f172a; font-size: 13px; }
        h1 { font-size: 18px; margin: 0 0 4px; }
        h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .04em; color: #64748b; margin: 24px 0 8px; }
        .header-meta { display: flex; flex-wrap: wrap; gap: 4px 24px; font-size: 12px; color: #334155; margin-bottom: 4px; }
        .header-meta span strong { color: #0f172a; }
        table { width: 100%; border-collapse: collapse; margin-top: 4px; }
        th, td { padding: 6px 8px; border-bottom: 1px solid #e2e8f0; text-align: left; font-size: 12px; }
        th { background: #f1f5f9; font-size: 11px; text-transform: uppercase; color: #64748b; }
        td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
        td.empty { text-align: center; color: #94a3b8; font-style: italic; }
        tfoot .total-row td { border-bottom: none; border-top: 2px solid #cbd5e1; font-weight: 700; }
        .summary-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; margin-top: 4px; }
        .summary-grid .row { display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px dashed #e2e8f0; }
        .diff-box {
          margin-top: 10px; padding: 10px 14px; border-radius: 8px;
          background: ${diffColor}1a; color: ${diffColor}; font-weight: 700; text-align: center;
        }
        .stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 4px; }
        .stat-box { padding: 8px 10px; background: #f8fafc; border-radius: 6px; }
        .stat-box .label { font-size: 10px; color: #64748b; text-transform: uppercase; }
        .stat-box .value { font-size: 15px; font-weight: 700; }
        @media print { body { padding: 10px; } }
      </style>
    </head>
    <body>
      <h1>Corte de caja</h1>
      <div class="header-meta">
        <span>Sucursal: <strong>${escapeHtml(report.branchName)}</strong></span>
        <span>Caja: <strong>${escapeHtml(report.registerName)}</strong></span>
        <span>Cajero: <strong>${escapeHtml(report.cashierName)}</strong></span>
      </div>
      <div class="header-meta">
        <span>Apertura: <strong>${fmtDateTime(report.openedAt)}</strong></span>
        <span>Cierre: <strong>${fmtDateTime(report.closedAt)}</strong></span>
      </div>

      <h2>Resumen de caja</h2>
      <div class="summary-grid">
        <div class="row"><span>Monto de apertura</span><span>${money(report.openAmount)}</span></div>
        <div class="row"><span>Efectivo esperado(Monto Apertura + Ventas Efectivo + Entradas - Salidas)</span><span>${money(report.expectedClose)}</span></div>
        <div class="row"><span>Efectivo contado</span><span>${money(report.cashCounted)}</span></div>
        <div class="row"><span>Retirado en el corte</span><span>${money(report.withdrawAmt)}</span></div>
        <div class="row"><span>Saldo en caja</span><span>${money(report.closeAmount)}</span></div>
      </div>
      <div class="diff-box">${diffLabel}</div>

      <h2>Ventas por método de pago</h2>
      <table>
        <thead><tr><th>Método</th><th class="num">Total</th></tr></thead>
        <tbody>${paymentRows}</tbody>
        <tfoot><tr class="total-row"><td>Total vendido</td><td class="num">${money(totalVendido)}</td></tr></tfoot>
      </table>

      <h2>Estadísticas de la sesión</h2>
      <div class="stats-grid">
        <div class="stat-box"><div class="label">Ventas</div><div class="value">${report.stats.totalOrders}</div></div>
        <div class="stat-box"><div class="label">Ticket promedio</div><div class="value">${money(report.stats.avgTicket)}</div></div>
        <div class="stat-box"><div class="label">Descuentos</div><div class="value">${money(report.stats.totalDiscounts)}</div></div>
        <div class="stat-box"><div class="label">Canceladas</div><div class="value">${report.stats.cancelledCount}</div></div>
        <div class="stat-box" style="grid-column: span 2;"><div class="label">Producto más vendido</div><div class="value" style="font-size:13px;">${escapeHtml(report.stats.topProduct ?? '—')}</div></div>
      </div>

      <h2>Movimientos de efectivo</h2>
      <table>
        <thead><tr><th>Hora</th><th>Tipo</th><th class="num">Monto</th><th>Descripción</th><th>Usuario</th></tr></thead>
        <tbody>${movementRows}</tbody>
      </table>

      <h2>Productos vendidos</h2>
      <table>
        <thead><tr><th>Producto</th><th class="num">Vendidos</th><th class="num">Stock restante</th></tr></thead>
        <tbody>${productRows}</tbody>
      </table>

      <script>
        window.onload = function () { window.focus(); window.print(); };
      </script>
    </body>
    </html>
  `)
  printWindow.document.close()
}