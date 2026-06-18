'use strict';

/**
 * Protege rutas del panel admin. Si no hay sesion, redirige al login
 * (o responde 401 si es una peticion de API/JSON).
 */
function requireAuth(req, res, next) {
  if (req.session && req.session.adminId) return next();
  // Solo respondemos 401 JSON cuando es claramente una peticion de datos
  // (endpoint .json, XHR/fetch, o el cliente prefiere JSON sobre HTML).
  // Para una navegacion normal del navegador, redirigimos al login.
  // accepts(['html','json']) devuelve el tipo preferido: 'html' para navegadores
  // y para clientes con Accept: */* (curl); 'json' solo para fetch con Accept JSON.
  const quiereJson =
    req.path.endsWith('.json') ||
    req.xhr ||
    req.accepts(['html', 'json']) === 'json';
  if (quiereJson) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  return res.redirect('/coordinacion-utbb/login');
}

module.exports = { requireAuth };
