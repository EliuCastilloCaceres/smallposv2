// index.js
// Punto de arranque: carga el .env, verifica la BD, aplica las migraciones
// pendientes y levanta el servidor. La configuración de Express vive en app.js.

// dotenv va primero: app.js lee process.env (p. ej. CORS_ORIGIN) al cargarse.
require('dotenv').config();

const app = require('./app');
const db  = require('./src/config/db');
const { migrateDatabase } = require('./src/utils/migrations');

const start = async () => {
  // ─── Verificación de la BD al arrancar ──────────────────────────────────────
  try {
    const conn = await db.getConnection();
    console.log('✅  Conexión a la BD exitosa');
    conn.release();
  } catch (err) {
    console.error('❌  Error al conectar a MySQL:', err.message);
    process.exit(1); // En shared hosting conviene fallar fuerte al arrancar
  }

  // ─── Migraciones ────────────────────────────────────────────────────────────
  // Antes de escuchar: el código nuevo no debe atender peticiones contra un
  // esquema viejo. Si una falla, el servidor no arranca (ver docs/migraciones.md).
  try {
    const applied = await migrateDatabase();
    console.log(applied.length > 0
      ? `✅  Migraciones aplicadas: ${applied.join(', ')}`
      : '✅  Migraciones al día');
  } catch (err) {
    console.error('❌  Error al aplicar migraciones:', err.message);
    process.exit(1);
  }

  // ─── Arrancar servidor ──────────────────────────────────────────────────────
  const port = process.env.SERVER_PORT ?? 3001;
  app.listen(port, '0.0.0.0', () => {
    console.log(`🚀  API corriendo en puerto ${port}`);
  });
};

start();
