// src/components/Reports/reportTabs.js
// Pestañas del módulo de Reportes y el permiso que pide cada una. El menú
// muestra Reportes si el usuario puede ver al menos una, y el módulo abre en
// la primera que puede ver (specs/04-reporte-ventas-y-utilidad.md,
// requisitos 4–6). Cada reporte nuevo agrega aquí su pestaña y su permiso.
export const REPORT_TABS = [
  { id: 'cash-sessions', icon: 'bi-cash-stack', label: 'Sesiones de caja',  perm: ['reports', 'basic']  },
  { id: 'profit',        icon: 'bi-graph-up',   label: 'Ventas y utilidad', perm: ['reports', 'profit'] },
]

// hasPermission: el de useUser()
export const getVisibleReportTabs = (hasPermission) =>
  REPORT_TABS.filter(tab => hasPermission(...tab.perm))
