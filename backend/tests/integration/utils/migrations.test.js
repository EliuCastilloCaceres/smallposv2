// tests/integration/utils/migrations.test.js
// Runner de migraciones (spec 03, T1). Cada test usa su propia carpeta de
// migraciones temporal, salvo el último, que revisa las de backend/migrations.
const fs    = require('fs');
const os    = require('os');
const path  = require('path');
const mysql = require('mysql2/promise');
const { TEST_DB, resetDatabase } = require('../../helpers/database');
const { listMigrations, runMigrations, migrateDatabase } = require('../../../src/utils/migrations');

const CREATE_ITEMS = 'CREATE TABLE mig_test_items (id int AUTO_INCREMENT PRIMARY KEY, name varchar(50) NOT NULL);';

let conn;
let dir;

// Crea una carpeta de migraciones con los archivos indicados ({ nombre: sql }).
const writeMigrations = (files) => {
  for (const [name, sql] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), sql);
};

const recorded = async () => {
  const [rows] = await conn.query('SELECT name FROM schema_migrations ORDER BY name');
  return rows.map(r => r.name);
};

const itemNames = async () => {
  const [rows] = await conn.query('SELECT name FROM mig_test_items ORDER BY id');
  return rows.map(r => r.name);
};

beforeAll(async () => {
  conn = await mysql.createConnection({ ...TEST_DB, multipleStatements: true });
});

afterAll(async () => {
  await conn.end();
});

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'migrations-'));
  await conn.query('DROP TABLE IF EXISTS schema_migrations, mig_test_items');
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('runMigrations', () => {
  it('applies pending .sql files in name order, runs every statement and records them', async () => {
    // Se escriben en desorden: el 002 depende de la tabla que crea el 001
    writeMigrations({
      '002-insert-items.sql': "INSERT INTO mig_test_items (name) VALUES ('a');\nINSERT INTO mig_test_items (name) VALUES ('b');\n",
      '001-create-items.sql': CREATE_ITEMS,
      'README.md':            'no es una migración',
    });

    const applied = await runMigrations(conn, { dir });

    expect(applied).toEqual(['001-create-items.sql', '002-insert-items.sql']);
    expect(await recorded()).toEqual(['001-create-items.sql', '002-insert-items.sql']);
    expect(await itemNames()).toEqual(['a', 'b']);
  });

  it('does not apply recorded migrations again and applies only the new ones', async () => {
    writeMigrations({
      '001-create-items.sql': CREATE_ITEMS,
      '002-insert-items.sql': "INSERT INTO mig_test_items (name) VALUES ('a');",
    });
    await runMigrations(conn, { dir });

    expect(await runMigrations(conn, { dir })).toEqual([]);

    writeMigrations({ '003-insert-more-items.sql': "INSERT INTO mig_test_items (name) VALUES ('c');" });
    expect(await runMigrations(conn, { dir })).toEqual(['003-insert-more-items.sql']);
    expect(await itemNames()).toEqual(['a', 'c']);
  });

  it('stops at a failing migration without recording it or applying the next ones', async () => {
    writeMigrations({
      '001-create-items.sql': CREATE_ITEMS,
      '002-broken.sql':       'INSERT INTO mig_test_missing (name) VALUES (1);',
      '003-insert-items.sql': "INSERT INTO mig_test_items (name) VALUES ('a');",
    });

    await expect(runMigrations(conn, { dir })).rejects.toThrow(/La migración 002-broken\.sql falló: .*mig_test_missing/);
    expect(await recorded()).toEqual(['001-create-items.sql']);
    expect(await itemNames()).toEqual([]);

    // Corregida la migración, la siguiente corrida retoma desde ella
    writeMigrations({ '002-broken.sql': "INSERT INTO mig_test_items (name) VALUES ('fixed');" });
    expect(await runMigrations(conn, { dir })).toEqual(['002-broken.sql', '003-insert-items.sql']);
    expect(await itemNames()).toEqual(['fixed', 'a']);
  });

  it('rejects file names that do not follow NNN-description.sql before applying anything', async () => {
    writeMigrations({
      '001-create-items.sql': CREATE_ITEMS,
      '2-insert-items.sql':   "INSERT INTO mig_test_items (name) VALUES ('a');",
    });

    await expect(runMigrations(conn, { dir })).rejects.toThrow('Nombre de migración inválido: 2-insert-items.sql');
    expect(await recorded()).toEqual([]);
  });

  it('does nothing when the migrations folder does not exist', async () => {
    expect(await runMigrations(conn, { dir: path.join(dir, 'missing') })).toEqual([]);
    expect(await recorded()).toEqual([]);
  });
});

describe('resetDatabase', () => {
  it('leaves every migration in backend/migrations applied', async () => {
    await resetDatabase();

    expect(await recorded()).toEqual(listMigrations());
    // migrateDatabase usa la configuración del backend (DB_*) y ya no tiene nada pendiente
    expect(await migrateDatabase()).toEqual([]);
  });
});
