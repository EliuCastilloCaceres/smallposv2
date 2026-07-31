// src/components/Products/modals/BulkUploadModal.jsx
import { useState, useRef } from 'react'
import api from '../../../services/api'
import Papa from 'papaparse'

const STEPS = { UPLOAD: 'upload', PREVIEW: 'preview', RESULT: 'result' }

const BulkUploadModal = ({ onDone, onClose }) => {
  const [step,     setStep]     = useState(STEPS.UPLOAD)
  const [rows,     setRows]     = useState([])
  const [headers,  setHeaders]  = useState([])
  const [fileName, setFileName] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [result,   setResult]   = useState(null)
  const [error,    setError]    = useState(null)
  const fileRef = useRef(null)

  // ── Descargar plantilla ──
  const handleDownloadTemplate = async () => {
    try {
      const res = await api.get('products/bulk/template', { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }))
      const a   = document.createElement('a')
      a.href = url; a.download = 'plantilla_productos.csv'; a.click()
      URL.revokeObjectURL(url)
    } catch {
      setError('No se pudo descargar la plantilla')
    }
  }

  // ── Parsear CSV ──
  const handleFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.name.endsWith('.csv')) {
      setError('Solo se aceptan archivos .csv')
      return
    }
    setFileName(file.name)
    setError(null)

    const reader = new FileReader()
    reader.onload = ({ target }) => {
      // Quitar BOM si está presente
      const text = target.result.replace(/^\uFEFF/, '')

      // Parseamos SIN asumir encabezado todavía — dejamos que Papa detecte
      // el delimitador y decodifique comillas de escape correctamente, y
      // filtramos las líneas de comentario ('#') sobre los datos YA
      // decodificados. Hacerlo con split/startsWith sobre texto crudo se
      // rompe en cuanto el archivo pasa por Excel (comillas, tabs, etc.)
      const raw = Papa.parse(text, { skipEmptyLines: true })
      if (raw.errors.length > 0) {
        setError(`Error al leer el CSV: ${raw.errors[0].message}`)
        return
      }

      const dataRows = raw.data.filter(row => !String(row[0] ?? '').trim().startsWith('#'))
      if (dataRows.length < 2) {
        setError('El archivo no contiene filas de datos')
        return
      }

      const headerRow = dataRows[0].map(h => String(h).trim().toLowerCase())
      const bodyRows  = dataRows.slice(1)

      if (bodyRows.length > 500) {
        setError('El archivo supera el límite de 500 filas por lote')
        return
      }

      const parsedRows = bodyRows.map(cells => {
        const obj = {}
        headerRow.forEach((h, i) => { obj[h] = cells[i] ?? '' })
        return obj
      })

      setHeaders(headerRow)
      setRows(parsedRows)
      setStep(STEPS.PREVIEW)
    }
    reader.readAsText(file, 'UTF-8')
  }

  // ── Enviar al backend ──
  const handleUpload = async () => {
    setIsSaving(true)
    setError(null)
    try {
      const { data } = await api.post('products/bulk', { products: rows })
      setResult(data.data)
      setStep(STEPS.RESULT)
    } catch (err) {
      setError(err.response?.data?.message ?? 'Error al procesar el archivo')
    } finally {
      setIsSaving(false)
    }
  }

  const handleReset = () => {
    setStep(STEPS.UPLOAD)
    setRows([]); setHeaders([]); setFileName('')
    setResult(null); setError(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="prd-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="prd-modal prd-modal--lg">
        <div className="prd-modal__header">
          <h3 className="prd-modal__title">
            <i className="bi bi-upload" />Importar productos CSV
          </h3>
          <button className="prd-modal__close" onClick={onClose} aria-label="Cerrar">
            <i className="bi bi-x-lg" />
          </button>
        </div>

        <div className="prd-modal__body">
          {/* ── Indicador de pasos ── */}
          <div className="prd-steps">
            {[
              { key: STEPS.UPLOAD,  label: 'Subir archivo' },
              { key: STEPS.PREVIEW, label: 'Revisar datos' },
              { key: STEPS.RESULT,  label: 'Resultado'     },
            ].map((s, i) => (
              <div key={s.key} className={`prd-step ${step === s.key ? 'prd-step--active' : ''} ${
                (step === STEPS.PREVIEW && i === 0) ||
                (step === STEPS.RESULT  && i <= 1) ? 'prd-step--done' : ''
              }`}>
                <span className="prd-step__num">{i + 1}</span>
                <span className="prd-step__label">{s.label}</span>
              </div>
            ))}
          </div>

          {error && (
            <div className="prd-alert">
              <i className="bi bi-exclamation-circle" />
              <span>{error}</span>
              <button onClick={() => setError(null)}><i className="bi bi-x" /></button>
            </div>
          )}

          {/* ── Paso 1: Subir ── */}
          {step === STEPS.UPLOAD && (
            <div className="prd-bulk-upload">
              <div className="prd-bulk-upload__tip">
                <i className="bi bi-info-circle" />
                <p>
                  Descarga la plantilla CSV, llénala con tus productos y súbela aquí.
                  Límite: <strong>500 productos</strong> por lote.
                </p>
              </div>

              <button className="prd-btn prd-btn--ghost prd-bulk-upload__template"
                onClick={handleDownloadTemplate}>
                <i className="bi bi-download" />
                <span>Descargar plantilla CSV</span>
              </button>

              <label className="prd-bulk-upload__dropzone">
                <input ref={fileRef} type="file" accept=".csv"
                  style={{ display: 'none' }} onChange={handleFile} />
                <i className="bi bi-file-earmark-spreadsheet" />
                <span className="prd-bulk-upload__dropzone-title">
                  {fileName || 'Haz clic o arrastra tu archivo CSV aquí'}
                </span>
                <span className="prd-muted">Solo archivos .csv · Máx. 500 filas</span>
              </label>
            </div>
          )}

          {/* ── Paso 2: Preview ── */}
          {step === STEPS.PREVIEW && (
            <div className="prd-bulk-preview">
              <div className="prd-bulk-preview__info">
                <span>
                  <strong>{rows.length}</strong> fila{rows.length !== 1 ? 's' : ''} encontrada{rows.length !== 1 ? 's' : ''} en
                  <strong> {fileName}</strong>
                </span>
                <button className="prd-muted prd-bulk-preview__change"
                  onClick={handleReset}>
                  <i className="bi bi-arrow-left" /> Cambiar archivo
                </button>
              </div>

              {/* Primeras 5 filas */}
              <div className="prd-bulk-preview__table-wrap">
                <table className="prd-bulk-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      {headers.map(h => <th key={h}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 8).map((row, i) => {
                      const isVariantContinuation = !row.name?.trim() && row.variant_label?.trim()
                      return (
                        <tr key={i}>
                          <td className="prd-muted">{i + 2}</td>
                          {headers.map(h => (
                            <td key={h}>
                              {h === 'variant_label' && isVariantContinuation
                                ? <span title="Variante del producto de la fila de arriba">↳ {row[h]}</span>
                                : (row[h] || '—')}
                            </td>
                          ))}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {rows.length > 8 && (
                <p className="prd-muted" style={{ textAlign: 'center', fontSize: '12px' }}>
                  Mostrando 8 de {rows.length} filas
                </p>
              )}
            </div>
          )}

          {/* ── Paso 3: Resultado ── */}
          {step === STEPS.RESULT && result && (
            <div className="prd-bulk-result">
              {/* Resumen */}
              <div className="prd-bulk-result__summary">
                <div className="prd-bulk-result__stat prd-bulk-result__stat--ok">
                  <span className="prd-bulk-result__stat-val">{result.created}</span>
                  <span className="prd-bulk-result__stat-label">Creados</span>
                </div>
                <div className={`prd-bulk-result__stat ${result.failed > 0 ? 'prd-bulk-result__stat--err' : 'prd-bulk-result__stat--muted'}`}>
                  <span className="prd-bulk-result__stat-val">{result.failed}</span>
                  <span className="prd-bulk-result__stat-label">Con error</span>
                </div>
                <div className="prd-bulk-result__stat prd-bulk-result__stat--muted">
                  <span className="prd-bulk-result__stat-val">{result.total}</span>
                  <span className="prd-bulk-result__stat-label">Total</span>
                </div>
              </div>

              {/* Detalle de errores */}
              {result.failed_detail?.length > 0 && (
                <div className="prd-bulk-result__errors">
                  <span className="prd-form-section__label">Filas con error</span>
                  <div className="prd-bulk-result__error-list">
                    {result.failed_detail.map((f, i) => (
                      <div key={i} className="prd-bulk-result__error-row">
                        <span className="prd-bulk-result__error-row-num">Fila {f.row}</span>
                        <span className="prd-bulk-result__error-name">{f.name}</span>
                        <span className="prd-bulk-result__error-reason">{f.reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Footer ── */}
          <div className="prd-modal__footer">
            {step === STEPS.UPLOAD && (
              <button className="prd-btn prd-btn--ghost" onClick={onClose}>
                Cancelar
              </button>
            )}
            {step === STEPS.PREVIEW && (
              <>
                <button className="prd-btn prd-btn--ghost" onClick={handleReset}>
                  <i className="bi bi-arrow-left" /> Atrás
                </button>
                <button className="prd-btn prd-btn--primary"
                  onClick={handleUpload} disabled={isSaving}>
                  {isSaving
                    ? <><span className="prd-spinner prd-spinner--white" /> Importando...</>
                    : <><i className="bi bi-upload" /> Importar {rows.length} fila{rows.length !== 1 ? 's' : ''}</>
                  }
                </button>
              </>
            )}
            {step === STEPS.RESULT && (
              <>
                {result?.failed > 0 && (
                  <button className="prd-btn prd-btn--ghost" onClick={handleReset}>
                    <i className="bi bi-arrow-repeat" /> Subir otro archivo
                  </button>
                )}
                <button className="prd-btn prd-btn--primary" onClick={onDone}>
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

export default BulkUploadModal