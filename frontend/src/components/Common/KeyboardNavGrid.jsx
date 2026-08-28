// src/components/common/KeyboardNavGrid.jsx
// Grid de opciones navegable con flechas del teclado (patrón "roving
// tabindex"). Extraído del selector de método de pago de PaymentModal para
// reutilizarlo en cualquier grid de tarjetas/botones seleccionables
// (métodos de pago, variantes de producto, etc).
//
// Detecta las columnas reales del grid MIDIENDO la posición de los items en
// el DOM (comparando `offsetTop`), en vez de recibir un número fijo — así
// funciona igual con grids de columnas fijas (`repeat(2, 1fr)`) que con
// grids responsivos (`repeat(auto-fill, minmax(...))`) donde la cantidad de
// columnas cambia según el ancho disponible. Si por lo que sea el layout no
// se presta para esa detección, se puede forzar pasando `columns`.
//
// Soporta dos modos de manejo del índice activo:
//   - No controlado (default): el componente guarda su propio estado. Útil
//     cuando el grid vive solo mientras el modal está abierto y no hace
//     falta recordar la selección más allá de eso (ej. VariantPickerModal).
//   - Controlado: pasando `activeIndex` + `onActiveIndexChange`, el padre
//     es dueño del estado. Útil cuando la selección debe sobrevivir a que
//     el grid se desmonte y remonte (ej. PaymentModal, donde el panel de
//     efectivo reemplaza temporalmente el grid de métodos).
//
// Uso básico:
//   const gridApi = useRef(null)
//
//   <KeyboardNavGrid
//     ref={gridApi}
//     items={variants}
//     getKey={v => v.variant_id}
//     onSelect={v => onPick(v)}
//     className="pos-variant-grid"
//   >
//     {(item, i, { isActive, itemProps }) => (
//       <button
//         className={`pos-variant-card ${isActive ? 'pos-variant-card--active' : ''}`}
//         {...itemProps}
//       >
//         {item.label}
//       </button>
//     )}
//   </KeyboardNavGrid>
//
// `itemProps` trae `data-knav-item`, `tabIndex`, `onFocus` y `onClick` —
// hay que pasarlos al elemento que realmente se enfoca (normalmente un
// <button>). El resto del markup/clases queda 100% a cargo de quien lo usa.
//
// Métodos imperativos vía ref: `gridApi.current.focusActive()` para
// recuperar el foco del grid desde fuera (por ejemplo al volver de un
// sub-paso, como el panel de efectivo en PaymentModal).

import { forwardRef, useImperativeHandle, useEffect, useRef, useState, useCallback, Fragment } from 'react'

const KeyboardNavGrid = forwardRef(function KeyboardNavGrid(
  {
    items,
    getKey = (_item, i) => i,
    onSelect,
    children,
    className,
    disabled = false,
    columns,
    activeIndex: controlledIndex,
    onActiveIndexChange,
    autoFocus = true,
  },
  ref
) {
  const gridRef = useRef(null)
  const isControlled = controlledIndex != null
  const [innerIndex, setInnerIndex] = useState(0)
  const activeIndex = isControlled ? controlledIndex : innerIndex

  const clamp = useCallback(
    (i) => Math.max(0, Math.min(i, Math.max(items.length - 1, 0))),
    [items.length]
  )

  const setActiveIndex = useCallback((updater) => {
    setInnerIndex((prev) => {
      const base = isControlled ? controlledIndex : prev
      const next = clamp(typeof updater === 'function' ? updater(base) : updater)
      if (isControlled) onActiveIndexChange?.(next)
      return next
    })
  }, [isControlled, controlledIndex, onActiveIndexChange, clamp])

  // Si la lista de items cambia de tamaño (ej. se filtran variantes), evita
  // quedar apuntando a un índice fuera de rango.
  useEffect(() => {
    setActiveIndex((i) => clamp(i))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length])

  const focusActive = useCallback((index) => {
    const btns = gridRef.current?.querySelectorAll('[data-knav-item]')
    const target = index ?? activeIndex
    btns?.[target]?.focus()
  }, [activeIndex])

  useImperativeHandle(ref, () => ({
    focusActive,
    setActiveIndex,
    activeIndex,
  }), [focusActive, setActiveIndex, activeIndex])

  // Sincroniza el foco del DOM cada vez que cambia el índice activo
  // (navegación por flechas, click, o setActiveIndex desde afuera).
  useEffect(() => {
    if (disabled) return
    focusActive(activeIndex)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, disabled])

  // Foco inicial al montar.
  useEffect(() => {
    if (!autoFocus || disabled) return
    focusActive(activeIndex)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Cuenta cuántos items caben por fila comparando offsetTop: los que
  // comparten fila tienen el mismo offsetTop. Se recalcula en cada
  // keydown porque un grid responsivo puede cambiar de columnas si la
  // ventana se redimensiona entre una navegación y otra.
  const getColumnCount = useCallback(() => {
    if (columns) return columns
    const btns = gridRef.current?.querySelectorAll('[data-knav-item]')
    if (!btns || btns.length < 2) return 1
    const firstTop = btns[0].offsetTop
    let cols = 1
    for (let i = 1; i < btns.length; i++) {
      if (btns[i].offsetTop !== firstTop) break
      cols++
    }
    return cols
  }, [columns])

  const handleKeyDown = useCallback((e) => {
    if (disabled || items.length === 0) return
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      setActiveIndex((i) => i + 1)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      setActiveIndex((i) => i - 1)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => i + getColumnCount())
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => i - getColumnCount())
    } else if (e.key === 'Enter') {
      e.preventDefault()
      onSelect?.(items[activeIndex], activeIndex)
    }
  }, [disabled, items, activeIndex, getColumnCount, onSelect, setActiveIndex])

  return (
    <div className={className} ref={gridRef} onKeyDown={handleKeyDown}>
      {items.map((item, i) => {
        const isActive = i === activeIndex
        const itemProps = {
          'data-knav-item': '',
          tabIndex: isActive ? 0 : -1,
          onFocus: () => setActiveIndex(i),
          onClick: () => { setActiveIndex(i); onSelect?.(item, i) },
        }
        return (
          <Fragment key={getKey(item, i)}>
            {children(item, i, { isActive, itemProps })}
          </Fragment>
        )
      })}
    </div>
  )
})

export default KeyboardNavGrid
