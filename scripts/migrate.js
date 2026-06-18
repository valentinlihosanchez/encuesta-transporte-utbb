'use strict';

/**
 * Ejecuta migrations/schema.sql contra la base de datos configurada.
 * Uso: npm run migrate
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../src/db/pool');

async function main() {
  const schemaPath = path.join(__dirname, '..', 'migrations', 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  console.log(`[migrate] Aplicando ${schemaPath} ...`);
  await pool.query(sql);
  console.log('[migrate] OK. Esquema aplicado sin errores.');

  // Muestra las tablas creadas como evidencia.
  const { rows } = await pool.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' ORDER BY table_name`
  );
  console.log('[migrate] Tablas en el esquema public:');
  rows.forEach((r) => console.log('   -', r.table_name));
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error('[migrate] ERROR:', err.message);
    pool.end();
    process.exit(1);
  });
