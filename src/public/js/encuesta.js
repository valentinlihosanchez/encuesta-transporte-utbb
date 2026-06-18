/* Encuesta de Transporte UTBB - logica del formulario por pasos + mapas Leaflet */
(function () {
  'use strict';

  var CONFIG = null;
  var pasoActual = 1;
  var TOTAL_PASOS = 4;

  // Estado de los mapas (lat/lng marcados)
  var ubic = {
    domicilio: { lat: null, lng: null },
    parada: { lat: null, lng: null },
    segunda: { lat: null, lng: null },
  };
  var mapas = {}; // referencias Leaflet inicializadas perezosamente

  var $ = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };

  // ------------------------------------------------------------------
  // Arranque: cargar catalogos y poblar selects
  // ------------------------------------------------------------------
  fetch('/api/config')
    .then(function (r) { return r.json(); })
    .then(function (cfg) { CONFIG = cfg; init(); })
    .catch(function () {
      mostrarBanner(['No se pudo cargar la encuesta. Revisa tu conexion y recarga la pagina.']);
    });

  function init() {
    poblarCarreras();
    poblarSelect($('#cuatrimestre'), CONFIG.cuatrimestres.map(function (c) {
      return { value: c, label: c + '°' };
    }));
    construirEntradaDias();
    construirDias();
    cargarColonias();
    enlazarEventos();
    actualizarProgreso();
  }

  // Carga las sugerencias de colonias (semilla + las ya escritas por estudiantes)
  // y las pone en el datalist del campo "Donde vives".
  function cargarColonias() {
    fetch('/api/colonias')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var dl = $('#listaColonias');
        if (!dl || !data.colonias) return;
        dl.innerHTML = '';
        data.colonias.forEach(function (c) {
          var o = document.createElement('option');
          o.value = c;
          dl.appendChild(o);
        });
      })
      .catch(function () { /* si falla, el campo sigue siendo texto libre */ });
  }

  // Paso 2: hora de entrada por dia (lun-vie) con barra vertical ancha, con
  // relleno verde que sube y sin el "circulito" (thumb nativo oculto).
  function construirEntradaDias() {
    var cont = $('#entradaDiasContenedor');
    var opciones = CONFIG.horarios_entrada; // [{value,label}]
    var maxIdx = opciones.length - 1;

    CONFIG.dias_semana.forEach(function (dia) {
      var col = document.createElement('div');
      col.className = 'entrada-col';
      col.setAttribute('data-dia', dia);

      var nombre = document.createElement('div');
      nombre.className = 'dia';
      nombre.textContent = dia.slice(0, 3); // lun, mar, mie...

      var val = document.createElement('div');
      val.className = 'hora-val';
      val.textContent = opciones[0].label;

      // Barra: pista + relleno + asa plana + input transparente encima.
      var barra = document.createElement('div');
      barra.className = 'barra';
      var fill = document.createElement('div');
      fill.className = 'barra-fill';
      var handle = document.createElement('div');
      handle.className = 'barra-handle';

      var slider = document.createElement('input');
      slider.type = 'range';
      slider.className = 'vert';
      slider.min = '0';
      slider.max = String(maxIdx);
      slider.step = '1';
      slider.value = '0';
      slider.setAttribute('aria-label', 'Hora de entrada ' + dia);

      function pintar(animar) {
        var pct = maxIdx === 0 ? 0 : (Number(slider.value) / maxIdx) * 100;
        barra.style.setProperty('--pct', pct + '%');
        val.textContent = opciones[Number(slider.value)].label;
        if (animar) {
          // pequeno "pop" del valor al moverse
          val.classList.remove('pop');
          // reflow para reiniciar la animacion
          void val.offsetWidth;
          val.classList.add('pop');
        }
      }

      slider.addEventListener('input', function () { pintar(true); });

      barra.appendChild(fill);
      barra.appendChild(handle);
      barra.appendChild(slider);

      var noap = document.createElement('label');
      noap.className = 'noap';
      var chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.className = 'chk-noaplica-ent';
      noap.appendChild(chk);
      noap.appendChild(document.createTextNode(' No aplica'));

      chk.addEventListener('change', function () {
        col.classList.toggle('inactiva', chk.checked);
        slider.disabled = chk.checked;
      });

      col.appendChild(nombre);
      col.appendChild(val);
      col.appendChild(barra);
      col.appendChild(noap);
      cont.appendChild(col);

      pintar(false); // estado inicial
    });
  }

  function poblarCarreras() {
    var sel = $('#carrera');
    Object.keys(CONFIG.carreras).forEach(function (grupo) {
      var og = document.createElement('optgroup');
      og.label = grupo;
      CONFIG.carreras[grupo].forEach(function (c) {
        var o = document.createElement('option');
        o.value = c; o.textContent = c;
        og.appendChild(o);
      });
      sel.appendChild(og);
    });
  }

  function poblarSelect(sel, opciones) {
    opciones.forEach(function (o) {
      var op = document.createElement('option');
      op.value = o.value; op.textContent = o.label;
      sel.appendChild(op);
    });
  }

  // Paso 3: una fila por dia con su select de horario + checkbox "no aplica"
  function construirDias() {
    var cont = $('#diasContenedor');
    CONFIG.dias_semana.forEach(function (dia) {
      var row = document.createElement('div');
      row.className = 'dia-row';
      row.setAttribute('data-dia', dia);

      var nombre = document.createElement('div');
      nombre.className = 'dia-nombre';
      nombre.textContent = dia;

      var sel = document.createElement('select');
      sel.className = 'sel-hora';
      sel.innerHTML = '<option value="">Hora de salida...</option>';
      CONFIG.horarios_salida.forEach(function (o) {
        var op = document.createElement('option');
        op.value = o.value; op.textContent = o.label;
        sel.appendChild(op);
      });

      var noap = document.createElement('label');
      noap.className = 'noaplica';
      var chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.className = 'chk-noaplica';
      noap.appendChild(chk);
      noap.appendChild(document.createTextNode(' No tengo clases / no aplica'));

      chk.addEventListener('change', function () {
        sel.disabled = chk.checked;
        if (chk.checked) sel.value = '';
      });

      row.appendChild(nombre);
      row.appendChild(sel);
      row.appendChild(noap);
      cont.appendChild(row);
    });
  }

  // ------------------------------------------------------------------
  // Navegacion entre pasos
  // ------------------------------------------------------------------
  function enlazarEventos() {
    $$('[data-next]').forEach(function (b) {
      b.addEventListener('click', function () { siguiente(); });
    });
    $$('[data-prev]').forEach(function (b) {
      b.addEventListener('click', function () { anterior(); });
    });

    // Resaltar opciones tipo tarjeta
    $$('.opciones').forEach(function (grupo) {
      grupo.addEventListener('change', function () {
        $$('.opcion', grupo).forEach(function (op) {
          var input = $('input', op);
          op.classList.toggle('sel', input.checked);
        });
      });
    });

    // Logica condicional del medio de transporte
    $$('input[name="medio_transporte"]').forEach(function (r) {
      r.addEventListener('change', onMedioChange);
    });
    $$('input[name="transborda"]').forEach(function (r) {
      r.addEventListener('change', onTransbordaChange);
    });

    // Buscadores de direccion (Nominatim)
    $('#btnBuscarDomicilio').addEventListener('click', function () {
      buscarDireccion($('#buscarDomicilio').value, 'domicilio');
    });
    $('#btnBuscarParada').addEventListener('click', function () {
      buscarDireccion($('#buscarParada').value, 'parada');
    });
    $('#btnBuscarSegunda').addEventListener('click', function () {
      buscarDireccion($('#buscarSegunda').value, 'segunda');
    });

    $('#formEncuesta').addEventListener('submit', onSubmit);

    // Boton de envio directo para carro personal (omite pasos 3 y 4).
    $('#btnEnviarCarro').addEventListener('click', function () { enviar(true); });

    // Quitar marca de error al editar
    $$('#formEncuesta input, #formEncuesta select').forEach(function (el) {
      el.addEventListener('input', function () {
        var campo = el.closest('.campo');
        if (campo) campo.classList.remove('invalido');
      });
    });
  }

  function onMedioChange() {
    var val = ($('input[name="medio_transporte"]:checked') || {}).value;
    var esCarro = val === 'carro_personal';
    var usaTransporte = val === 'camion' || val === 'otro';

    $('#campoOtro').classList.toggle('oculto', val !== 'otro');

    // Carro personal: bloquear el resto y mostrar el aviso. La encuesta es para
    // quienes usarian el transporte oficial.
    $('#mensajeCarro').classList.toggle('oculto', !esCarro);
    $('#bloqueLlegada').classList.toggle('oculto', !usaTransporte);

    // Cambiar el boton: "Continuar" (camion/otro) vs "Enviar respuesta" (carro).
    $('#btnContinuar2').classList.toggle('oculto', esCarro);
    $('#btnEnviarCarro').classList.toggle('oculto', !esCarro);

    // Camion: mostrar e inicializar el mapa de parada.
    $('#bloqueCamion').classList.toggle('oculto', val !== 'camion');
    if (usaTransporte) {
      setTimeout(function () { initMapa('domicilio', 'mapaDomicilio', 'coordsDomicilio'); }, 60);
    }
    if (val === 'camion') {
      setTimeout(function () { initMapa('parada', 'mapaParada', 'coordsParada'); }, 80);
    }
  }

  function onTransbordaChange() {
    var val = ($('input[name="transborda"]:checked') || {}).value;
    var mostrar = val === 'si';
    $('#bloqueSegunda').classList.toggle('oculto', !mostrar);
    if (mostrar) {
      setTimeout(function () { initMapa('segunda', 'mapaSegunda', 'coordsSegunda'); }, 50);
    }
  }

  function siguiente() {
    if (!validarPaso(pasoActual)) return;
    if (pasoActual < TOTAL_PASOS) {
      irAPaso(pasoActual + 1);
      if (pasoActual === 4) construirResumen();
    }
  }
  function anterior() {
    if (pasoActual > 1) irAPaso(pasoActual - 1);
  }

  function irAPaso(n) {
    pasoActual = n;
    $$('.paso').forEach(function (s) {
      s.classList.toggle('activo', Number(s.getAttribute('data-paso')) === n);
    });
    actualizarProgreso();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    // Los mapas del paso 2 se inicializan al elegir el medio (onMedioChange),
    // porque viven dentro de #bloqueLlegada, oculto hasta entonces.
  }

  function actualizarProgreso() {
    $('#progresoBarra').style.width = (pasoActual / TOTAL_PASOS) * 100 + '%';
    $$('.paso-num').forEach(function (p) {
      var n = Number(p.getAttribute('data-paso'));
      p.classList.toggle('activo', n === pasoActual);
      p.classList.toggle('completo', n < pasoActual);
    });
  }

  // ------------------------------------------------------------------
  // Validacion por paso
  // ------------------------------------------------------------------
  function marcarError(field, on) {
    var campo = document.querySelector('.campo[data-field="' + field + '"]');
    if (campo) campo.classList.toggle('invalido', !!on);
  }

  function validarPaso(n) {
    limpiarBanner();
    var errs = [];

    if (n === 1) {
      var nombre = $('#nombre_completo').value.trim();
      var matricula = $('#matricula').value.trim();
      var correo = $('#correo').value.trim().toLowerCase();
      var carrera = $('#carrera').value;
      var cuatri = $('#cuatrimestre').value;
      var grupo = $('#grupo').value.trim();

      marcarError('nombre_completo', nombre.length < 3); if (nombre.length < 3) errs.push('nombre');
      marcarError('matricula', !matricula); if (!matricula) errs.push('matricula');
      var correoOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo) && correo.endsWith(CONFIG.dominio_correo);
      marcarError('correo', !correoOk); if (!correoOk) errs.push('correo');
      marcarError('carrera', !carrera); if (!carrera) errs.push('carrera');
      marcarError('cuatrimestre', !cuatri); if (!cuatri) errs.push('cuatrimestre');
      marcarError('grupo', !grupo); if (!grupo) errs.push('grupo');
    }

    if (n === 2) {
      var medio = ($('input[name="medio_transporte"]:checked') || {}).value;
      marcarError('medio_transporte', !medio); if (!medio) errs.push('medio');

      if (medio === 'otro') {
        var otro = $('#medio_transporte_otro').value.trim();
        marcarError('medio_transporte_otro', !otro); if (!otro) errs.push('otro');
      }
      // La hora de entrada por dia se elige con barras (siempre tienen un valor
      // valido) o se marca "no aplica", asi que no requiere validacion extra.

      if (medio === 'camion') {
        var sinParada = ubic.parada.lat == null;
        marcarError('parada_camion', sinParada); if (sinParada) errs.push('parada');
        var transb = ($('input[name="transborda"]:checked') || {}).value === 'si';
        if (transb) {
          var sinSeg = ubic.segunda.lat == null;
          marcarError('segunda_parada', sinSeg); if (sinSeg) errs.push('segunda');
        }
      }
    }

    if (n === 3) {
      $$('.dia-row').forEach(function (row) {
        var chk = $('.chk-noaplica', row);
        var sel = $('.sel-hora', row);
        if (!chk.checked && !sel.value) {
          row.style.background = 'var(--error-bg)';
          errs.push('dia-' + row.getAttribute('data-dia'));
        } else {
          row.style.background = '';
        }
      });
    }

    if (errs.length) {
      mostrarBanner(['Revisa los campos marcados antes de continuar.']);
      var primer = document.querySelector('.campo.invalido') || document.querySelector('.dia-row');
      if (primer) primer.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return false;
    }
    return true;
  }

  // ------------------------------------------------------------------
  // Mapas (Leaflet + OSM + Nominatim)
  // ------------------------------------------------------------------
  function initMapa(key, divId, coordsId) {
    if (mapas[key]) { mapas[key].invalidateSize(); return; }
    var centro = [CONFIG.utbb.lat, CONFIG.utbb.lng];
    var map = L.map(divId).setView(centro, 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);

    // Marcador de referencia de la UTBB
    L.marker(centro, { opacity: 0.6 })
      .addTo(map)
      .bindPopup('UTBB (universidad)');

    var marker = null;
    function setPin(latlng) {
      if (!marker) {
        marker = L.marker(latlng, { draggable: true }).addTo(map);
        marker.on('dragend', function (e) {
          var p = e.target.getLatLng();
          guardarUbic(key, p.lat, p.lng, coordsId);
        });
      } else {
        marker.setLatLng(latlng);
      }
      guardarUbic(key, latlng.lat, latlng.lng, coordsId);
    }

    map.on('click', function (e) { setPin(e.latlng); });
    mapas[key] = map;
    mapas[key]._setPin = setPin;
    setTimeout(function () { map.invalidateSize(); }, 100);
  }

  function guardarUbic(key, lat, lng, coordsId) {
    ubic[key].lat = Number(lat.toFixed(7));
    ubic[key].lng = Number(lng.toFixed(7));
    var el = document.getElementById(coordsId);
    el.textContent = 'Ubicacion marcada: ' + ubic[key].lat + ', ' + ubic[key].lng;
    el.classList.add('ok');
    var campo = el.closest('.campo');
    if (campo) campo.classList.remove('invalido');
  }

  function buscarDireccion(texto, key) {
    texto = (texto || '').trim();
    if (!texto) return;
    // viewbox + bounded=1 limita la busqueda al recuadro de la zona de la UTBB,
    // para que textos ambiguos no salten a otros estados. limit=5 para tener
    // alternativas dentro de la zona.
    var base = 'https://nominatim.openstreetmap.org/search?format=json&countrycodes=mx' +
      '&viewbox=' + encodeURIComponent(CONFIG.utbb.viewbox);

    function buscar(bounded) {
      var url = base + (bounded ? '&bounded=1' : '') + '&limit=5&q=' + encodeURIComponent(texto);
      return fetch(url, { headers: { 'Accept-Language': 'es' } }).then(function (r) { return r.json(); });
    }

    // Primero restringido a la zona; si no hay nada, reintenta solo sesgado (sin
    // bounded) pero priorizando el resultado mas cercano a la UTBB.
    buscar(true)
      .then(function (res) {
        if (res && res.length) return res;
        return buscar(false).then(function (res2) { return filtrarCercanos(res2); });
      })
      .then(function (res) {
        if (!res || !res.length) {
          alert('No se encontro esa direccion cerca de la universidad. Coloca el pin manualmente en el mapa.');
          return;
        }
        var lat = parseFloat(res[0].lat), lng = parseFloat(res[0].lon);
        var map = mapas[key];
        if (map) {
          map.setView([lat, lng], 15);
          map._setPin({ lat: lat, lng: lng });
        }
      })
      .catch(function () { alert('No se pudo buscar la direccion en este momento.'); });
  }

  // Ordena resultados por cercania a la UTBB y descarta los muy lejanos (>60 km).
  function filtrarCercanos(res) {
    if (!res) return [];
    var u = CONFIG.utbb;
    return res
      .map(function (r) {
        var dLat = parseFloat(r.lat) - u.lat;
        var dLng = parseFloat(r.lon) - u.lng;
        r._dist = Math.sqrt(dLat * dLat + dLng * dLng);
        return r;
      })
      .filter(function (r) { return r._dist < 0.6; }) // ~60 km
      .sort(function (a, b) { return a._dist - b._dist; });
  }

  // ------------------------------------------------------------------
  // Resumen (paso 4)
  // ------------------------------------------------------------------
  function etiquetaMedio(v) {
    return { camion: 'Camion / transporte publico', carro_personal: 'Carro personal', otro: 'Otro' }[v] || v;
  }
  function etiquetaHora(valor, lista) {
    var f = lista.find(function (o) { return o.value === valor; });
    return f ? f.label : valor;
  }
  function etiquetaRuta(v) {
    return { si: 'Si', no: 'No', tal_vez: 'Tal vez' }[v] || 'Sin respuesta';
  }

  function construirResumen() {
    var medio = ($('input[name="medio_transporte"]:checked') || {}).value;
    var transb = ($('input[name="transborda"]:checked') || {}).value === 'si';
    var ruta = ($('input[name="usaria_ruta_oficial"]:checked') || {}).value;

    var html = '';
    html += grupoResumen('Registro', [
      ['Nombre', $('#nombre_completo').value],
      ['Matricula', $('#matricula').value],
      ['Correo', $('#correo').value],
      ['Carrera', $('#carrera').value],
      ['Cuatrimestre', $('#cuatrimestre').value + '°'],
      ['Grupo', $('#grupo').value],
    ]);

    var llegada = [
      ['Medio', etiquetaMedio(medio) + (medio === 'otro' ? ' (' + $('#medio_transporte_otro').value + ')' : '')],
    ];
    // Hora de entrada por dia
    var entrada = leerEntradaDias();
    CONFIG.dias_semana.forEach(function (dia) {
      var e = entrada[dia];
      var val = e.no_aplica ? 'No aplica' : etiquetaHora(e.hora_entrada, CONFIG.horarios_entrada);
      llegada.push(['Entrada ' + dia, val]);
    });
    if ($('#vive_direccion').value) llegada.push(['Domicilio', $('#vive_direccion').value]);
    if (ubic.domicilio.lat != null) llegada.push(['Pin domicilio', ubic.domicilio.lat + ', ' + ubic.domicilio.lng]);
    if (medio === 'camion') {
      llegada.push(['Transborda', transb ? 'Si' : 'No']);
      llegada.push(['Primer transporte', ubic.parada.lat + ', ' + ubic.parada.lng]);
      if (transb) llegada.push(['Segundo transporte', ubic.segunda.lat + ', ' + ubic.segunda.lng]);
    }
    llegada.push(['Usaria ruta oficial', etiquetaRuta(ruta)]);
    html += grupoResumen('Como llega', llegada);

    var salidas = $$('.dia-row').map(function (row) {
      var dia = row.getAttribute('data-dia');
      var chk = $('.chk-noaplica', row);
      var sel = $('.sel-hora', row);
      var val = chk.checked ? 'No aplica' : etiquetaHora(sel.value, CONFIG.horarios_salida);
      return [dia.charAt(0).toUpperCase() + dia.slice(1), val];
    });
    html += grupoResumen('Horarios de salida', salidas);

    $('#resumen').innerHTML = html;
  }

  function grupoResumen(titulo, items) {
    var h = '<div class="resumen-grupo"><h3>' + titulo + '</h3>';
    items.forEach(function (it) {
      h += '<div class="resumen-item"><span class="k">' + escapar(it[0]) +
        '</span><span class="v">' + escapar(it[1] || '-') + '</span></div>';
    });
    return h + '</div>';
  }

  function escapar(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ------------------------------------------------------------------
  // Envio
  // ------------------------------------------------------------------
  // Lee la hora de entrada por dia desde las barras verticales.
  function leerEntradaDias() {
    var entrada = {};
    $$('.entrada-col').forEach(function (col) {
      var dia = col.getAttribute('data-dia');
      var chk = $('.chk-noaplica-ent', col);
      var slider = $('input[type="range"]', col);
      if (chk.checked) {
        entrada[dia] = { no_aplica: true, hora_entrada: null };
      } else {
        var opt = CONFIG.horarios_entrada[Number(slider.value)];
        entrada[dia] = { no_aplica: false, hora_entrada: opt.value };
      }
    });
    return entrada;
  }

  function leerSalidaDias() {
    var horarios = {};
    $$('.dia-row').forEach(function (row) {
      var dia = row.getAttribute('data-dia');
      var chk = $('.chk-noaplica', row);
      var sel = $('.sel-hora', row);
      horarios[dia] = chk.checked
        ? { no_aplica: true, hora_salida: null }
        : { no_aplica: false, hora_salida: sel.value };
    });
    return horarios;
  }

  function recopilar() {
    var medio = ($('input[name="medio_transporte"]:checked') || {}).value;

    // Datos base (siempre presentes).
    var payload = {
      nombre_completo: $('#nombre_completo').value.trim(),
      matricula: $('#matricula').value.trim(),
      correo: $('#correo').value.trim().toLowerCase(),
      carrera: $('#carrera').value,
      cuatrimestre: $('#cuatrimestre').value,
      grupo: $('#grupo').value.trim(),
      medio_transporte: medio,
    };

    // Carro personal: la encuesta termina aqui; solo registro + medio.
    if (medio === 'carro_personal') return payload;

    var transb = ($('input[name="transborda"]:checked') || {}).value === 'si';
    payload.medio_transporte_otro = medio === 'otro' ? $('#medio_transporte_otro').value.trim() : null;
    payload.vive_direccion = $('#vive_direccion').value.trim() || null;
    payload.vive_lat = ubic.domicilio.lat;
    payload.vive_lng = ubic.domicilio.lng;
    payload.usaria_ruta_oficial = ($('input[name="usaria_ruta_oficial"]:checked') || {}).value || null;
    payload.horarios_entrada = leerEntradaDias();
    payload.horarios_salida = leerSalidaDias();

    if (medio === 'camion') {
      payload.parada_camion_lat = ubic.parada.lat;
      payload.parada_camion_lng = ubic.parada.lng;
      payload.transborda = transb;
      if (transb) {
        payload.segunda_parada_lat = ubic.segunda.lat;
        payload.segunda_parada_lng = ubic.segunda.lng;
      }
    }
    return payload;
  }

  function onSubmit(e) {
    e.preventDefault();
    enviar(false);
  }

  // Envia la encuesta. esCarro=true viene del boton del paso 2 (carro personal),
  // que omite los pasos 3 y 4; el flujo normal valida el paso 4 antes de enviar.
  function enviar(esCarro) {
    if (!esCarro && !validarPaso(4)) return;
    var btn = esCarro ? $('#btnEnviarCarro') : $('#btnEnviar');
    var textoOriginal = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Enviando...';

    fetch('/api/encuesta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(recopilar()),
    })
      .then(function (r) { return r.json().then(function (j) { return { status: r.status, body: j }; }); })
      .then(function (res) {
        if (res.status === 201) {
          $('#formEncuesta').classList.add('oculto');
          $('.progreso-wrap').classList.add('oculto');
          irAPaso(5);
          $$('.paso').forEach(function (s) {
            s.classList.toggle('activo', s.getAttribute('data-paso') === '5');
          });
        } else {
          var msgs = (res.body && res.body.errores) || [res.body.error || 'No se pudo enviar.'];
          mostrarBanner(msgs);
          btn.disabled = false;
          btn.textContent = textoOriginal;
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      })
      .catch(function () {
        mostrarBanner(['Error de conexion al enviar. Intenta de nuevo.']);
        btn.disabled = false;
        btn.textContent = textoOriginal;
      });
  }

  // ------------------------------------------------------------------
  // Banner de errores
  // ------------------------------------------------------------------
  function mostrarBanner(lista) {
    var b = $('#bannerError');
    b.innerHTML = '<strong>Atencion:</strong><ul>' +
      lista.map(function (m) { return '<li>' + escapar(m) + '</li>'; }).join('') + '</ul>';
    b.classList.add('show');
  }
  function limpiarBanner() { $('#bannerError').classList.remove('show'); }
})();
