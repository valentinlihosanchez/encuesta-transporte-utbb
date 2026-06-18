'use strict';

require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);

const { pool } = require('./db/pool');
const apiRoutes = require('./routes/api');
const encuestaRoutes = require('./routes/encuesta');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// ---- Vistas (EJS) ----
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ---- Parsers ----
app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: true }));

// ---- Archivos estaticos ----
app.use('/static', express.static(path.join(__dirname, 'public')));

// Favicon: "U" en verde institucional (evita el 404 de /favicon.ico).
const FAVICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
  '<rect width="64" height="64" rx="12" fill="#1b7a3d"/>' +
  '<text x="32" y="44" font-family="Arial,sans-serif" font-size="34" font-weight="bold" ' +
  'fill="#fff" text-anchor="middle">U</text></svg>';
app.get('/favicon.ico', (req, res) => {
  res.type('image/svg+xml').send(FAVICON);
});
app.get('/favicon.svg', (req, res) => {
  res.type('image/svg+xml').send(FAVICON);
});

// ---- Sesion (para el panel admin) ----
app.use(
  session({
    store: new PgSession({ pool, tableName: 'session' }),
    secret: process.env.SESSION_SECRET || 'cambia-esto',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 8, // 8 horas
    },
  })
);

// ---- Rutas ----
app.use('/api', apiRoutes);
app.use('/coordinacion-utbb', adminRoutes);
app.use('/', encuestaRoutes);

// ---- 404 ----
app.use((req, res) => {
  res.status(404);
  if (req.accepts('html')) return res.render('404');
  res.json({ error: 'No encontrado' });
});

// ---- Manejador de errores ----
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[error]', err);
  res.status(err.status || 500);
  if (req.path.startsWith('/api')) {
    return res.json({ error: 'Error interno del servidor' });
  }
  res.send('Error interno del servidor');
});

// No arrancar el servidor cuando el archivo se importa (p. ej. en pruebas).
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[server] Encuesta UTBB escuchando en http://localhost:${PORT}`);
    console.log(`[server] Encuesta publica: http://localhost:${PORT}/`);
    console.log(`[server] Panel admin:      http://localhost:${PORT}/admin`);
  });
}

module.exports = app;
