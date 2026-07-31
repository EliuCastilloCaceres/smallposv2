// src/components/Inventory/modals/BulkAdjustModal.jsx
import { useState, useRef } from 'react'
import api from '../../../services/api'
import { useBranch } from '../../../context/BranchContext'
const Papa = window.Papa ?? null
const STEPS = { MODE: 'mode', CSV: 'csv', TABLE: 'table', PREVIEW: 'preview', RESULT: 'result' }

const REASONS = [
  'Conteo físico', 'Merma', 'Producto dañado',
  'Error de registro', 'Compra a proveedor', 'Otro',
]

const BulkAdjustModal = ({ onDone, onClose }) => {
  const {selectedBranch} = useBranch();
  const [step,     setStep]     = useState(STEPS.MODE)
  const [reason,   setReason]   = useState(REASONS[0])
  const [isSaving, setIsSaving] = useState(false)
  const [error,    setError]    = useState(null)
  const [result,   setResult]   = useState(null)

  // CSV flow
  const [csvRows,    setCsvRows]    = useState([])
  const [csvHeaders, setCsvHeaders] = useState([])
  const [fileName,   setFileName]   = useState('')
  const fileRef = useRef(null)

  // Table flow
  const [tableItems, setTableItems] = useState([{ sku: '', quantity_new: '' }])

  // ── Descargar plantilla ──
  const handleDownloadTemplate = async () => {
    try {
      const res = await api.get('inventory/adjustments/bulk/template', { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }))
      const a   = document.createElement('a')
      a.href = url; a.download = 'ajuste_inventario.csv'; a.click()
      URL.revokeObjectURL(url)
    } catch { setError('No se pudo descargar la plantilla') }
  }

  // ── Parsear CSV ──
  const handleFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.name.endsWith('.csv')) { setError('Solo se aceptan archivos .csv'); return }
    setFileName(file.name); setError(null)
    const reader = new FileReader()
    reader.onload = ({ target }) => {
      if (!Papa) { setError('Librería papaparse no disponible'); return }
      const lines  = target.result.split('\n').filter(l => !l.startsWith('#')).join('\n')
      const parsed = Papa.parse(lines, {
        header: true, skipEmptyLines: true,
        transformHeader: h => h.trim().toLowerCase(),
      })
      if (parsed.errors.length > 0) { setError(`Error al leer CSV: ${parsed.errors[0].message}`); return }
      if (parsed.data.length === 0) { setError('El archivo no contiene filas de datos'); return }
      if (parsed.data.length > 500) { setError('El archivo supera el límite de 500 items'); return }
      setCsvHeaders(parsed.meta.fields ?? [])
      setCsvRows(parsed.data)
      setStep(STEPS.PREVIEW)
    }
    reader.readAsText(file, 'UTF-8')
  }

  // ── Tabla editable ──
  const addTableRow = () => setTableItems(prev => [...prev, { sku: '', quantity_new: '' }])
  const removeTableRow = (idx) => setTableItems(prev => prev.filter((_, i) => i !== idx))
  const updateTableRow = (idx, field, val) =>
    setTableItems(prev => prev.map((r, i) => i === idx ? { ...r, [field]: val } : r))

  // ── Enviar al backend ──
  const handleSubmit = async (items) => {
    if(!selectedBranch.branch_id) return
    if (!reason) { setError('El motivo es requerido'); return }
    setIsSaving(true); setError(null)
    try {
      const { data } = await api.post(`inventory/adjustments/bulk?branch_id=${selectedBranch.branch_id}`, { items, reason })
      setResult(data.data)
      setStep(STEPS.RESULT)
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al procesar el ajuste')
    } finally {
      setIsSaving(false)
    }
  }

  const handleReset = () => {
    setStep(STEPS.MODE); setCsvRows([]); setCsvHeaders([])
    setFileName(''); setResult(null); setError(null)
    setTableItems([{ sku: '', quantity_new: '' }])
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="inv-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="inv-modal inv-modal--lg">
        <div className="inv-modal__header">
          <h3 className="inv-modal__title">
            <i className="bi bi-clipboard2-check" />Ajuste masivo de inventario
          </h3>
          <button className="inv-modal__close" onClick={onClose} aria-label="Cerrar">
            <i className="bi bi-x-lg" />
          </button>
        </div>

        <div className="inv-modal__body">
          {error && (
            <div className="inv-alert">
              <i className="bi bi-exclamation-circle" /><span>{error}</span>
              <button onClick={() => setError(null)}><i className="bi bi-x" /></button>
            </div>
          )}

          {/* ── Paso 0: Elegir modo ── */}
          {step === STEPS.MODE && (
            <div className="inv-bulk-modes">
              <p className="inv-muted" style={{ textAlign: 'center', marginBottom: '8px' }}>
                ¿Cómo quieres ingresar los datos del ajuste?
              </p>
              <div className="inv-bulk-mode-grid">
                <button className="inv-bulk-mode-card" onClick={() => setStep(STEPS.CSV)}>
                  <i className="bi bi-file-earmark-spreadsheet" />
                  <span className="inv-bulk-mode-card__title">Subir CSV</span>
                  <span className="inv-muted">Ideal para +20 productos</span>
                </button>
                <button className="inv-bulk-mode-card" onClick={() => setStep(STEPS.TABLE)}>
                  <i className="bi bi-table" />
                  <span className="inv-bulk-mode-card__title">Tabla editable</span>
                  <span className="inv-muted">Ideal para conteos rápidos</span>
                </button>
              </div>
            </div>
          )}

          {/* ── Paso CSV ── */}
          {step === STEPS.CSV && (
            <div className="inv-bulk-upload">
              <div className="inv-bulk-upload__tip">
                <i className="bi bi-info-circle" />
                <p>Descarga la plantilla, llena la columna <strong>quantity_new</strong> con el stock final que debe quedar en cada producto y sube el archivo.</p>
              </div>
              <button className="inv-btn inv-btn--ghost" onClick={handleDownloadTemplate}>
                <i className="bi bi-download" /><span>Descargar plantilla CSV</span>
              </button>
              <label className="inv-bulk-upload__dropzone">
                <input ref={fileRef} type="file" accept=".csv"
                  style={{ display: 'none' }} onChange={handleFile} />
                <i className="bi bi-file-earmark-spreadsheet" />
                <span className="inv-bulk-upload__dropzone-title">
                  {fileName || 'Haz clic o arrastra tu archivo CSV aquí'}
                </span>
                <span className="inv-muted">Solo .csv · Máx. 500 filas</span>
              </label>
            </div>
          )}

          {/* ── Paso tabla editable ── */}
          {step === STEPS.TABLE && (
            <div className="inv-bulk-table-editor">
              <p className="inv-muted" style={{ fontSize: '13px', marginBottom: '4px' }}>
                Ingresa el SKU del producto y el stock final que debe quedar.
              </p>
              <div className="inv-bulk-editor-head">
                <span>SKU del producto</span>
                <span>Stock final (quantity_new)</span>
                <span />
              </div>
              {tableItems.map((row, idx) => (
                <div key={idx} className="inv-bulk-editor-row">
                  <input className="inv-field__input"
                    value={row.sku}
                    onChange={e => updateTableRow(idx, 'sku', e.target.value)}
                    placeholder="PLY-001" />
                  <input className="inv-field__input" type="number" min="0"
                    value={row.quantity_new}
                    onChange={e => updateTableRow(idx, 'quantity_new', e.target.value)}
                    placeholder="0" />
                  <button type="button" className="inv-action-btn inv-action-btn--danger"
                    onClick={() => removeTableRow(idx)}
                    disabled={tableItems.length === 1}>
                    <i className="bi bi-trash" />
                  </button>
                </div>
              ))}
              <button type="button" className="inv-btn inv-btn--ghost"
                onClick={addTableRow} style={{ alignSelf: 'flex-start' }}>
                <i className="bi bi-plus-lg" /><span>Agregar fila</span>
              </button>
            </div>
          )}

          {/* ── Preview CSV ── */}
          {step === STEPS.PREVIEW && (
            <div className="inv-bulk-preview">
              <div className="inv-bulk-preview__info">
                <span><strong>{csvRows.length}</strong> items en <strong>{fileName}</strong></span>
                <button className="inv-muted" style={{ all: 'unset', cursor: 'pointer', fontSize: '12px' }}
                  onClick={handleReset}>
                  <i className="bi bi-arrow-left" /> Cambiar archivo
                </button>
              </div>
              <div className="inv-bulk-preview__table-wrap">
                <table className="inv-bulk-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      {csvHeaders.map(h => <th key={h}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {csvRows.slice(0, 5).map((row, i) => (
                      <tr key={i}>
                        <td className="inv-muted">{i + 2}</td>
                        {csvHeaders.map(h => <td key={h}>{row[h] ?? '—'}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {csvRows.length > 5 && (
                <p className="inv-muted" style={{ textAlign: 'center', fontSize: '12px' }}>
                  Mostrando 5 de {csvRows.length} filas
                </p>
              )}
            </div>
          )}

          {/* ── Resultado ── */}
          {step === STEPS.RESULT && result && (
            <div className="inv-bulk-result">
              <div className="inv-bulk-result__summary">
                <div className="inv-bulk-result__stat inv-bulk-result__stat--ok">
                  <span className="inv-bulk-result__stat-val">{result.adjusted}</span>
                  <span>Ajustados</span>
                </div>
                <div className="inv-bulk-result__stat inv-bulk-result__stat--muted">
                  <span className="inv-bulk-result__stat-val">{result.skipped}</span>
                  <span>Sin cambio</span>
                </div>
                <div className={`inv-bulk-result__stat ${result.failed > 0 ? 'inv-bulk-result__stat--err' : 'inv-bulk-result__stat--muted'}`}>
                  <span className="inv-bulk-result__stat-val">{result.failed}</span>
                  <span>Con error</span>
                </div>
              </div>
              {result.failed_detail?.length > 0 && (
                <div className="inv-bulk-errors">
                  <span className="inv-form-section__label">Filas con error</span>
                  {result.failed_detail.map((f, i) => (
                    <div key={i} className="inv-bulk-error-row">
                      <span className="inv-muted">Fila {f.row}</span>
                      <span>{f.sku ?? f.product_id ?? '—'}</span>
                      <span className="inv-red">{f.reason}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Motivo (siempre visible excepto en selector de modo y resultado) ── */}
          {![STEPS.MODE, STEPS.RESULT].includes(step) && (
            <div className="inv-field">
              <label className="inv-field__label">
                Motivo del ajuste <span className="inv-field__req">*</span>
              </label>
              <select className="inv-field__input inv-field__select"
                value={reason} onChange={e => setReason(e.target.value)}>
                {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          )}

          {/* ── Footer ── */}
          <div className="inv-modal__footer">
            {step === STEPS.MODE && (
              <button className="inv-btn inv-btn--ghost" onClick={onClose}>Cancelar</button>
            )}
            {step === STEPS.CSV && (
              <button className="inv-btn inv-btn--ghost" onClick={handleReset}>
                <i className="bi bi-arrow-left" /> Atrás
              </button>
            )}
            {step === STEPS.TABLE && (
              <>
                <button className="inv-btn inv-btn--ghost" onClick={handleReset}>
                  <i className="bi bi-arrow-left" /> Atrás
                </button>
                <button className="inv-btn inv-btn--primary"
                  onClick={() => handleSubmit(tableItems.filter(r => r.sku.trim()))}
                  disabled={isSaving || !tableItems.some(r => r.sku.trim())}>
                  {isSaving
                    ? <><span className="inv-spinner inv-spinner--white" /> Aplicando...</>
                    : <><i className="bi bi-check-lg" /> Aplicar ajuste</>
                  }
                </button>
              </>
            )}
            {step === STEPS.PREVIEW && (
              <>
                <button className="inv-btn inv-btn--ghost" onClick={handleReset}>
                  <i className="bi bi-arrow-left" /> Atrás
                </button>
                <button className="inv-btn inv-btn--primary"
                  onClick={() => handleSubmit(csvRows)} disabled={isSaving}>
                  {isSaving
                    ? <><span className="inv-spinner inv-spinner--white" /> Aplicando...</>
                    : <><i className="bi bi-check-lg" /> Aplicar {csvRows.length} ajustes</>
                  }
                </button>
              </>
            )}
            {step === STEPS.RESULT && (
              <>
                {result?.failed > 0 && (
                  <button className="inv-btn inv-btn--ghost" onClick={handleReset}>
                    <i className="bi bi-arrow-repeat" /> Nuevo ajuste
                  </button>
                )}
                <button className="inv-btn inv-btn--primary" onClick={onDone}>
                  <i className="bi bi-check-lg" /> Finalizar
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default BulkAdjustModal