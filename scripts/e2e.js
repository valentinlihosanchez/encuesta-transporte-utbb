'use strict';
/* Prueba E2E a nivel API contra el servidor en ejecucion.
   Verifica: envio valido (201), duplicados (409), correo no institucional (400),
   hora invalida (400). Autolimpia el estudiante de prueba al final.
   Requiere el servidor corriendo (npm run dev) y BASE_URL (default localhost:3000).
   Uso: npm run test:e2e */
require('dotenv').config();
const { pool } = require('../src/db/pool');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const MAT = 'E2E_' + Date.now().toString().slice(-6);
const CORREO = MAT.toLowerCase() + '@academica.utbb.edu.mx';

function payload(over) {
  return Object.assign({
    nombre_completo: 'Estudiante E2E',
    matricula: MAT,
    correo: CORREO,
    carrera: 'Contaduria',
    cuatrimestre: '4',
    grupo: 'A',
    medio_transporte: 'camion',
    parada_camion_lat: 20.74, parada_camion_lng: -105.33,
    transborda: false,
    usaria_ruta_oficial: 'si',
    horarios_entrada: {
      lunes: { no_aplica: false, hora_entrada: '07:00' },
      martes: { no_aplica: false, hora_entrada: '07:00' },
      miercoles: { no_aplica: true },
      jueves: { no_aplica: false, hora_entrada: '07:50' },
      viernes: { no_aplica: false, hora_entrada: '07:00' },
    },
    horarios_salida: {
      lunes: { no_aplica: false, hora_salida: '14:30' },
      martes: { no_aplica: false, hora_salida: '14:30' },
      miercoles: { no_aplica: true },
      jueves: { no_aplica: false, hora_salida: '15:20' },
      viernes: { no_aplica: false, hora_salida: '13:40' },
    },
  }, over || {});
}

async function post(body) {
  const r = await fetch(BASE + '/api/encuesta', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json() };
}

let fallos = 0;
function check(nombre, cond) {
  console.log((cond ? 'PASS' : 'FAIL') + ' - ' + nombre);
  if (!cond) fallos++;
}

async function main() {
  const ok = await post(payload());
  check('Envio valido devuelve 201 con estudiante_id', ok.status === 201 && ok.body.estudiante_id);

  const dup = await post(payload());
  check('Matricula+correo duplicados devuelven 409', dup.status === 409);

  const badmail = await post(payload({ matricula: MAT + 'X', correo: 'x@gmail.com' }));
  check('Correo no institucional devuelve 400', badmail.status === 400);

  const badhora = await post(
    payload({
      matricula: MAT + 'Y',
      correo: (MAT + 'y').toLowerCase() + '@academica.utbb.edu.mx',
      horarios_entrada: { lunes: { no_aplica: false, hora_entrada: '09:13' } },
    })
  );
  check('Hora de entrada invalida devuelve 400', badhora.status === 400);

  // Carro personal: registro minimo, debe aceptarse (201) sin entrada/salida.
  const CARRO = MAT + 'C';
  const carro = await post({
    nombre_completo: 'Carro Personal E2E',
    matricula: CARRO,
    correo: CARRO.toLowerCase() + '@academica.utbb.edu.mx',
    carrera: 'Contaduria', cuatrimestre: '4', grupo: 'A',
    medio_transporte: 'carro_personal',
  });
  check('Carro personal acepta registro minimo (201)', carro.status === 201);
  const carroRows = await pool.query(
    `SELECT (SELECT count(*) FROM horarios_entrada WHERE estudiante_id=e.id)::int AS ent,
            (SELECT count(*) FROM horarios_salida  WHERE estudiante_id=e.id)::int AS sal
       FROM estudiantes e WHERE e.matricula=$1`, [CARRO]
  );
  check('Carro personal NO guarda horarios de entrada/salida',
    carroRows.rows[0] && carroRows.rows[0].ent === 0 && carroRows.rows[0].sal === 0);

  // Verifica que el estudiante de camion SI guardo 5 entradas (1 no aplica) y 5 salidas.
  const camRows = await pool.query(
    `SELECT (SELECT count(*) FROM horarios_entrada WHERE estudiante_id=e.id)::int AS ent
       FROM estudiantes e WHERE e.matricula=$1`, [MAT]
  );
  check('Camion guarda 5 horarios de entrada por dia', camRows.rows[0] && camRows.rows[0].ent === 5);

  // Limpieza
  await pool.query('DELETE FROM estudiantes WHERE matricula = ANY($1)', [[MAT, CARRO]]);
  console.log('\nLimpieza: estudiantes de prueba eliminados.');
  console.log(fallos === 0 ? '\nTODAS LAS PRUEBAS PASARON' : `\n${fallos} PRUEBA(S) FALLARON`);
}

main()
  .then(async () => { process.exitCode = fallos ? 1 : 0; await pool.end(); })
  .catch(async (e) => { console.error('ERROR:', e.message); process.exitCode = 1; await pool.end(); });
