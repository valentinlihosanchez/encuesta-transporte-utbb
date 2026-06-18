'use strict';
/* Captura screenshots de evidencia con el Chrome instalado. (herramienta, no-save) */
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://localhost:3000';
const OUT = path.join(__dirname, '..', 'screenshots');

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });

  // --- Encuesta publica (celular) ---
  const mobile = await browser.newPage();
  await mobile.setViewport({ width: 390, height: 844 });
  await mobile.goto(BASE + '/', { waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 800));
  await mobile.screenshot({ path: path.join(OUT, '01_encuesta_paso1.png') });
  console.log('OK 01_encuesta_paso1.png');

  // Paso 2 con camion: muestra las barras de hora de entrada por dia
  await mobile.type('#nombre_completo', 'Ejemplo Visual');
  await mobile.type('#matricula', 'SHOT01');
  await mobile.type('#correo', 'ejemplo@academica.utbb.edu.mx');
  await mobile.select('#carrera', 'Gastronomia');
  await mobile.select('#cuatrimestre', '5');
  await mobile.type('#grupo', 'A');
  await mobile.click('.paso[data-paso="1"] [data-next]');
  await new Promise((r) => setTimeout(r, 400));
  await mobile.click('input[name="medio_transporte"][value="camion"]');
  await new Promise((r) => setTimeout(r, 700));
  // Mover varias barras a distintas alturas para mostrar el relleno verde.
  const valores = { lunes: 2, martes: 5, miercoles: 3, jueves: 7, viernes: 4 };
  for (const dia of Object.keys(valores)) {
    await mobile.$eval(
      `.entrada-col[data-dia="${dia}"] input[type=range]`,
      (s, v) => { s.value = String(v); s.dispatchEvent(new Event('input', { bubbles: true })); },
      valores[dia]
    );
  }
  await new Promise((r) => setTimeout(r, 500)); // dejar correr la animacion
  await mobile.screenshot({ path: path.join(OUT, '06_entrada_barras.png') });
  console.log('OK 06_entrada_barras.png');

  // Carro personal: aviso de bloqueo
  await mobile.click('input[name="medio_transporte"][value="carro_personal"]');
  await new Promise((r) => setTimeout(r, 400));
  await mobile.screenshot({ path: path.join(OUT, '07_carro_personal.png') });
  console.log('OK 07_carro_personal.png');

  // --- Admin: login + dashboard + mapa (escritorio) ---
  const desk = await browser.newPage();
  await desk.setViewport({ width: 1280, height: 900 });

  await desk.goto(BASE + '/admin/login', { waitUntil: 'networkidle2' });
  await desk.screenshot({ path: path.join(OUT, '02_admin_login.png') });
  console.log('OK 02_admin_login.png');

  await desk.type('#usuario', process.env.ADMIN_USER || 'admin');
  await desk.type('#password', process.env.ADMIN_PASSWORD || 'admin12345');
  await Promise.all([desk.waitForNavigation({ waitUntil: 'networkidle2' }), desk.click('button[type="submit"]')]);
  await new Promise((r) => setTimeout(r, 500));
  await desk.screenshot({ path: path.join(OUT, '03_admin_listado.png'), fullPage: true });
  console.log('OK 03_admin_listado.png');

  await desk.goto(BASE + '/admin/dashboard', { waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 1500)); // que dibujen los charts
  await desk.screenshot({ path: path.join(OUT, '04_admin_dashboard.png'), fullPage: true });
  console.log('OK 04_admin_dashboard.png');

  await desk.goto(BASE + '/admin/mapa', { waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 2000)); // que carguen tiles + clusters
  await desk.screenshot({ path: path.join(OUT, '05_admin_mapa.png') });
  console.log('OK 05_admin_mapa.png');

  await browser.close();
  console.log('Screenshots en: ' + OUT);
})().catch((e) => { console.error('FALLO:', e.message); process.exit(1); });
