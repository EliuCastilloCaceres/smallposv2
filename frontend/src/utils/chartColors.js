// src/utils/chartColors.js
// Paleta de las gráficas: pagos y ventas por hora del Dashboard, y series de
// la Tendencia de ventas. Extraída de Dashboard.jsx para que las dos
// pantallas usen los mismos colores (specs/05-tendencia-de-ventas.md,
// requisito 23). Se repite en ciclo cuando hay más series que colores.
export const CHART_COLORS = [
  '#4f8ef7', '#10b981', '#f59e0b', '#8b5cf6',
  '#ef4444', '#0891b2', '#db2777', '#65a30d',
]

export const chartColor = (index) => CHART_COLORS[index % CHART_COLORS.length]
