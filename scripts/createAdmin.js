'use strict';

/**
 * Crea (o actualiza la contrasena de) un usuario administrador.
 * Lee ADMIN_USER y ADMIN_PASSWORD de .env, o los recibe por argumentos:
 *   node scripts/createAdmin.js <usuario> <password>
 * Uso normal: npm run seed:admin
 */
require('dotenv').config();
const bcrypt = require('bcrypt');
const { pool } = require('../src/db/pool');

async function main() {
  const usuario = process.argv[2] || process.env.ADMIN_USER;
  const password = process.argv[3] || process.env.ADMIN_PASSWORD;

  if (!usuario || !password) {
    throw new Error(
      'Faltan credenciales. Define ADMIN_USER y ADMIN_PASSWORD en .env o pasalos como argumentos.'
    );
  }
  if (password.length < 6) {
    throw new Error('La contrasena del admin debe tener al menos 6 caracteres.');
  }

  const hash = await bcrypt.hash(password, 12);

  // UPSERT: si el usuario existe, actualiza su hash.
  await pool.query(
    `INSERT INTO admin_usuarios (usuario, password_hash)
     VALUES ($1, $2)
     ON CONFLICT (usuario) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
    [usuario, hash]
  );

  console.log(`[seed:admin] Admin "${usuario}" creado/actualizado correctamente.`);
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error('[seed:admin] ERROR:', err.message);
    pool.end();
    process.exit(1);
  });
