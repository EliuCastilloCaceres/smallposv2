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

// FIX: el servidor compartido guarda NOW()/CURRENT_TIMESTAMP con su propia
// zona horaria (detectado con 2h de adelanto sobre Mérida), y no podemos
// cambiar la zona horaria del servidor a nivel de sistema. `SET time_zone`
// es una variable de SESIÓN de MySQL, así que la fijamos en cada conexión
// nueva que abre el pool — de ahí en adelante NOW() y por lo tanto
// DEFAULT CURRENT_TIMESTAMP / ON UPDATE CURRENT_TIMESTAMP calculan con la
// hora real de Mérida (UTC-6 fijo, México ya no tiene horario de verano).
// OJO: esto NO es lo mismo que la opción `timezone` de mysql2 en la config
// del pool — esa solo afecta cómo el driver de Node convierte objetos
// Date, no cómo MySQL calcula NOW() internamente.
pool.on('connection', (conn) => {
  // El evento 'connection' entrega la conexión en modo callback (no promise),
  // incluso usando mysql2/promise. Hay que envolverla con .promise() para
  // poder usar .catch()/await sobre el resultado de .query().
  conn.promise().query("SET time_zone = '-06:00'").catch(err => {
    console.error('❌  No se pudo fijar time_zone en la conexión:', err.message);
  });
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