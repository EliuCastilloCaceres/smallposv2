// src/components/Users/modals/TempPassModal.jsx
import { useState } from 'react'

const TempPassModal = ({ username, password, onClose }) => {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(password)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback para dispositivos sin clipboard API
      const el = document.createElement('textarea')
      el.value = password
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="usr-overlay">
      <div className="usr-modal usr-modal--sm">
        <div className="usr-modal__header">
          <h3 className="usr-modal__title">
            <i className="bi bi-key" />
            Contraseña temporal
          </h3>
        </div>

        <div className="usr-modal__body">
          <div className="usr-temppass__info">
            <i className="bi bi-info-circle" />
            <p>
              El usuario <strong>@{username}</strong> fue creado sin contraseña.
              Comparte esta contraseña temporal — <strong>no volverá a mostrarse</strong>.
            </p>
          </div>

          <div className="usr-temppass__box">
            <span className="usr-temppass__value">{password}</span>
            <button
              className={`usr-btn ${copied ? 'usr-btn--success' : 'usr-btn--ghost'}`}
              onClick={handleCopy}
            >
              <i className={`bi ${copied ? 'bi-check-lg' : 'bi-clipboard'}`} />
              <span>{copied ? '¡Copiado!' : 'Copiar'}</span>
            </button>
          </div>

          <div className="usr-modal__footer">
            <button className="usr-btn usr-btn--primary" onClick={onClose}>
              Entendido
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default TempPassModal
