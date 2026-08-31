// src/config/db.js
// Usamos el pool de promesas de mysql2 para poder usar async/await
// directamente sin necesitar el wrapper queryAsync manual que existía antes.

const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host:            process.env.DB_HOST,
  user:            process.env.DB_USER,
  password:        process.env.DB_PASSWORD,
  database:        process.env.DB_NAME,
  port:            process.env.DB_PORT,
  waitForConnections: true,
  connectionLimit: 10,
  idleTimeout:     60000,
  enableKeepAlive: true,
  decimalNumbers:  true,   // ← devuelve DECIMAL como number nativo, no string
});

// Verificación al arrancar
pool.getConnection()
  .then(conn => {
    console.log('✅  Conexión a la BD exitosa');
    conn.release();
  })
  .catch(err => {
    console.error('❌  Error al conectar a MySQL:', err.message);
    process.exit(1); // En shared hosting conviene fallar fuerte al arrancar
  });

module.exports = pool;