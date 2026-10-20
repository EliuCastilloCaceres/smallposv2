// migrate.js
// npm run migrate: aplica las migraciones pendientes de migrations/ y sale,
// sin levantar el servidor. El backend también las aplica al arrancar
// (index.js). Ver docs/migraciones.md.
require('dotenv').config();

const { migrateDatabase } = require('./src/utils/migrations');

migrateDatabase()
  .then(applied => {
    console.log(applied.length > 0
      ? `✅  Migraciones aplicadas: ${applied.join(', ')}`
      : '✅  Migraciones al día: no hay pendientes');
  })
  .catch(err => {
    console.error('❌  Error al aplicar migraciones:', err.message);
    process.exitCode = 1;
  });
