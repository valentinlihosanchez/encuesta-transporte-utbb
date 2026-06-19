'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const { requireAuth } = require('../middlewares/auth');
const c = require('../controllers/adminController');


const router = express.Router();

// Rate-limit al login para frenar fuerza bruta.
const limiteLogin = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutos
  max: 5,                      // 5 intentos máx por IP
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // no penaliza logins correctos
  message: { error: 'Demasiados intentos fallidos. Intenta de nuevo en 15 minutos.' },
});

// ---- Autenticacion (publicas) ----
router.get('/login', c.mostrarLogin);
router.post('/login', limiteLogin, c.procesarLogin);
router.post('/logout', c.logout);
router.get('/logout', c.logout);

// ---- A partir de aqui, todo requiere sesion ----
router.use(requireAuth);

router.get('/', c.listado);
router.get('/detalle/:id', c.detalle);
router.get('/dashboard', c.dashboard);
router.get('/dashboard/data.json', c.dashboardData);
router.get('/mapa', c.mapa);
router.get('/mapa/data.json', c.mapaData);
router.get('/mapa/zonas.json', c.mapaZonas);
router.get('/export.csv', c.exportarCsv);
router.delete('/estudiante/:id', c.eliminar);

module.exports = router;
