'use strict';

const { Pool } = require('pg');

/**
 * Pool unico de conexiones a PostgreSQL.
 * Usa DATABASE_URL si esta definida; si no, arma la conexion con las
 * variables sueltas PG* (utiles para un Postgres local).
 */
const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : new Pool({
      host: process.env.PGHOST || 'localhost',
      port: Number(process.env.PGPORT) || 5432,
      user: process.env.PGUSER || 'utbb',
      password: process.env.PGPASSWORD || 'utbb',
      database: process.env.PGDATABASE || 'encuesta_transporte',
    });

pool.on('error', (err) => {
  console.error('[db] Error inesperado en cliente del pool:', err);
});

// Helper de consulta parametrizada (nunca concatenar strings en SQL).
function query(text, params) {
  return pool.query(text, params);
}

// Ejecuta una funcion dentro de una transaccion (BEGIN/COMMIT/ROLLBACK).
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, withTransaction };
