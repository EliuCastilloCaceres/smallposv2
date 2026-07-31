// src/components/Settings/Settings.jsx
import { useState } from 'react'
import { useUser } from '../../Context/UserContext'
import BranchesTab   from './tabs/BranchesTab'
import ReceiptTab    from './tabs/ReceiptTab'
import CashTab       from './tabs/CashTab'
import CategoriesTab from './tabs/CategoriesTab'
import RolesTab      from './tabs/RolesTab'
import PaymentMethodsTab from './tabs/PaymentMethodsTab'
import './settings.css'

const Settings = () => {
  const { user, isAdmin, hasPermission } = useUser()

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
          /* Filtramos los tabs: mostramos todos excepto el de 'roles' cuando no es admin */
          .filter(tab => tab.id !== 'roles' || isAdmin)
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
        {activeTab === 'branches'  && <BranchesTab   isAdmin={isAdmin} />}
        {activeTab === 'receipt'   && <ReceiptTab     isAdmin={isAdmin} branchId={user?.branch_id} />}
        {activeTab === 'cash'      && <CashTab        isAdmin={isAdmin} branchId={user?.branch_id} />}
        {activeTab === 'category'  && <CategoriesTab  isAdmin={isAdmin} branchId={user?.branch_id} />}
        {activeTab === 'roles' && isAdmin    && <RolesTab       isAdmin={isAdmin} />}
        {activeTab === 'payment-methods' && isAdmin && <PaymentMethodsTab isAdmin={isAdmin} />}
      </div>
    </div>
  )
}

export default Settings