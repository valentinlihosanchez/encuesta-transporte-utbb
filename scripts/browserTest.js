'use strict';
/* Prueba headless real de la encuesta publica con el Chrome instalado.
   Recorre los 4 pasos, marca pines en el mapa, envia, y reporta errores de consola.
   No forma parte del producto; es una herramienta de verificacion (no-save). */
const puppeteer = require('puppeteer-core');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://localhost:3000';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true }); // celular

  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => pageErrors.push(e.message));

  const log = (s) => console.log(s);

  await page.goto(BASE + '/', { waitUntil: 'networkidle2' });
  log('1. Pagina cargada: ' + (await page.title()));

  // --- Paso 1 ---
  await page.type('#nombre_completo', 'Prueba Navegador Headless');
  await page.type('#matricula', 'BROW001');
  await page.type('#correo', 'prueba.headless@academica.utbb.edu.mx');
  await page.select('#carrera', 'Terapia Fisica');
  await page.select('#cuatrimestre', '7');
  await page.type('#grupo', 'B');

  // Intento avanzar con correo malo primero (validacion)
  await page.evaluate(() => { document.querySelector('#correo').value = 'malo@gmail.com'; });
  await page.click('[data-paso="1"] [data-next]');
  const bloqueadoPaso1 = await page.$eval('.paso[data-paso="1"]', (el) => el.classList.contains('activo'));
  log('2. Correo invalido bloquea avance en paso 1: ' + bloqueadoPaso1);

  // Corrijo correo y avanzo
  await page.evaluate(() => { document.querySelector('#correo').value = 'prueba.headless@academica.utbb.edu.mx'; });
  await page.click('[data-paso="1"] [data-next]');
  await new Promise((r) => setTimeout(r, 400));
  const enPaso2 = await page.$eval('.paso[data-paso="2"]', (el) => el.classList.contains('activo'));
  log('3. Avanzo a paso 2: ' + enPaso2);

  // --- Paso 2: elegir camion -> aparece mapa de parada ---
  await page.click('input[name="medio_transporte"][value="camion"]');
  await new Promise((r) => setTimeout(r, 600));
  const mapaParadaVisible = await page.$eval('#bloqueCamion', (el) => !el.classList.contains('oculto'));
  log('4. Al elegir camion aparece bloque de parada: ' + mapaParadaVisible);

  // Hora de entrada por dia: las barras tienen un valor por defecto valido (7:00).
  // Movemos la barra del lunes para verificar la interaccion del slider.
  const numCols = await page.$$eval('.entrada-col', (c) => c.length);
  await page.$eval('.entrada-col[data-dia="lunes"] input[type=range]', (s) => {
    s.value = '3'; s.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const horaLunes = await page.$eval('.entrada-col[data-dia="lunes"] .hora-val', (e) => e.textContent);
  log('4b. Hay ' + numCols + ' columnas de entrada (lun-vie); barra lunes -> ' + horaLunes);

  // Helper robusto para colocar un pin en un mapa Leaflet: lo centra en el
  // viewport, espera a que el mapa reajuste su tamano y clickea su centro real.
  async function clickMapa(sel) {
    await page.evaluate((s) => document.querySelector(s).scrollIntoView({ block: 'center' }), sel);
    await new Promise((r) => setTimeout(r, 450));
    const box = await (await page.$(sel)).boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await new Promise((r) => setTimeout(r, 400));
  }

  // Transbordo Si (ahora va primero) -> aparece segundo mapa
  await page.click('input[name="transborda"][value="si"]');
  await new Promise((r) => setTimeout(r, 600));
  const segundaVisible = await page.$eval('#bloqueSegunda', (el) => !el.classList.contains('oculto'));
  log('5. Transbordo "Si" muestra el segundo mapa: ' + segundaVisible);

  // Primer transporte
  await clickMapa('#mapaParada');
  const paradaMarcada = await page.$eval('#coordsParada', (el) => el.classList.contains('ok'));
  log('6. Pin de PRIMER transporte colocado: ' + paradaMarcada);

  // Segundo transporte
  await clickMapa('#mapaSegunda');
  const segundaMarcada = await page.$eval('#coordsSegunda', (el) => el.classList.contains('ok'));
  log('6b. Pin de SEGUNDO transporte colocado: ' + segundaMarcada);

  await page.click('input[name="usaria_ruta_oficial"][value="si"]');
  await page.click('.paso[data-paso="2"] [data-next]');
  await new Promise((r) => setTimeout(r, 400));
  const enPaso3 = await page.$eval('.paso[data-paso="3"]', (el) => el.classList.contains('activo'));
  log('7. Avanzo a paso 3 (horarios): ' + enPaso3);

  // --- Paso 3: lunes-jueves hora, viernes no aplica ---
  const dias = await page.$$('.dia-row');
  for (let i = 0; i < dias.length; i++) {
    if (i === 4) {
      await dias[i].$eval('.chk-noaplica', (c) => { c.checked = true; c.dispatchEvent(new Event('change')); });
    } else {
      await dias[i].$eval('.sel-hora', (s) => { s.value = '14:30'; });
    }
  }
  await page.click('.paso[data-paso="3"] [data-next]');
  await new Promise((r) => setTimeout(r, 400));
  const enPaso4 = await page.$eval('.paso[data-paso="4"]', (el) => el.classList.contains('activo'));
  log('8. Avanzo a paso 4 (resumen): ' + enPaso4);
  const resumenTexto = await page.$eval('#resumen', (el) => el.textContent.includes('Prueba Navegador Headless'));
  log('9. Resumen muestra los datos capturados: ' + resumenTexto);

  // --- Enviar ---
  await page.click('#btnEnviar');
  await new Promise((r) => setTimeout(r, 1200));
  const gracias = await page.$eval('.paso[data-paso="5"]', (el) => el.classList.contains('activo')).catch(() => false);
  log('10. Pantalla de agradecimiento tras enviar: ' + gracias);

  // --- Segundo recorrido: CARRO PERSONAL bloquea y envia registro minimo ---
  const page2 = await browser.newPage();
  await page2.setViewport({ width: 390, height: 844 });
  page2.on('console', (m) => { if (m.type() === 'error') consoleErrors.push('[carro] ' + m.text()); });
  page2.on('pageerror', (e) => pageErrors.push('[carro] ' + e.message));
  await page2.goto(BASE + '/', { waitUntil: 'networkidle2' });
  await page2.type('#nombre_completo', 'Carro Personal Headless');
  await page2.type('#matricula', 'BROWCAR');
  await page2.type('#correo', 'carro.headless@academica.utbb.edu.mx');
  await page2.select('#carrera', 'Contaduria');
  await page2.select('#cuatrimestre', '4');
  await page2.type('#grupo', 'C');
  await page2.click('.paso[data-paso="1"] [data-next]');
  await new Promise((r) => setTimeout(r, 400));
  await page2.click('input[name="medio_transporte"][value="carro_personal"]');
  await new Promise((r) => setTimeout(r, 300));
  const avisoVisible = await page2.$eval('#mensajeCarro', (el) => !el.classList.contains('oculto'));
  const llegadaOculta = await page2.$eval('#bloqueLlegada', (el) => el.classList.contains('oculto'));
  const botonEnviarCarro = await page2.$eval('#btnEnviarCarro', (el) => !el.classList.contains('oculto'));
  log('11. Carro personal: aviso visible=' + avisoVisible + ', resto bloqueado=' + llegadaOculta + ', boton enviar=' + botonEnviarCarro);
  await page2.click('#btnEnviarCarro');
  await new Promise((r) => setTimeout(r, 1200));
  const graciasCarro = await page2.$eval('.paso[data-paso="5"]', (el) => el.classList.contains('activo')).catch(() => false);
  log('12. Carro personal enviado, pantalla de gracias: ' + graciasCarro);

  log('--- Errores de consola del navegador: ' + consoleErrors.length);
  consoleErrors.forEach((e) => log('   [console.error] ' + e));
  log('--- Errores de pagina (JS): ' + pageErrors.length);
  pageErrors.forEach((e) => log('   [pageerror] ' + e));

  await browser.close();
  process.exit(consoleErrors.length + pageErrors.length > 0 ? 2 : 0);
})().catch((e) => { console.error('FALLO LA PRUEBA:', e.message); process.exit(1); });
