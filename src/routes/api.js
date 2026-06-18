'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const cfg = require('../config');
const { enviarEncuesta, sugerenciasColonias } = require('../controllers/encuestaController');

const router = express.Router();

// Rate-limit al envio de encuesta para evitar spam/bots.
// Generoso a proposito: en el wifi del campus muchos estudiantes comparten una
// misma IP publica (NAT), asi que un limite muy bajo los bloquearia. Los envios
// duplicados ya los frena la restriccion UNIQUE de matricula/correo en la BD,
// por lo que aqui solo nos interesa frenar bots. Configurable por env.
const limiteEnvio = rateLimit({
  windowMs: Number(process.env.RATE_WINDOW_MS) || 15 * 60 * 1000,
  max: Number(process.env.RATE_MAX_ENVIOS) || 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Demasiados envios desde esta red. Intenta de nuevo en unos minutos.',
  },
});

// Catalogos y horarios para el frontend (no duplicar listas en el cliente).
router.get('/config', (req, res) => {
  res.json({
    utbb: cfg.UTBB,
    carreras: cfg.CARRERAS,
    cuatrimestres: cfg.CUATRIMESTRES,
    medios_transporte: cfg.MEDIOS_TRANSPORTE,
    dias_semana: cfg.DIAS_SEMANA,
    usaria_ruta: cfg.USARIA_RUTA,
    dominio_correo: cfg.DOMINIO_CORREO,
    horarios_entrada: cfg.HORARIOS_ENTRADA,
    horarios_salida: cfg.HORARIOS_SALIDA,
  });
});

router.get('/colonias', sugerenciasColonias);

router.post('/encuesta', limiteEnvio, enviarEncuesta);

module.exports = router;
