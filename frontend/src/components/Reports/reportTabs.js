// src/components/Reports/reportTabs.js
// Pestañas del módulo de Reportes y el permiso que pide cada una. El menú
// muestra Reportes si el usuario puede ver al menos una, y el módulo abre en
// la primera que puede ver (specs/04-reporte-ventas-y-utilidad.md,
// requisitos 4–6). Cada reporte nuevo agrega aquí su pestaña y su permiso.
export const REPORT_TABS = [
  { id: 'cash-sessions', icon: 'bi-cash-stack', label: 'Sesiones de caja',  perm: ['reports', 'basic']  },
  { id: 'profit',        icon: 'bi-graph-up',   label: 'Ventas y utilidad', perm: ['reports', 'profit'] },
  { id: 'trend',         icon: 'bi-activity',   label: 'Tendencia de ventas', perm: ['reports', 'trend'] },
  { id: 'inventory',     icon: 'bi-box-seam',   label: 'Valuación de inventario', perm: ['reports', 'inventory'] },
  { id: 'rotation',      icon: 'bi-arrow-repeat', label: 'Rotación de inventario', perm: ['reports', 'rotation'] },
]

// hasPermission: el de useUser()
export const getVisibleReportTabs = (hasPermission) =>
  REPORT_TABS.filter(tab => hasPermission(...tab.perm))
