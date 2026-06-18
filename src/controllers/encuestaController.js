'use strict';

const { query, withTransaction } = require('../db/pool');
const cfg = require('../config');

// Regex general de correo + dominio institucional exacto.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function esCorreoInstitucional(correo) {
  if (typeof correo !== 'string') return false;
  const c = correo.trim().toLowerCase();
  return EMAIL_RE.test(c) && c.endsWith(cfg.DOMINIO_CORREO);
}

function esLatLng(lat, lng) {
  const a = Number(lat);
  const b = Number(lng);
  return (
    Number.isFinite(a) &&
    Number.isFinite(b) &&
    a >= -90 &&
    a <= 90 &&
    b >= -180 &&
    b <= 180
  );
}

function str(v) {
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * Valida el payload completo de la encuesta.
 * Devuelve { ok:true, data } o { ok:false, errores:[...] }.
 */
function validarEncuesta(body) {
  const errores = [];
  const b = body || {};

  // ---- Paso 1: estudiante ----
  const nombre_completo = str(b.nombre_completo);
  const matricula = str(b.matricula);
  const correo = str(b.correo).toLowerCase();
  const carrera = str(b.carrera);
  const cuatrimestre = str(b.cuatrimestre);
  const grupo = str(b.grupo);

  if (nombre_completo.length < 3 || nombre_completo.length > 150)
    errores.push('El nombre completo es obligatorio (3 a 150 caracteres).');
  if (!matricula || matricula.length > 30)
    errores.push('La matricula es obligatoria (maximo 30 caracteres).');
  if (!esCorreoInstitucional(correo))
    errores.push(
      `El correo debe ser institucional y terminar en ${cfg.DOMINIO_CORREO}.`
    );
  if (!cfg.CARRERAS_VALIDAS.includes(carrera))
    errores.push('Selecciona una carrera valida.');
  if (!cfg.CUATRIMESTRES.includes(cuatrimestre))
    errores.push('Selecciona un cuatrimestre valido.');
  if (!grupo || grupo.length > 20)
    errores.push('El grupo es obligatorio (maximo 20 caracteres).');

  // ---- Paso 2: transporte de entrada ----
  const medio_transporte = str(b.medio_transporte);
  let medio_transporte_otro = str(b.medio_transporte_otro) || null;

  if (!cfg.MEDIOS_TRANSPORTE.includes(medio_transporte))
    errores.push('Selecciona un medio de transporte valido.');

  // CARRO PERSONAL: la encuesta esta dirigida a estudiantes que usarian el
  // transporte oficial de la UTBB. Si el estudiante usa carro personal no se le
  // piden mas datos; solo se guarda su registro y el medio (para tener el conteo).
  if (medio_transporte === 'carro_personal') {
    if (errores.length) return { ok: false, errores };
    return {
      ok: true,
      data: {
        estudiante: { nombre_completo, matricula, correo, carrera, cuatrimestre, grupo },
        transporte: {
          medio_transporte: 'carro_personal',
          medio_transporte_otro: null,
          vive_direccion: null,
          vive_lat: null,
          vive_lng: null,
          parada_camion_lat: null,
          parada_camion_lng: null,
          transborda: false,
          segunda_parada_lat: null,
          segunda_parada_lng: null,
          usaria_ruta_oficial: null,
        },
        horariosEntrada: [],
        horarios: [],
      },
    };
  }

  // De aqui en adelante: camion u otro (si usan o usarian el transporte).
  const vive_direccion = str(b.vive_direccion) || null;
  const usaria_ruta_oficial = str(b.usaria_ruta_oficial) || null;

  if (medio_transporte === 'otro') {
    if (!medio_transporte_otro)
      errores.push('Especifica el medio de transporte en "Otro".');
    if (medio_transporte_otro && medio_transporte_otro.length > 100)
      medio_transporte_otro = medio_transporte_otro.slice(0, 100);
  } else {
    medio_transporte_otro = null;
  }
  if (usaria_ruta_oficial && !cfg.USARIA_RUTA.includes(usaria_ruta_oficial))
    errores.push('Respuesta invalida en "usaria la ruta oficial".');

  // Coordenadas de domicilio (opcional)
  let vive_lat = null;
  let vive_lng = null;
  if (b.vive_lat != null && b.vive_lng != null && b.vive_lat !== '' && b.vive_lng !== '') {
    if (esLatLng(b.vive_lat, b.vive_lng)) {
      vive_lat = Number(b.vive_lat);
      vive_lng = Number(b.vive_lng);
    } else {
      errores.push('Las coordenadas del domicilio no son validas.');
    }
  }

  // Campos especificos de camion
  let parada_camion_lat = null;
  let parada_camion_lng = null;
  let transborda = false;
  let segunda_parada_lat = null;
  let segunda_parada_lng = null;

  if (medio_transporte === 'camion') {
    if (!esLatLng(b.parada_camion_lat, b.parada_camion_lng)) {
      errores.push('Marca en el mapa el punto donde tomas el camion.');
    } else {
      parada_camion_lat = Number(b.parada_camion_lat);
      parada_camion_lng = Number(b.parada_camion_lng);
    }
    transborda = b.transborda === true || b.transborda === 'true' || b.transborda === 'si';
    if (transborda) {
      if (!esLatLng(b.segunda_parada_lat, b.segunda_parada_lng)) {
        errores.push('Marca en el mapa donde tomas el segundo transporte.');
      } else {
        segunda_parada_lat = Number(b.segunda_parada_lat);
        segunda_parada_lng = Number(b.segunda_parada_lng);
      }
    }
  }

  // ---- Hora de ENTRADA por dia (lunes-viernes) ----
  const horariosEntrada = [];
  const entradaIn = b.horarios_entrada || {};
  for (const dia of cfg.DIAS_SEMANA) {
    const item = entradaIn[dia] || {};
    const noAplica =
      item.no_aplica === true || item.no_aplica === 'true' || item.no_aplica === 'on';
    if (noAplica) {
      horariosEntrada.push({ dia_semana: dia, hora_entrada: null, no_aplica: true });
    } else {
      const he = str(item.hora_entrada);
      if (!cfg.VALORES_HORA_ENTRADA.has(he)) {
        errores.push(`Selecciona la hora de entrada del dia ${dia} o marca "no aplica".`);
      } else {
        horariosEntrada.push({ dia_semana: dia, hora_entrada: he, no_aplica: false });
      }
    }
  }

  // ---- Paso 3: horarios de salida lunes-viernes ----
  const horarios = [];
  const horariosIn = b.horarios_salida || {};
  for (const dia of cfg.DIAS_SEMANA) {
    const item = horariosIn[dia] || {};
    const noAplica =
      item.no_aplica === true || item.no_aplica === 'true' || item.no_aplica === 'on';
    if (noAplica) {
      horarios.push({ dia_semana: dia, hora_salida: null, no_aplica: true });
    } else {
      const hs = str(item.hora_salida);
      if (!cfg.VALORES_HORA_SALIDA.has(hs)) {
        errores.push(`Selecciona la hora de salida del dia ${dia} o marca "no aplica".`);
      } else {
        horarios.push({ dia_semana: dia, hora_salida: hs, no_aplica: false });
      }
    }
  }

  if (errores.length) return { ok: false, errores };

  return {
    ok: true,
    data: {
      estudiante: { nombre_completo, matricula, correo, carrera, cuatrimestre, grupo },
      transporte: {
        medio_transporte,
        medio_transporte_otro,
        vive_direccion,
        vive_lat,
        vive_lng,
        parada_camion_lat,
        parada_camion_lng,
        transborda,
        segunda_parada_lat,
        segunda_parada_lng,
        usaria_ruta_oficial,
      },
      horariosEntrada,
      horarios,
    },
  };
}

/**
 * POST /api/encuesta — registra una encuesta completa.
 */
async function enviarEncuesta(req, res, next) {
  try {
    const v = validarEncuesta(req.body);
    if (!v.ok) {
      return res.status(400).json({ error: 'Datos invalidos', errores: v.errores });
    }
    const { estudiante, transporte, horariosEntrada, horarios } = v.data;

    // Anti-duplicados: revisar matricula y correo antes de insertar.
    const dup = await query(
      'SELECT matricula, correo FROM estudiantes WHERE matricula = $1 OR correo = $2',
      [estudiante.matricula, estudiante.correo]
    );
    if (dup.rows.length) {
      const errores = [];
      if (dup.rows.some((r) => r.matricula === estudiante.matricula))
        errores.push('Esa matricula ya respondio la encuesta.');
      if (dup.rows.some((r) => r.correo === estudiante.correo))
        errores.push('Ese correo ya respondio la encuesta.');
      return res.status(409).json({ error: 'Respuesta duplicada', errores });
    }

    const resultado = await withTransaction(async (client) => {
      const est = await client.query(
        `INSERT INTO estudiantes (nombre_completo, matricula, correo, carrera, cuatrimestre, grupo)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [
          estudiante.nombre_completo,
          estudiante.matricula,
          estudiante.correo,
          estudiante.carrera,
          estudiante.cuatrimestre,
          estudiante.grupo,
        ]
      );
      const estudianteId = est.rows[0].id;

      await client.query(
        `INSERT INTO transporte_entrada
          (estudiante_id, medio_transporte, medio_transporte_otro,
           vive_direccion, vive_lat, vive_lng, parada_camion_lat, parada_camion_lng,
           transborda, segunda_parada_lat, segunda_parada_lng, usaria_ruta_oficial)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          estudianteId,
          transporte.medio_transporte,
          transporte.medio_transporte_otro,
          transporte.vive_direccion,
          transporte.vive_lat,
          transporte.vive_lng,
          transporte.parada_camion_lat,
          transporte.parada_camion_lng,
          transporte.transborda,
          transporte.segunda_parada_lat,
          transporte.segunda_parada_lng,
          transporte.usaria_ruta_oficial,
        ]
      );

      for (const h of horariosEntrada) {
        await client.query(
          `INSERT INTO horarios_entrada (estudiante_id, dia_semana, hora_entrada, no_aplica)
           VALUES ($1,$2,$3,$4)`,
          [estudianteId, h.dia_semana, h.hora_entrada, h.no_aplica]
        );
      }

      for (const h of horarios) {
        await client.query(
          `INSERT INTO horarios_salida (estudiante_id, dia_semana, hora_salida, no_aplica)
           VALUES ($1,$2,$3,$4)`,
          [estudianteId, h.dia_semana, h.hora_salida, h.no_aplica]
        );
      }

      return estudianteId;
    });

    return res.status(201).json({ ok: true, estudiante_id: resultado });
  } catch (err) {
    // Carrera de condiciones rara: violacion de unicidad pese al pre-chequeo.
    if (err && err.code === '23505') {
      return res
        .status(409)
        .json({ error: 'Respuesta duplicada', errores: ['Matricula o correo ya registrados.'] });
    }
    return next(err);
  }
}

/**
 * GET /api/colonias — sugerencias para "Donde vives".
 * Devuelve la lista semilla mezclada con las colonias que ya escribieron los
 * estudiantes (distintas, sin duplicar, ordenadas). Asi la lista se autoalimenta.
 */
async function sugerenciasColonias(req, res, next) {
  try {
    const { rows } = await query(
      `SELECT DISTINCT trim(vive_direccion) AS c
         FROM transporte_entrada
        WHERE vive_direccion IS NOT NULL AND length(trim(vive_direccion)) > 1`
    );
    // Dedup case-insensitive, conservando la primera forma vista (semilla primero).
    const mapa = new Map();
    for (const c of cfg.COLONIAS_SEED) mapa.set(c.toLowerCase(), c);
    for (const r of rows) {
      const k = r.c.toLowerCase();
      if (!mapa.has(k)) mapa.set(k, r.c);
    }
    const lista = Array.from(mapa.values()).sort((a, b) => a.localeCompare(b, 'es'));
    res.json({ colonias: lista });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  validarEncuesta,
  esCorreoInstitucional,
  enviarEncuesta,
  sugerenciasColonias,
};
