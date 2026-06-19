'use strict';

const bcrypt = require('bcrypt');
const { stringify } = require('csv-stringify/sync');
const { query } = require('../db/pool');
const cfg = require('../config');

const PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// Autenticacion
// ---------------------------------------------------------------------------
function mostrarLogin(req, res) {
  if (req.session && req.session.adminId) return res.redirect('/coordinacion-utbb');
  res.render('admin/login', { error: null });
}

async function procesarLogin(req, res, next) {
  try {
    const usuario = String(req.body.usuario || '').trim();
    const password = String(req.body.password || '');
    if (!usuario || !password) {
      return res.status(400).render('admin/login', {
        error: 'Ingresa usuario y contrasena.',
      });
    }
    const { rows } = await query(
      'SELECT id, usuario, password_hash FROM admin_usuarios WHERE usuario = $1',
      [usuario]
    );
    const admin = rows[0];
    const ok = admin ? await bcrypt.compare(password, admin.password_hash) : false;
    if (!ok) {
      return res.status(401).render('admin/login', {
        error: 'Usuario o contrasena incorrectos.',
      });
    }
    req.session.adminId = admin.id;
    req.session.adminUser = admin.usuario;
    return res.redirect('/coordinacion-utbb');
  } catch (err) {
    return next(err);
  }
}

function logout(req, res) {
  req.session.destroy(() => res.redirect('/coordinacion-utbb/login'));
}

// ---------------------------------------------------------------------------
// Construye WHERE dinamico para filtros (consultas parametrizadas).
// ---------------------------------------------------------------------------
function construirFiltros(q) {
  const where = [];
  const params = [];
  let i = 1;

  if (q.carrera) {
    where.push(`e.carrera = $${i++}`);
    params.push(q.carrera);
  }
  if (q.cuatrimestre) {
    where.push(`e.cuatrimestre = $${i++}`);
    params.push(q.cuatrimestre);
  }
  if (q.grupo) {
    where.push(`e.grupo = $${i++}`);
    params.push(q.grupo);
  }
  if (q.medio) {
    where.push(`t.medio_transporte = $${i++}`);
    params.push(q.medio);
  }
  if (q.desde) {
    where.push(`e.creado_en >= $${i++}`);
    params.push(q.desde);
  }
  if (q.hasta) {
    where.push(`e.creado_en < ($${i++}::date + INTERVAL '1 day')`);
    params.push(q.hasta);
  }
  if (q.buscar) {
    where.push(`(e.nombre_completo ILIKE $${i} OR e.matricula ILIKE $${i})`);
    params.push(`%${q.buscar}%`);
    i++;
  }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return { clause, params };
}

// ---------------------------------------------------------------------------
// Tabla de respuestas (filtrable + paginada)
// ---------------------------------------------------------------------------
async function listado(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const { clause, params } = construirFiltros(req.query);

    const totalRes = await query(
      `SELECT COUNT(*)::int AS total
         FROM estudiantes e
         LEFT JOIN transporte_entrada t ON t.estudiante_id = e.id
         ${clause}`,
      params
    );
    const total = totalRes.rows[0].total;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const offset = (page - 1) * PAGE_SIZE;

    const rows = (
      await query(
        `SELECT e.id, e.nombre_completo, e.matricula, e.correo, e.carrera,
                e.cuatrimestre, e.grupo, e.creado_en,
                t.medio_transporte, t.transborda, t.usaria_ruta_oficial,
                (SELECT to_char(he.hora_entrada,'HH24:MI') FROM horarios_entrada he
                   WHERE he.estudiante_id = e.id AND he.dia_semana = 'lunes'
                     AND he.no_aplica = FALSE) AS hora_entrada_lunes
           FROM estudiantes e
           LEFT JOIN transporte_entrada t ON t.estudiante_id = e.id
           ${clause}
           ORDER BY e.creado_en DESC
           LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
        params
      )
    ).rows;

    res.render('admin/listado', {
      adminUser: req.session.adminUser,
      rows,
      total,
      page,
      totalPages,
      filtros: req.query,
      cfg,
      activo: 'listado',
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Detalle de un estudiante
// ---------------------------------------------------------------------------
async function detalle(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const est = (await query('SELECT * FROM estudiantes WHERE id = $1', [id])).rows[0];
    if (!est) return res.status(404).render('404');

    const transporte = (
      await query('SELECT * FROM transporte_entrada WHERE estudiante_id = $1', [id])
    ).rows[0];
    const horarios = (
      await query(
        'SELECT dia_semana, hora_salida, no_aplica FROM horarios_salida WHERE estudiante_id = $1',
        [id]
      )
    ).rows;
    const entradas = (
      await query(
        'SELECT dia_semana, hora_entrada, no_aplica FROM horarios_entrada WHERE estudiante_id = $1',
        [id]
      )
    ).rows;

    // Ordena por dia lun-vie.
    const porDia = (a, b) =>
      cfg.DIAS_SEMANA.indexOf(a.dia_semana) - cfg.DIAS_SEMANA.indexOf(b.dia_semana);
    horarios.sort(porDia);
    entradas.sort(porDia);

    res.render('admin/detalle', {
      adminUser: req.session.adminUser,
      est,
      transporte,
      horarios,
      entradas,
      utbb: cfg.UTBB,
      activo: 'listado',
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Dashboard: agregados para Chart.js
// ---------------------------------------------------------------------------
async function dashboard(req, res, next) {
  try {
    res.render('admin/dashboard', {
      adminUser: req.session.adminUser,
      utbb: cfg.UTBB,
      activo: 'dashboard',
    });
  } catch (err) {
    next(err);
  }
}

// API JSON con los datos del dashboard.
async function dashboardData(req, res, next) {
  try {
    const totalEst = (await query('SELECT COUNT(*)::int c FROM estudiantes')).rows[0].c;

    const entradasPorDia = (
      await query(
        `SELECT dia_semana,
                CASE WHEN no_aplica THEN 'no_aplica'
                     ELSE to_char(hora_entrada,'HH24:MI') END AS hora,
                COUNT(*)::int AS n
           FROM horarios_entrada
           GROUP BY dia_semana, hora
           ORDER BY dia_semana, hora`
      )
    ).rows;

    const medios = (
      await query(
        `SELECT medio_transporte AS medio, COUNT(*)::int AS n
           FROM transporte_entrada GROUP BY medio_transporte ORDER BY n DESC`
      )
    ).rows;

    const salidasPorDia = (
      await query(
        `SELECT dia_semana,
                CASE WHEN no_aplica THEN 'no_aplica'
                     ELSE to_char(hora_salida,'HH24:MI') END AS hora,
                COUNT(*)::int AS n
           FROM horarios_salida
           GROUP BY dia_semana, hora
           ORDER BY dia_semana, hora`
      )
    ).rows;

    const transbordos = (
      await query(
        `SELECT transborda, COUNT(*)::int AS n FROM transporte_entrada
          WHERE medio_transporte = 'camion' GROUP BY transborda`
      )
    ).rows;

    const usariaRuta = (
      await query(
        `SELECT COALESCE(usaria_ruta_oficial,'sin_respuesta') AS r, COUNT(*)::int AS n
           FROM transporte_entrada GROUP BY r`
      )
    ).rows;

    res.json({
      total_estudiantes: totalEst,
      entradas_por_dia: entradasPorDia,
      medios,
      salidas_por_dia: salidasPorDia,
      transbordos,
      usaria_ruta: usariaRuta,
      dias_semana: cfg.DIAS_SEMANA,
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Mapa general: todos los puntos de parada de camion
// ---------------------------------------------------------------------------
async function mapa(req, res, next) {
  try {
    res.render('admin/mapa', {
      adminUser: req.session.adminUser,
      utbb: cfg.UTBB,
      activo: 'mapa',
    });
  } catch (err) {
    next(err);
  }
}

async function mapaZonas(req, res, next) {
  try {
    const { rows } = await query(
      `SELECT
         t.vive_direccion                          AS zona,
         COUNT(*)::int                             AS total,
         AVG(t.vive_lat)                           AS lat,
         AVG(t.vive_lng)                           AS lng,
         json_agg(json_build_object(
           'id',        e.id,
           'nombre',    e.nombre_completo,
           'matricula', e.matricula,
           'carrera',   e.carrera
         ) ORDER BY e.nombre_completo)             AS estudiantes
       FROM transporte_entrada t
       JOIN estudiantes e ON e.id = t.estudiante_id
      WHERE t.vive_direccion IS NOT NULL
        AND length(trim(t.vive_direccion)) > 0
        AND t.vive_lat IS NOT NULL
      GROUP BY t.vive_direccion
      ORDER BY total DESC`
    );
    res.json({ zonas: rows });
  } catch (err) {
    next(err);
  }
}

async function mapaData(req, res, next) {
  try {
    const puntos = (
      await query(
        `SELECT e.id, e.nombre_completo, e.carrera,
                t.vive_lat AS lat, t.vive_lng AS lng, 'domicilio' AS tipo
           FROM transporte_entrada t
           JOIN estudiantes e ON e.id = t.estudiante_id
          WHERE t.vive_lat IS NOT NULL AND t.vive_lng IS NOT NULL
         UNION ALL
         SELECT e.id, e.nombre_completo, e.carrera,
                t.parada_camion_lat AS lat, t.parada_camion_lng AS lng, 'parada' AS tipo
           FROM transporte_entrada t
           JOIN estudiantes e ON e.id = t.estudiante_id
          WHERE t.parada_camion_lat IS NOT NULL AND t.parada_camion_lng IS NOT NULL
         UNION ALL
         SELECT e.id, e.nombre_completo, e.carrera,
                t.segunda_parada_lat AS lat, t.segunda_parada_lng AS lng, 'segunda' AS tipo
           FROM transporte_entrada t
           JOIN estudiantes e ON e.id = t.estudiante_id
          WHERE t.segunda_parada_lat IS NOT NULL AND t.segunda_parada_lng IS NOT NULL`
      )
    ).rows;

    // Conteo de cuantos estudiantes marcaron cada tipo de ubicacion.
    const conteo = { domicilio: 0, parada: 0, segunda: 0 };
    puntos.forEach((p) => { conteo[p.tipo] = (conteo[p.tipo] || 0) + 1; });

    res.json({ utbb: cfg.UTBB, puntos, conteo });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Exportar a CSV (respeta los filtros activos)
// ---------------------------------------------------------------------------
async function exportarCsv(req, res, next) {
  try {
    const { clause, params } = construirFiltros(req.query);
    const rows = (
      await query(
        `SELECT e.id, e.nombre_completo, e.matricula, e.correo, e.carrera,
                e.cuatrimestre, e.grupo,
                to_char(e.creado_en,'YYYY-MM-DD HH24:MI') AS creado_en,
                t.medio_transporte, t.medio_transporte_otro,
                (SELECT string_agg(
                    he.dia_semana || ':' ||
                    CASE WHEN he.no_aplica THEN 'no_aplica'
                         ELSE to_char(he.hora_entrada,'HH24:MI') END, ' | '
                    ORDER BY CASE he.dia_semana
                      WHEN 'lunes' THEN 1 WHEN 'martes' THEN 2 WHEN 'miercoles' THEN 3
                      WHEN 'jueves' THEN 4 WHEN 'viernes' THEN 5 END)
                   FROM horarios_entrada he WHERE he.estudiante_id = e.id) AS horarios_entrada,
                t.vive_direccion, t.vive_lat, t.vive_lng,
                t.parada_camion_lat, t.parada_camion_lng,
                t.transborda, t.segunda_parada_lat, t.segunda_parada_lng,
                t.usaria_ruta_oficial,
                (SELECT string_agg(
                    hs.dia_semana || ':' ||
                    CASE WHEN hs.no_aplica THEN 'no_aplica'
                         ELSE to_char(hs.hora_salida,'HH24:MI') END, ' | '
                    ORDER BY CASE hs.dia_semana
                      WHEN 'lunes' THEN 1 WHEN 'martes' THEN 2 WHEN 'miercoles' THEN 3
                      WHEN 'jueves' THEN 4 WHEN 'viernes' THEN 5 END)
                   FROM horarios_salida hs WHERE hs.estudiante_id = e.id) AS horarios_salida
           FROM estudiantes e
           LEFT JOIN transporte_entrada t ON t.estudiante_id = e.id
           ${clause}
           ORDER BY e.creado_en DESC`,
        params
      )
    ).rows;

    const csv = stringify(rows, {
      header: true,
      columns: [
        'id', 'nombre_completo', 'matricula', 'correo', 'carrera', 'cuatrimestre',
        'grupo', 'creado_en', 'medio_transporte', 'medio_transporte_otro', 'horarios_entrada',
        'vive_direccion', 'vive_lat', 'vive_lng', 'parada_camion_lat', 'parada_camion_lng',
        'transborda', 'segunda_parada_lat', 'segunda_parada_lng', 'usaria_ruta_oficial',
        'horarios_salida',
      ],
      bom: true, // para que Excel respete acentos/UTF-8
    });

    const fecha = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="encuesta_utbb_${fecha}.csv"`
    );
    res.send(csv);
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Eliminar un registro (con confirmacion en el front)
// ---------------------------------------------------------------------------
async function eliminar(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    // ON DELETE CASCADE limpia transporte_entrada y horarios_salida.
    await query('DELETE FROM estudiantes WHERE id = $1', [id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  mostrarLogin,
  procesarLogin,
  logout,
  listado,
  detalle,
  dashboard,
  dashboardData,
  mapa,
  mapaData,
  mapaZonas,
  exportarCsv,
  eliminar,
};
