// src/utils/migrations.js
// Runner de migraciones: aplica, en orden por nombre, los archivos .sql de
// backend/migrations/ que todavía no estén registrados en schema_migrations.
// sql-init/ es la base fija de una instalación nueva y las migraciones
// corren encima (ver docs/migraciones.md y specs/03-fix-costos-e-indices.md).
//
// MySQL hace commit implícito con cada cambio de esquema, así que una
// migración no es atómica: si falla a la mitad puede dejar cambios parciales.
// Por eso cada migración hace un cambio acotado.

const fs    = require('fs');
const path  = require('path');
const mysql = require('mysql2/promise');

const MIGRATIONS_DIR = path.join(__dirname, '../../migrations');
const FILE_PATTERN   = /^\d{3}-[a-z0-9-]+\.sql$/;

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    name       varchar(255) NOT NULL,
    applied_at datetime     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (name)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`;

// Archivos de migración ordenados por nombre. Si alguno no sigue el formato
// NNN-descripcion.sql falla antes de aplicar nada: un nombre mal escrito
// cambiaría el orden sin que nadie lo note.
const listMigrations = (dir = MIGRATIONS_DIR) => {
  if (!fs.existsSync(dir)) return [];

  const files   = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  const invalid = files.filter(f => !FILE_PATTERN.test(f));
  if (invalid.length > 0) {
    throw new Error(
      `Nombre de migración inválido: ${invalid.join(', ')}. Usa NNN-descripcion.sql (p. ej. 001-add-date-indexes.sql)`
    );
  }
  return files;
};

// conn: conexión de mysql2/promise con multipleStatements, porque cada
// archivo se ejecuta tal cual. Devuelve los nombres que aplicó.
const runMigrations = async (conn, { dir = MIGRATIONS_DIR } = {}) => {
  await conn.query(CREATE_TABLE_SQL);

  const [rows]  = await conn.query('SELECT name FROM schema_migrations');
  const applied = new Set(rows.map(r => r.name));
  const pending = listMigrations(dir).filter(name => !applied.has(name));

  for (const name of pending) {
    // Sin BOM: un archivo guardado así en Windows rompe la primera sentencia
    const sql = fs.readFileSync(path.join(dir, name), 'utf8').replace(/^﻿/, '');
    try {
      await conn.query(sql);
    } catch (err) {
      // No se registra y las siguientes no se aplican
      throw new Error(`La migración ${name} falló: ${err.message}`, { cause: err });
    }
    await conn.query('INSERT INTO schema_migrations (name) VALUES (?)', [name]);
  }

  return pending;
};

// Aplica las migraciones pendientes en la base del backend (variables DB_*).
// Abre su propia conexión en vez de usar el pool de config/db.js, que no
// permite varias sentencias por consulta.
const migrateDatabase = async () => {
  const conn = await mysql.createConnection({
    host:     process.env.DB_HOST,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port:     process.env.DB_PORT,
    multipleStatements: true,
  });
  try {
    return await runMigrations(conn);
  } finally {
    await conn.end();
  }
};

module.exports = {
  MIGRATIONS_DIR,
  listMigrations,
  runMigrations,
  migrateDatabase,
};
