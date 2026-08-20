// src/utils/imageUrl.js
// El backend guarda `image` como ruta relativa (ej: "/images/products/123.jpg"),
// no como URL absoluta. Este helper la resuelve contra el mismo origen que usa
// axios para las llamadas a la API, así no hay que hardcodear ningún dominio.
//
// Se deriva de api.defaults.baseURL en vez de leer la env var directamente,
// para que si algún día cambia VITE_URL_BASE, esto lo siga resolviendo bien
// sin tocar este archivo.
//
// Casos que cubre:
//   VITE_URL_BASE = "/api/"                    -> origin = ""  (mismo origen, vía proxy)
//   VITE_URL_BASE = "http://localhost:3000/api" -> origin = "http://localhost:3000"
//   product.image = "https://cdn.externo.com/x.jpg" (URLs viejas guardadas a mano) -> se respeta tal cual

import api from '../services/api'

const BACKEND_ORIGIN = (api.defaults.baseURL || '').replace(/\/api\/?$/, '')

export const getImageUrl = (imagePath) => {
  if (!imagePath) return null
  if (/^https?:\/\//i.test(imagePath)) return imagePath // ya es absoluta, no tocar
  return `${BACKEND_ORIGIN}${imagePath}`
}
