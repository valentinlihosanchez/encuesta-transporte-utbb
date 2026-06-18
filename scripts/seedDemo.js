'use strict';
/* Inserta datos de demostracion realistas (zona Bahia de Banderas / Nuevo Vallarta)
   para poblar el dashboard y el mapa. Idempotente: omite matriculas ya existentes.
   Uso: node scripts/seedDemo.js   (NO se ejecuta en produccion automaticamente) */
require('dotenv').config();
const { pool, withTransaction } = require('../src/db/pool');

const DEMO = [
  { n: 'Maria Fernanda Gomez', m: 'D0001', c: 'Gestion y Desarrollo Turistico', q: '3', g: 'A',
    medio: 'camion', he: '07:00', dir: 'Bucerias', vlat: 20.7505, vlng: -105.3330,
    plat: 20.7490, plng: -105.3310, tb: true, slat: 20.7100, slng: -105.2950, ruta: 'si',
    sal: ['14:30','14:30','16:10','14:30','no'] },
  { n: 'Jose Luis Ramirez', m: 'D0002', c: 'Mantenimiento Industrial', q: '5', g: 'B',
    medio: 'camion', he: '07:00', dir: 'Mezcales', vlat: 20.7050, vlng: -105.2700,
    plat: 20.7040, plng: -105.2690, tb: false, ruta: 'si',
    sal: ['17:00','17:00','17:00','15:20','13:40'] },
  { n: 'Ana Sofia Torres', m: 'D0003', c: 'Gastronomia', q: '7', g: 'A',
    medio: 'camion', he: '07:50', dir: 'La Cruz de Huanacaxtle', vlat: 20.7510, vlng: -105.3760,
    plat: 20.7500, plng: -105.3750, tb: true, slat: 20.7300, slng: -105.3200, ruta: 'tal_vez',
    sal: ['15:20','15:20','15:20','15:20','no'] },
  { n: 'Carlos Eduardo Diaz', m: 'D0004', c: 'Tecnologias de la Informacion e Innovacion Digital', q: '3', g: '101',
    medio: 'carro_personal', he: '07:00', dir: 'Valle de Banderas', vlat: 20.8000, vlng: -105.2300,
    tb: false, ruta: 'no', sal: ['16:10','16:10','16:10','16:10','16:10'] },
  { n: 'Lucia Hernandez Mora', m: 'D0005', c: 'Terapia Fisica', q: '9', g: 'A',
    medio: 'camion', he: '07:00', dir: 'San Vicente', vlat: 20.7600, vlng: -105.2200,
    plat: 20.7590, plng: -105.2210, tb: false, ruta: 'si',
    sal: ['14:30','14:30','14:30','14:30','13:40'] },
  { n: 'Diego Alejandro Ruiz', m: 'D0006', c: 'Negocios y Mercadotecnia', q: '5', g: 'B',
    medio: 'otro', otro: 'motocicleta', he: '07:50', dir: 'Nuevo Vallarta', vlat: 20.6950, vlng: -105.2900,
    tb: false, ruta: 'tal_vez', sal: ['17:00','17:00','17:00','17:00','17:00'] },
  { n: 'Valeria Castro Lopez', m: 'D0007', c: 'Contaduria', q: '3', g: 'A',
    medio: 'camion', he: '08:40', dir: 'Bucerias centro', vlat: 20.7520, vlng: -105.3340,
    plat: 20.7515, plng: -105.3325, tb: false, ruta: 'si',
    sal: ['15:20','15:20','no','15:20','15:20'] },
  { n: 'Fernando Aguilar Vega', m: 'D0008', c: 'Energias y Desarrollo Sostenible', q: '7', g: 'A',
    medio: 'camion', he: '07:00', dir: 'Mezcales', vlat: 20.7060, vlng: -105.2710,
    plat: 20.7045, plng: -105.2695, tb: true, slat: 20.7000, slng: -105.2850, ruta: 'si',
    sal: ['14:30','16:10','14:30','16:10','no'] },
  { n: 'Regina Mendoza Flores', m: 'D0009', c: 'Medico Cirujano y Partero', q: '5', g: 'B',
    medio: 'camion', he: '07:00', dir: 'Sayulita', vlat: 20.8690, vlng: -105.4410,
    plat: 20.8680, plng: -105.4400, tb: true, slat: 20.7800, slng: -105.3500, ruta: 'tal_vez',
    sal: ['17:00','17:00','17:00','17:00','13:40'] },
  { n: 'Emiliano Vargas Ortiz', m: 'D0010', c: 'Agricultura Sustentable y Protegida', q: '3', g: 'A',
    medio: 'carro_personal', he: '07:50', dir: 'Las Jarretaderas', vlat: 20.6800, vlng: -105.2750,
    tb: false, ruta: 'no', sal: ['15:20','15:20','15:20','15:20','15:20'] },
];

const DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'];

async function main() {
  let insertados = 0, omitidos = 0;
  for (const d of DEMO) {
    const existe = await pool.query('SELECT 1 FROM estudiantes WHERE matricula = $1', [d.m]);
    if (existe.rows.length) { omitidos++; continue; }

    await withTransaction(async (client) => {
      const est = await client.query(
        `INSERT INTO estudiantes (nombre_completo, matricula, correo, carrera, cuatrimestre, grupo)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [d.n, d.m, d.m.toLowerCase() + '@academica.utbb.edu.mx', d.c, d.q, d.g]
      );
      const id = est.rows[0].id;
      await client.query(
        `INSERT INTO transporte_entrada
          (estudiante_id, medio_transporte, medio_transporte_otro,
           vive_direccion, vive_lat, vive_lng, parada_camion_lat, parada_camion_lng,
           transborda, segunda_parada_lat, segunda_parada_lng, usaria_ruta_oficial)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [id, d.medio, d.otro || null, d.dir, d.vlat, d.vlng,
         d.plat || null, d.plng || null, !!d.tb, d.slat || null, d.slng || null, d.ruta]
      );

      // carro personal no responde entrada/salida (encuesta para usuarios del transporte).
      if (d.medio !== 'carro_personal') {
        for (let i = 0; i < DIAS.length; i++) {
          const salida = d.sal[i];
          const sinClase = salida === 'no';
          // Entrada: misma hora todos los dias con clase; no aplica si no hay clase.
          await client.query(
            `INSERT INTO horarios_entrada (estudiante_id, dia_semana, hora_entrada, no_aplica)
             VALUES ($1,$2,$3,$4)`,
            [id, DIAS[i], sinClase ? null : d.he, sinClase]
          );
          await client.query(
            `INSERT INTO horarios_salida (estudiante_id, dia_semana, hora_salida, no_aplica)
             VALUES ($1,$2,$3,$4)`,
            [id, DIAS[i], sinClase ? null : salida, sinClase]
          );
        }
      }
    });
    insertados++;
  }
  console.log(`[seedDemo] Insertados: ${insertados} | Omitidos (ya existian): ${omitidos}`);
}

main().then(() => pool.end()).catch((e) => { console.error('[seedDemo] ERROR:', e.message); pool.end(); process.exit(1); });
