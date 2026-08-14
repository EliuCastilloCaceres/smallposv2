// src/components/Dashboard/Dashboard.jsx
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useUser }   from '../../context/UserContext'
import useApi        from '../../hooks/useApi'
import api           from '../../services/api'
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns'
import { es }        from 'date-fns/locale'
import './dashboard.css'

// ═══════════════════════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════════════════════

const fmt = (n) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n ?? 0)

const fmtCompact = (n) =>
  new Intl.NumberFormat('es-MX', {
    notation: 'compact',
    compactDisplay: 'short',
    maximumFractionDigits: 1,
  }).format(n ?? 0)

const toISO = (d) => format(d, 'yyyy-MM-dd')
const today = () => toISO(new Date())

const formatHour = (hour) => {
  if (hour === null || hour === undefined) return '—'
  const d = new Date()
  d.setHours(hour, 0, 0, 0)
  return format(d, 'h a', { locale: es })
}

// Versión corta para etiquetas de eje ("7a", "1p") — el formato largo
// ("7 a. m.") no cabe bien junto a muchas barras en pantallas angostas
const formatHourShort = (hour) => {
  const h12 = hour % 12 === 0 ? 12 : hour % 12
  return `${h12}${hour < 12 ? 'a' : 'p'}`
}

const getPresetRange = (preset, custom) => {
  const now = new Date()
  switch (preset) {
    case 'week':
      return {
        start: toISO(startOfWeek(now, { weekStartsOn: 1 })),
        end: toISO(endOfWeek(now, { weekStartsOn: 1 })),
      }
    case 'month':
      return { start: toISO(startOfMonth(now)), end: toISO(endOfMonth(now)) }
    case 'custom':
      return { start: custom.start || today(), end: custom.end || today() }
    case 'today':
    default:
      return { start: today(), end: today() }
  }
}

// FIX: renombrado de PAYMENT_COLORS a CHART_COLORS — se reusa también
// para las series por sucursal de la gráfica de ventas por hora
const CHART_COLORS = [
  '#4f8ef7', '#10b981', '#f59e0b', '#8b5cf6',
  '#ef4444', '#0891b2', '#db2777', '#65a30d',
]

// ═══════════════════════════════════════════════════════════════
//  Modal Reutilizable
// ═══════════════════════════════════════════════════════════════

const Modal = ({ isOpen, onClose, title, icon, children }) => {
  // FIX: bloquea el scroll del fondo mientras el modal está abierto (móvil sobre todo)
  useEffect(() => {
    if (!isOpen) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const handleKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleKey)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', handleKey)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      className="dash-modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="dash-modal" onClick={e => e.stopPropagation()}>
        <div className="dash-modal__header">
          <h2 className="dash-panel__title" style={{ margin: 0, border: 'none', padding: 0 }}>
            <i className={`bi ${icon}`} />
            {title}
          </h2>
          <button className="dash-modal__close" onClick={onClose} aria-label="Cerrar">
            <i className="bi bi-x-lg" />
          </button>
        </div>
        <div className="dash-modal__body">
          {children}
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
//  ScrollablePanel
// ═══════════════════════════════════════════════════════════════

const ScrollablePanel = ({ children, maxHeight = 380, itemCount = 0, itemLimit = 5, onViewAll }) => {
  const hasOverflow = itemCount > itemLimit

  return (
    <div className="dash-scrollable-wrap">
      <div className="dash-scrollable" style={{ maxHeight: `${maxHeight}px` }}>
        {children}
      </div>
      {hasOverflow && (
        <button className="dash-view-all-btn" onClick={onViewAll}>
          <span>Ver todo ({itemCount})</span>
          <i className="bi bi-box-arrow-up-right" />
        </button>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
//  StatCard
// ═══════════════════════════════════════════════════════════════

const StatCard = ({ icon, label, value, comparisonValue, comparisonLabel, accent, delay = 0 }) => {
  const hasComparison = comparisonValue !== undefined && comparisonValue !== null
  const trend = hasComparison
    ? (comparisonValue > 0 ? 'up' : comparisonValue < 0 ? 'down' : 'neutral')
    : 'neutral'

  const trendBadge = hasComparison && comparisonValue !== 0 ? (
    <span className={`dash-stat__trend ${trend}`}>
      {comparisonValue > 0 ? '↑' : '↓'} {Math.abs(comparisonValue)}%
    </span>
  ) : null

  const vsLabel = comparisonLabel || 'período anterior'

  return (
    <div className={`dash-stat ${accent ? 'dash-stat--accent' : ''}`} style={{ animationDelay: `${delay}ms` }}>
      <div className="dash-stat__icon">
        <i className={`bi ${icon}`} />
      </div>
      <div className="dash-stat__body">
        <span className="dash-stat__value">{value}</span>
        <span className="dash-stat__label">{label}</span>
        {hasComparison && (
          <span className={`dash-stat__sub ${trend}`}>
            {trendBadge}
            <span style={{ color: 'var(--dash-text-3)' }}>vs {vsLabel}</span>
          </span>
        )}
      </div>
    </div>
  )
}

const EmptyState = ({ icon, text }) => (
  <div className="dash-empty">
    <i className={`bi ${icon}`} />
    <span>{text}</span>
  </div>
)

const Skeleton = ({ rows = 4 }) => (
  <div className="dash-skeleton">
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="dash-skeleton__row" style={{ animationDelay: `${i * 80}ms` }} />
    ))}
  </div>
)

const BranchChip = ({ name }) => (
  <span className="dash-branch-chip">
    <i className="bi bi-geo-alt" />
    {name}
  </span>
)

// ═══════════════════════════════════════════════════════════════
//  PaymentDonut
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
//  SalesByHourChart
// ═══════════════════════════════════════════════════════════════
// mode: 'branch' -> una serie simple (una barra por hora).
// mode: 'consolidated' -> barras apiladas, un segmento de color por
// sucursal, más leyenda. Los datos ya vienen agregados por hora del
// día dentro del rango de fechas elegido (hoy/semana/mes/personalizado)
// — el backend agrupa por HOUR(created_at), no por hora+día.
const SalesByHourChart = ({ data, mode }) => {
  const [hovered, setHovered] = useState(null)
  const [pinned, setPinned] = useState(null)
  const activeIdx = pinned !== null ? pinned : hovered

  const { series, branchNames, maxTotal, grandTotal } = useMemo(() => {
    if (!data || data.length === 0) {
      return { series: [], branchNames: [], maxTotal: 0, grandTotal: 0 }
    }

    const hoursPresent = [...new Set(data.map(d => d.hour))].sort((a, b) => a - b)
    const minHour = hoursPresent[0]
    const maxHour = hoursPresent[hoursPresent.length - 1]
    const hoursRange = []
    for (let h = minHour; h <= maxHour; h++) hoursRange.push(h)

    if (mode === 'consolidated') {
      // Sucursales ordenadas por total desc — orden estable para
      // color, leyenda y apilado
      const totalsByBranch = {}
      data.forEach(d => {
        totalsByBranch[d.branch_name] = (totalsByBranch[d.branch_name] || 0) + d.income
      })
      const names = Object.keys(totalsByBranch).sort((a, b) => totalsByBranch[b] - totalsByBranch[a])

      const byHourBranch = {}
      data.forEach(d => { byHourBranch[`${d.hour}|${d.branch_name}`] = d.income })

      const series = hoursRange.map(hour => {
        const segments = names.map((name, i) => ({
          branch_name: name,
          income: byHourBranch[`${hour}|${name}`] || 0,
          color: CHART_COLORS[i % CHART_COLORS.length],
        }))
        const total = segments.reduce((s, seg) => s + seg.income, 0)
        return { hour, total, segments }
      })

      const maxTotal = Math.max(1, ...series.map(s => s.total))
      const grandTotal = series.reduce((s, row) => s + row.total, 0)
      return { series, branchNames: names, maxTotal, grandTotal }
    }

    const byHour = {}
    data.forEach(d => { byHour[d.hour] = d.income })
    const series = hoursRange.map(hour => ({ hour, total: byHour[hour] || 0 }))
    const maxTotal = Math.max(1, ...series.map(s => s.total))
    const grandTotal = series.reduce((s, row) => s + row.total, 0)
    return { series, branchNames: [], maxTotal, grandTotal }
  }, [data, mode])

  if (series.length === 0) {
    return <EmptyState icon="bi-bar-chart" text="Sin ventas registradas en este período" />
  }

  // FIX: viewBox de ancho FIJO (no escalado por cantidad de horas) — el
  // SVG se reescala al 100% del contenedor vía CSS, así que un ancho
  // intrínseco fijo hace que las barras siempre llenen el contenedor
  // disponible sin necesitar scroll horizontal, sin importar si hay 4 o
  // 18 horas con datos (el mismo problema que rompía la tabla en móvil)
  const chartW = 640
  const chartH = 240
  const padLeft = 48
  const padBottom = 28
  const padTop = 12
  const plotW = chartW - padLeft - 10
  const plotH = chartH - padTop - padBottom
  const barGap = series.length > 16 ? 2 : series.length > 10 ? 4 : 7
  const barW = Math.max(2, plotW / series.length - barGap)

  const niceMax = maxTotal * 1.15
  const yTicks = 4
  const activeBar = activeIdx !== null ? series[activeIdx] : null

  return (
    <div className="dash-hourchart">
      <svg viewBox={`0 0 ${chartW} ${chartH}`} className="dash-hourchart__svg" role="img" aria-label="Ventas por hora">
        {Array.from({ length: yTicks + 1 }).map((_, i) => {
          const y = padTop + plotH - (plotH / yTicks) * i
          const val = (niceMax / yTicks) * i
          return (
            <g key={i}>
              <line x1={padLeft} x2={chartW - 6} y1={y} y2={y} stroke="var(--dash-border)" strokeWidth="1" />
              <text x={padLeft - 8} y={y + 3} textAnchor="end" className="dash-hourchart__axislabel">
                {fmtCompact(val)}
              </text>
            </g>
          )
        })}

        {series.map((s, i) => {
          const x = padLeft + i * (barW + barGap)
          const isActive = activeIdx === i
          const commonProps = {
            onMouseEnter: () => setHovered(i),
            onMouseLeave: () => setHovered(null),
            onClick: () => setPinned(p => (p === i ? null : i)),
            style: { cursor: 'pointer', opacity: activeIdx !== null && !isActive ? 0.4 : 1, transition: 'opacity 0.15s' },
          }

          if (mode === 'consolidated') {
            let yCursor = padTop + plotH
            return (
              <g key={s.hour} {...commonProps}>
                {/* rect invisible de ancho completo para que el área de toque
                    sea toda la columna, no solo los segmentos con datos */}
                <rect x={x} y={padTop} width={barW} height={plotH} fill="transparent" />
                {s.segments.map((seg, si) => {
                  const h = (seg.income / niceMax) * plotH
                  yCursor -= h
                  return <rect key={si} x={x} y={yCursor} width={barW} height={Math.max(h, 0)} fill={seg.color} />
                })}
                <text x={x + barW / 2} y={chartH - 8} textAnchor="middle" className="dash-hourchart__axislabel">
                  {formatHourShort(s.hour)}
                </text>
              </g>
            )
          }

          const h = (s.total / niceMax) * plotH
          return (
            <g key={s.hour} {...commonProps}>
              <rect x={x} y={padTop} width={barW} height={plotH} fill="transparent" />
              <rect
                x={x} y={padTop + plotH - h} width={barW} height={Math.max(h, 0)}
                fill="var(--dash-accent)" opacity={isActive ? 1 : 0.8} rx="2"
              />
              <text x={x + barW / 2} y={chartH - 8} textAnchor="middle" className="dash-hourchart__axislabel">
                {formatHourShort(s.hour)}
              </text>
            </g>
          )
        })}
      </svg>

      {/* Panel de detalle fijo (no tooltip flotante) — evita cualquier
          problema de recorte/posicionamiento dentro del panel */}
      <div className="dash-hourchart__detail">
        {activeBar ? (
          <>
            <strong>{formatHour(activeBar.hour)}</strong>
            {mode === 'consolidated' ? (
              <div className="dash-hourchart__breakdown">
                {activeBar.segments.filter(seg => seg.income > 0).map(seg => (
                  <span key={seg.branch_name} className="dash-hourchart__chip">
                    <span className="dash-donut__dot" style={{ background: seg.color }} />
                    {seg.branch_name}: {fmt(seg.income)}
                  </span>
                ))}
                <span className="dash-hourchart__chip dash-hourchart__chip--total">
                  Total: {fmt(activeBar.total)}
                </span>
              </div>
            ) : (
              <span className="mono green">{fmt(activeBar.total)}</span>
            )}
          </>
        ) : (
          <span className="dash-hourchart__default">
            Total del período: <strong className="mono">{fmt(grandTotal)}</strong> · toca una barra para ver el detalle por hora
          </span>
        )}
      </div>

      {mode === 'consolidated' && (
        <ul className="dash-hourchart__legend">
          {branchNames.map((name, i) => (
            <li key={name}>
              <span className="dash-donut__dot" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
              {name}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const PaymentDonut = ({ data }) => {
  const [hovered, setHovered] = useState(null)
  // FIX: estado independiente para tap en móvil — el hover no existe en touch,
  // así que un tap "fija" la selección hasta que se toque de nuevo o se toque afuera
  const [selected, setSelected] = useState(null)
  const active = selected !== null ? selected : hovered
  const total = data.reduce((s, d) => s + d.total, 0)

  if (total === 0) {
    return <EmptyState icon="bi-pie-chart" text="Sin pagos registrados en el periodo" />
  }

  const radius = 52
  const strokeWidth = 20
  const circumference = 2 * Math.PI * radius
  let offsetAcc = 0

  const segments = data.map((d, i) => {
    const fraction = d.total / total
    const dash = fraction * circumference
    const offset = offsetAcc
    offsetAcc += dash
    return { ...d, fraction, dash, offset, color: CHART_COLORS[i % CHART_COLORS.length] }
  })

  const activeSegment = active !== null ? segments[active] : null
  // FIX: tap en móvil fija/quita la selección; en desktop el hover sigue funcionando normal
  const toggleSelect = (i) => setSelected(prev => (prev === i ? null : i))

  return (
    <div className="dash-donut">
      <div className="dash-donut__chart-wrap">
        <svg viewBox="0 0 140 140" className="dash-donut__svg" role="img" aria-label="Ventas por método de pago">
          <circle cx="70" cy="70" r={radius} fill="none" stroke="var(--dash-border)" strokeWidth={strokeWidth} />
          {segments.map((seg, i) => (
            <circle
              key={seg.payment_method_id}
              cx="70" cy="70" r={radius}
              fill="none"
              stroke={seg.color}
              strokeWidth={active === i ? strokeWidth + 4 : strokeWidth}
              strokeDasharray={`${seg.dash} ${circumference - seg.dash}`}
              strokeDashoffset={-seg.offset}
              strokeLinecap="round"
              style={{
                transition: 'stroke-width 0.2s, opacity 0.2s',
                opacity: active !== null && active !== i ? 0.4 : 1,
                cursor: 'pointer',
              }}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => toggleSelect(i)}
            />
          ))}
        </svg>
        <div className="dash-donut__center">
          <div className="dash-donut__center-value">
            {activeSegment ? fmtCompact(activeSegment.total) : fmtCompact(total)}
          </div>
          <div className="dash-donut__center-label">
            {activeSegment ? activeSegment.name : 'Total'}
          </div>
        </div>
      </div>

      <ul className="dash-donut__legend">
        {segments.map((seg, i) => (
          <li
            key={seg.payment_method_id}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            onClick={() => toggleSelect(i)}
            className={active === i ? 'dash-donut__legend-item--active' : ''}
            style={{
              opacity: active !== null && active !== i ? 0.5 : 1,
              transition: 'opacity 0.2s',
              cursor: 'pointer',
            }}
          >
            <span className="dash-donut__dot" style={{ background: seg.color, color: seg.color }} />
            <span className="dash-donut__label">{seg.name}</span>
            <span className="dash-donut__pct">{(seg.fraction * 100).toFixed(1)}%</span>
            <span className="dash-donut__amt mono">{fmt(seg.total)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
//  TopProductsTable — FIX: Cantidad antes que SKU
// ═══════════════════════════════════════════════════════════════

const TopProductsTable = ({ products, isLoading, fullMode = false }) => {
  if (isLoading) return <Skeleton rows={fullMode ? 10 : 5} />
  if (products.length === 0) {
    return <EmptyState icon="bi-cart-x" text="Sin ventas registradas en el periodo" />
  }

  // FIX: evita width NaN% cuando todos los productos tienen total_sold en 0
  const maxSold = Math.max(1, ...products.map(p => p.total_sold))

  const rankClass = (i) => {
    if (i === 0) return 'gold'
    if (i === 1) return 'silver'
    if (i === 2) return 'bronze'
    return ''
  }

  return (
    <>
      {/* Vista tabla — solo desktop/tablet (CSS oculta esto <640px) */}
      <div className={`dash-products-desktop ${fullMode ? '' : 'dash-table-wrap'}`}>
        <table className="dash-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Producto</th>
              {/* FIX: Cantidad antes que SKU */}
              <th className="num">Cant.</th>
              <th>SKU</th>
              <th className="num">Ingresos</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p, i) => (
              <tr key={p.product_id}>
                <td className={`rank ${rankClass(i)}`}>{i + 1}</td>
                <td>
                  <div className="dash-product">
                    {/* <div className="dash-product__img-wrap">
                      <img
                        src={`${import.meta.env.VITE_URL_BASE}product/images/${p.image ?? 'sin_imagen.jpg'}`}
                        alt={p.name}
                        className="dash-product__img"
                        loading="lazy"
                        onError={e => { e.target.src = '/placeholder.png' }}
                      />
                      {i < 3 && <span className="dash-product__rank-badge">{i + 1}</span>}
                    </div> */}
                    <div>
                      <span className="dash-product__name">{p.name}</span>
                      <div className="dash-product__bar">
                        <div className="dash-product__bar-fill" style={{ width: `${(p.total_sold / maxSold) * 100}%` }} />
                      </div>
                    </div>
                  </div>
                </td>
                {/* FIX: Cantidad antes que SKU */}
                <td className="num"><span className="dash-badge">{p.total_sold}</span></td>
                <td className="mono">{p.sku}</td>
                <td className="num green">{fmt(p.total_revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* FIX: vista de tarjetas — solo móvil (CSS oculta esto ≥640px).
          Misma estructura que LowStockList (fila simple, nombre en una
          línea, valor fijo a la derecha) en vez del grid anterior que
          crecía mucho de alto con nombres largos */}
      <ul className="dash-products-mobile">
        {products.map((p, i) => (
          <li key={p.product_id} className="dash-product-card">
            {/* <div className="dash-product-card__img-wrap">
              <img
                src={`${import.meta.env.VITE_URL_BASE}product/images/${p.image ?? 'sin_imagen.jpg'}`}
                alt={p.name}
                className="dash-product__img"
                loading="lazy"
                onError={e => { e.target.src = '/placeholder.png' }}
              />
              {i < 3 && <span className="dash-product__rank-badge">{i + 1}</span>}
            </div> */}
            <div className="dash-product-card__info">
              <span className="dash-product-card__name">{p.name}</span>
              <div className="dash-product-card__meta">
                <span className="mono">{p.sku}</span>
                <span>·</span>
                <span>{p.total_sold} vendidos</span>
              </div>
            </div>
            <span className="dash-product-card__amt mono">{fmt(p.total_revenue)}</span>
          </li>
        ))}
      </ul>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════
//  CashRegistersPanel
// ═══════════════════════════════════════════════════════════════

const CashRegistersPanel = ({ cashRegs, isLoading, fullMode = false }) => {
  if (isLoading) return <Skeleton rows={fullMode ? 4 : 2} />
  if (cashRegs.length === 0) {
    return <EmptyState icon="bi-lock" text="No hay cajas abiertas" />
  }

  const totalInCash = cashRegs.reduce((s, cr) => s + (cr.expected_close ?? 0), 0)

  return (
    <>
      <ul className="dash-cr-list">
        {cashRegs.map(cr => (
          <li key={cr.cash_register_id} className="dash-cr-card">
            <div className="dash-cr-card__header">
              <span className="dash-cr-card__name">{cr.register_name}</span>
              <span className="dash-cr-card__user">
                <i className="bi bi-person" />
                {cr.first_name} {cr.last_name}
              </span>
            </div>
            {cr.branch_name && <BranchChip name={cr.branch_name} />}
            <div className="dash-cr-card__row"><span>Apertura</span><span className="mono">{fmt(cr.open_amount)}</span></div>
            <div className="dash-cr-card__row"><span>Ingresos</span><span className="green mono">{fmt(cr.total_in)}</span></div>
            <div className="dash-cr-card__row"><span>Egresos</span><span className="red mono">{fmt(cr.total_out)}</span></div>
            <div className="dash-cr-card__total">
              <span>Saldo estimado</span>
              <span className={`mono ${cr.expected_close >= 0 ? 'green' : 'red'}`}>{fmt(cr.expected_close)}</span>
            </div>
          </li>
        ))}
      </ul>
      {fullMode && (
        <div className="dash-cr-footer">
          <span>Total en cajas</span>
          <strong className="mono">{fmt(totalInCash)}</strong>
        </div>
      )}
    </>
  )
}

// ═══════════════════════════════════════════════════════════════
//  LowStockList — solo la lista, sin wrapper de panel
// ═══════════════════════════════════════════════════════════════

const LowStockList = ({ lowStock }) => {
  if (lowStock.length === 0) return null

  return (
    <ul className="dash-stock-list">
      {lowStock.map(item => (
        <li
          key={`${item.product_id}-${item.branch_id ?? 'x'}-${item.variant_label ?? 'base'}`}
          className="dash-stock-item"
        >
          <div className="dash-stock-item__info">
            <span className="dash-stock-item__name">{item.name}</span>
            <div className="dash-stock-item__meta">
              <span className="mono">{item.sku}</span>
              {item.variant_label && <><span>·</span><span>{item.variant_label}</span></>}
              {item.branch_name && <><span>·</span><BranchChip name={item.branch_name} /></>}
            </div>
          </div>
          <span className={`dash-stock-item__qty ${item.stock === 0 ? 'zero' : ''}`}>{item.stock}</span>
        </li>
      ))}
    </ul>
  )
}

// ═══════════════════════════════════════════════════════════════
//  DashHeader
// ═══════════════════════════════════════════════════════════════

// FIX: controles de filtro extraídos a su propio componente para
// reusarlos tal cual dentro del sheet móvil, sin duplicar JSX
const FilterControls = ({
  preset, handlePreset, customRange, setCustomRange,
  isCentralAdmin, branches, selectedBranchId, setSelectedBranchId,
}) => (
  <>
    {isCentralAdmin && (
      <select
        className="dash-date-input"
        value={selectedBranchId}
        onChange={e => setSelectedBranchId(e.target.value)}
        aria-label="Seleccionar sucursal"
      >
        <option value="">Consolidado (todas)</option>
        {branches.map(b => (
          <option key={b.branch_id} value={b.branch_id}>{b.name}</option>
        ))}
      </select>
    )}

    <div className="dash-preset-group" role="tablist" aria-label="Rango de fechas">
      {[
        { id: 'today', label: 'Hoy' },
        { id: 'week',  label: 'Esta semana' },
        { id: 'month', label: 'Este mes' },
        { id: 'custom', label: 'Personalizado' },
      ].map(p => (
        <button
          key={p.id}
          role="tab"
          aria-selected={preset === p.id}
          className={`dash-preset-btn ${preset === p.id ? 'dash-preset-btn--active' : ''}`}
          onClick={() => handlePreset(p.id)}
        >
          {p.label}
        </button>
      ))}
    </div>

    {preset === 'custom' && (
      <div className="dash-custom-range">
        <input
          type="date"
          className="dash-date-input"
          value={customRange.start}
          max={customRange.end}
          onChange={e => setCustomRange(prev => ({ ...prev, start: e.target.value }))}
          aria-label="Fecha inicial"
        />
        <span>—</span>
        <input
          type="date"
          className="dash-date-input"
          value={customRange.end}
          min={customRange.start}
          max={today()}
          onChange={e => setCustomRange(prev => ({ ...prev, end: e.target.value }))}
          aria-label="Fecha final"
        />
      </div>
    )}
  </>
)

const DashHeader = ({
  preset, setPreset, customRange, setCustomRange,
  isCentralAdmin, branches, selectedBranchId, setSelectedBranchId,
  refetch, isLoading,
}) => {
  const range = getPresetRange(preset, customRange)
  // FIX: sheet de filtros para móvil — controla si está abierto
  const [filtersOpen, setFiltersOpen] = useState(false)

  const label = useMemo(() => {
    if (preset === 'today') {
      return format(new Date(range.start + 'T12:00:00'), "EEEE d 'de' MMMM, yyyy", { locale: es })
    }
    return `${format(new Date(range.start + 'T12:00:00'), 'd MMM', { locale: es })} — ${format(new Date(range.end + 'T12:00:00'), 'd MMM yyyy', { locale: es })}`
  }, [preset, range])

  const handlePreset = useCallback((id) => {
    setPreset(id)
  }, [setPreset])

  // FIX: cuenta filtros "no default" activos, para mostrar el punto
  // indicador en el botón de Filtros móvil
  const activeFilterCount =
    (isCentralAdmin && selectedBranchId ? 1 : 0) + (preset !== 'today' ? 1 : 0)

  const filterProps = {
    preset, handlePreset, customRange, setCustomRange,
    isCentralAdmin, branches, selectedBranchId, setSelectedBranchId,
  }

  return (
    <header className="dash-header">
      <div className="dash-header__left">
        <h1 className="dash-header__title">Dashboard</h1>
        <span className="dash-header__date">{label}</span>
      </div>

      {/* Desktop/tablet: filtros inline (CSS los oculta <640px) */}
      <div className="dash-header__filters dash-header__filters--desktop">
        <FilterControls {...filterProps} />
        <button
          className="dash-refresh-btn dash-tooltip"
          data-tooltip="Actualizar datos"
          onClick={() => refetch()}
          disabled={isLoading}
          aria-label="Actualizar dashboard"
        >
          <i className={`bi bi-arrow-clockwise ${isLoading ? 'spinning' : ''}`} />
        </button>
      </div>

      {/* Móvil: un botón "Filtros" que abre un sheet en vez de amontonar
          selector de sucursal + 4 presets + rango personalizado en el header */}
      <div className="dash-header__filters-mobile">
        <button
          className="dash-filters-trigger"
          onClick={() => setFiltersOpen(true)}
          aria-label="Abrir filtros"
        >
          <i className="bi bi-sliders" />
          Filtros
          {activeFilterCount > 0 && <span className="dash-filters-trigger__dot" />}
        </button>
        <button
          className="dash-refresh-btn"
          onClick={() => refetch()}
          disabled={isLoading}
          aria-label="Actualizar dashboard"
        >
          <i className={`bi bi-arrow-clockwise ${isLoading ? 'spinning' : ''}`} />
        </button>
      </div>

      <Modal
        isOpen={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filtros"
        icon="bi-sliders"
      >
        <div className="dash-filters-sheet">
          <FilterControls {...filterProps} />
        </div>
      </Modal>
    </header>
  )
}

// ═══════════════════════════════════════════════════════════════
//  Componente Principal
// ═══════════════════════════════════════════════════════════════

const Dashboard = () => {
  const { user, isCentralAdmin, hasPermission } = useUser()

  const [preset,       setPreset]       = useState('today')
  const [customRange,  setCustomRange]  = useState({ start: today(), end: today() })
  const [branches,     setBranches]     = useState([])
  const [selectedBranchId, setSelectedBranchId] = useState('')

  // Modales
  const [modalProducts, setModalProducts] = useState(false)
  const [modalCashRegs, setModalCashRegs] = useState(false)
  const [modalLowStock, setModalLowStock] = useState(false)

  // Catálogo de sucursales
  useEffect(() => {
    if (!isCentralAdmin) return
    api.get('branches?is_active=true')
      .then(({ data }) => setBranches(data.data))
      .catch(() => {})
  }, [isCentralAdmin])

  const { start, end } = useMemo(() => getPresetRange(preset, customRange), [preset, customRange])

  const endpoint = useMemo(() => {
    const params = new URLSearchParams({ start_date: start, end_date: end, preset })
    if (isCentralAdmin && selectedBranchId) params.set('branch_id', selectedBranchId)
    return `dashboard?${params.toString()}`
  }, [start, end, preset, isCentralAdmin, selectedBranchId])

  const { data, isLoading, error, refetch } = useApi(endpoint)

  // ── Acceso ──
  if (!hasPermission('dashboard', 'read')) {
    return (
      <div className="dash-root">
        <div className="dash-forbidden">
          <i className="bi bi-lock" />
          <p>Sin acceso al dashboard</p>
        </div>
      </div>
    )
  }

  const kpis             = data?.kpis ?? {}
  const comparison       = kpis.comparison ?? {}
  const comparisonLabel  = comparison.label || 'período anterior'
  const topProducts      = data?.top_products ?? []
  const paymentBreakdown = data?.payment_breakdown ?? []
  const cashRegs         = data?.cash_registers ?? []
  const lowStock         = data?.low_stock ?? []
  const salesByHour      = data?.sales_by_hour ?? []
  const isConsolidated   = data?.mode === 'consolidated'

  return (
    <div className="dash-root">
      <DashHeader
        preset={preset} setPreset={setPreset}
        customRange={customRange} setCustomRange={setCustomRange}
        isCentralAdmin={isCentralAdmin} branches={branches}
        selectedBranchId={selectedBranchId} setSelectedBranchId={setSelectedBranchId}
        refetch={refetch} isLoading={isLoading}
      />

      {error && (
        <div className="dash-error" role="alert">
          <i className="bi bi-exclamation-triangle" />
          {error}
        </div>
      )}

      {isConsolidated && (
        <div className="dash-consolidated-banner">
          <i className="bi bi-diagram-3" />
          <span>Vista consolidada — todas las sucursales activas</span>
        </div>
      )}

      {/* ── KPIs ── */}
      <section className="dash-stats">
        <StatCard
          icon="bi-cart-check"
          label="Total de órdenes"
          value={isLoading ? '—' : (kpis.orders_total ?? 0).toLocaleString('es-MX')}
          comparisonValue={isLoading ? null : comparison.orders_total}
          comparisonLabel={isLoading ? null : comparisonLabel}
          delay={100}
        />
        <StatCard
          icon="bi-boxes"
          label="Productos vendidos"
          value={isLoading ? '—' : (kpis.total_units_sold ?? 0).toLocaleString('es-MX')}
          comparisonValue={isLoading ? null : comparison.total_units_sold}
          comparisonLabel={isLoading ? null : comparisonLabel}
          delay={150}
        />
        <StatCard
          icon="bi-cash-stack"
          label="Total Vendido"
          value={isLoading ? '—' : fmt(kpis.income)}
          comparisonValue={isLoading ? null : comparison.income}
          comparisonLabel={isLoading ? null : comparisonLabel}
          accent
          delay={200}
        />
        <StatCard
          icon="bi-receipt-cutoff"
          label="Ticket promedio"
          value={isLoading ? '—' : fmt(kpis.avg_ticket)}
          comparisonValue={isLoading ? null : comparison.avg_ticket}
          comparisonLabel={isLoading ? null : comparisonLabel}
          delay={250}
        />
      </section>

      {/* ── Cuerpo ── */}
      <div className="dash-body">
        {/* Columna izquierda: Top productos + Stock bajo */}
        <div className="dash-body__left">
          {/* Top productos */}
          <section className="dash-panel" style={{ animationDelay: '0.35s' }}>
            <h2 className="dash-panel__title">
              <i className="bi bi-trophy" />
              Top productos
            </h2>
            <ScrollablePanel
              maxHeight={420}
              itemCount={topProducts.length}
              itemLimit={5}
              onViewAll={() => setModalProducts(true)}
            >
              <TopProductsTable products={topProducts} isLoading={isLoading} />
            </ScrollablePanel>
          </section>

          {/* Ventas por hora */}
          <section className="dash-panel" style={{ animationDelay: '0.4s' }}>
            <h2 className="dash-panel__title">
              <i className="bi bi-bar-chart" />
              Ventas por hora
              {isConsolidated && <span className="dash-panel__subtitle">por sucursal</span>}
            </h2>
            {isLoading
              ? <Skeleton rows={3} />
              : <SalesByHourChart data={salesByHour} mode={isConsolidated ? 'consolidated' : 'branch'} />
            }
          </section>

          {/* Stock bajo — ahora en columna izquierda, sin panel anidado */}
          {lowStock.length > 0 && (
            <section className="dash-panel dash-panel--warning" style={{ animationDelay: '0.5s' }}>
              <h2 className="dash-panel__title">
                <i className="bi bi-exclamation-triangle" />
                Stock bajo
                <span className="dash-badge dash-badge--warn">{lowStock.length}</span>
              </h2>
              <ScrollablePanel
                maxHeight={280}
                itemCount={lowStock.length}
                itemLimit={3}
                onViewAll={() => setModalLowStock(true)}
              >
                <LowStockList lowStock={lowStock} />
              </ScrollablePanel>
            </section>
          )}
        </div>

        {/* Columna derecha: Cajas + Donut */}
        <div className="dash-side">
          {/* Cajas abiertas */}
          <section className="dash-panel" style={{ animationDelay: '0.4s' }}>
            <h2 className="dash-panel__title">
              <i className="bi bi-pc-display-horizontal" />
              Cajas abiertas
            </h2>
            <ScrollablePanel
              maxHeight={340}
              itemCount={cashRegs.length}
              itemLimit={2}
              onViewAll={() => setModalCashRegs(true)}
            >
              <CashRegistersPanel cashRegs={cashRegs} isLoading={isLoading} />
            </ScrollablePanel>
          </section>

          {/* Ventas por método de pago */}
          <section className="dash-panel" style={{ animationDelay: '0.45s' }}>
            <h2 className="dash-panel__title">
              <i className="bi bi-pie-chart" />
              Ventas por método de pago
            </h2>
            {isLoading
              ? <Skeleton rows={3} />
              : <PaymentDonut data={paymentBreakdown} />
            }
          </section>
        </div>
      </div>

      {/* ── Modales de vista completa ── */}
      <Modal
        isOpen={modalProducts}
        onClose={() => setModalProducts(false)}
        title="Top productos — Vista completa"
        icon="bi-trophy"
      >
        <TopProductsTable products={topProducts} isLoading={isLoading} fullMode />
      </Modal>

      <Modal
        isOpen={modalCashRegs}
        onClose={() => setModalCashRegs(false)}
        title="Cajas abiertas — Vista completa"
        icon="bi-pc-display-horizontal"
      >
        <CashRegistersPanel cashRegs={cashRegs} isLoading={isLoading} fullMode />
      </Modal>

      <Modal
        isOpen={modalLowStock}
        onClose={() => setModalLowStock(false)}
        title="Stock bajo — Vista completa"
        icon="bi-exclamation-triangle"
      >
        <section className="dash-panel dash-panel--warning" style={{ margin: 0 }}>
          <h2 className="dash-panel__title">
            <i className="bi bi-exclamation-triangle" />
            Stock bajo
            <span className="dash-badge dash-badge--warn">{lowStock.length}</span>
          </h2>
          <LowStockList lowStock={lowStock} />
        </section>
      </Modal>
    </div>
  )
}

export default Dashboard