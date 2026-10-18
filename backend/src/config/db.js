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

// La verificación de conexión al arrancar vive en index.js: aquí no se
// termina el proceso, para que importar el pool (p. ej. en los tests) no
// mate el proceso si la BD no está disponible.

module.exports = pool;