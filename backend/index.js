// index.js
// Punto de arranque: carga el .env, verifica la BD y levanta el servidor.
// La configuración de Express vive en app.js.

// dotenv va primero: app.js lee process.env (p. ej. CORS_ORIGIN) al cargarse.
require('dotenv').config();

const app = require('./app');
const db  = require('./src/config/db');

// ─── Verificación de la BD al arrancar ────────────────────────────────────────
db.getConnection()
  .then(conn => {
    console.log('✅  Conexión a la BD exitosa');
    conn.release();
  })
  .catch(err => {
    console.error('❌  Error al conectar a MySQL:', err.message);
    process.exit(1); // En shared hosting conviene fallar fuerte al arrancar
  });

// ─── Arrancar servidor ────────────────────────────────────────────────────────
const port = process.env.SERVER_PORT ?? 3001;
app.listen(port, '0.0.0.0', () => {
  console.log(`🚀  API corriendo en puerto ${port}`);
});
