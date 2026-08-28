// src/components/Settings/Settings.jsx
import { useState } from 'react'
import { useUser } from '../../context/UserContext'
import BranchesTab   from './tabs/BranchesTab'
import ReceiptTab    from './tabs/ReceiptTab'
import CashTab       from './tabs/CashTab'
import CategoriesTab from './tabs/CategoriesTab'
import RolesTab      from './tabs/RolesTab'
import PaymentMethodsTab from './tabs/PaymentMethodsTab'
import './settings.css'

const Settings = () => {
  // FIX: antes se leía `isAdmin` (basado en role_name) y se pasaba a los
  // tabs bajo el nombre `isAdmin`, pero TODOS los tabs desestructuran
  // `isCentralAdmin` (basado en branch_id === null) — el prop nunca
  // llegaba, así que `isCentralAdmin` era `undefined` en cada tab. Esto
  // rompía silenciosamente los botones de crear/editar/activar en
  // BranchesTab, CashTab, CategoriesTab y PaymentMethodsTab, y el
  // selector de sucursal en CashTab/ReceiptTab nunca se cargaba para el
  // admin central. Ahora se trae isCentralAdmin del contexto y se pasa
  // con el nombre correcto.
  const { user, isAdmin, isCentralAdmin, hasPermission } = useUser()

  const tabs = [
    { id: 'branches',        icon: 'bi-building',    label: 'Sucursales',      show: true },
    { id: 'receipt',         icon: 'bi-receipt',     label: 'Recibo',          show: hasPermission('settings', 'read') },
    { id: 'cash',            icon: 'bi-cash-stack',  label: 'Cajas',           show: hasPermission('settings', 'read') },
    { id: 'category',        icon: 'bi-bookmark',    label: 'Categorías',      show: hasPermission('settings', 'read') },
    { id: 'roles',           icon: 'bi-shield-lock', label: 'Roles',           show: hasPermission('settings', 'read') },
    { id: 'payment-methods', icon: 'bi-credit-card', label: 'Métodos de pago', show: hasPermission('settings', 'read') },  // ← nuevo, solo admin
  ].filter(t => t.show)

  const [activeTab, setActiveTab] = useState(tabs[0]?.id)

  return (
    <div className="set-root">
      <div className="set-header">
        <div>
          <h1 className="set-header__title">Configuración</h1>
          <span className="set-header__sub">
            {isAdmin ? 'Administración central del sistema' : `Sucursal: ${user?.branch_id ?? '—'}`}
          </span>
        </div>
      </div>

      <div className="set-tabs" role="tablist">
        {tabs
          .map(tab => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              className={`set-tab ${activeTab === tab.id ? 'set-tab--active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <i className={`bi ${tab.icon}`} />
              <span>{tab.label}</span>
            </button>
          ))}
      </div>

      <div className="set-content">
        {activeTab === 'branches'  && <BranchesTab   isCentralAdmin={isCentralAdmin} branchId={user?.branch_id} />}
        {activeTab === 'receipt'   && <ReceiptTab     isCentralAdmin={isCentralAdmin} branchId={user?.branch_id} />}
        {activeTab === 'cash'      && <CashTab        isCentralAdmin={isCentralAdmin} branchId={user?.branch_id} />}
        {activeTab === 'category'  && <CategoriesTab  isCentralAdmin={isCentralAdmin} branchId={user?.branch_id} />}
        {activeTab === 'roles' && <RolesTab isCentralAdmin={isCentralAdmin} branchId={user?.branch_id} />}
        {activeTab === 'payment-methods' && <PaymentMethodsTab isCentralAdmin={isCentralAdmin} />}
      </div>
    </div>
  )
}

export default Settings