'use strict';

const express = require('express');
const cfg = require('../config');

const router = express.Router();

// Pagina de la encuesta publica (formulario por pasos).
router.get('/', (req, res) => {
  res.render('encuesta', { utbb: cfg.UTBB });
});

module.exports = router;
