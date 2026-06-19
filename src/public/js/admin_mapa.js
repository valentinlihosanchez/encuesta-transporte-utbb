/* Mapa general del admin: puntos por tipo + capa de zonas residenciales. */
(function () {
  'use strict';

  var META = {
    domicilio: { color: '#5e35b1', label: 'Donde vive' },
    parada:    { color: '#1565c0', label: 'Donde toma el camion' },
    segunda:   { color: '#e65100', label: 'Donde toma el 2do camion' },
  };

  fetch('/coordinacion-utbb/mapa/data.json', { headers: { Accept: 'application/json' } })
    .then(function (r) { return r.json(); })
    .then(render)
    .catch(function () {
      document.getElementById('totalPuntos').textContent = 'error';
    });

  function escapar(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Color verde claro → verde oscuro segun cantidad de estudiantes.
  function colorZona(n, max) {
    var t = max > 1 ? (n - 1) / (max - 1) : 1;
    var r = Math.round(46  + t * (21  - 46));
    var g = Math.round(204 + t * (122 - 204));
    var b = Math.round(113 + t * (61  - 113));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  function render(d) {
    var map = L.map('mapaGeneral').setView([d.utbb.lat, d.utbb.lng], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; OpenStreetMap',
    }).addTo(map);

    // Marcador fijo de la UTBB.
    L.circleMarker([d.utbb.lat, d.utbb.lng], {
      radius: 11, color: '#1b7a3d', fillColor: '#1b7a3d', fillOpacity: 1, weight: 2,
    }).addTo(map).bindPopup('<strong>UTBB</strong>');

    var capas = {};
    var bounds = [[d.utbb.lat, d.utbb.lng]];

    // ---- Capas de puntos individuales (clustering) ----
    Object.keys(META).forEach(function (tipo) {
      capas[tipo] = L.markerClusterGroup({ showCoverageOnHover: false });
    });

    (d.puntos || []).forEach(function (p) {
      var meta = META[p.tipo];
      if (!meta) return;
      var lat = Number(p.lat), lng = Number(p.lng);
      L.circleMarker([lat, lng], {
        radius: 8, color: meta.color, fillColor: meta.color, fillOpacity: 0.85, weight: 1,
      }).bindPopup(
        '<strong>' + escapar(p.nombre_completo) + '</strong><br>' +
        escapar(p.carrera) + '<br>' + meta.label +
        '<br><a href="/coordinacion-utbb/detalle/' + p.id + '">Ver detalle</a>'
      ).addTo(capas[p.tipo]);
      bounds.push([lat, lng]);
    });

    // ---- Capa de zonas residenciales ----
    capas['zonas'] = L.layerGroup();
    fetch('/coordinacion-utbb/mapa/zonas.json', { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (zd) {
        var zonas = zd.zonas || [];
        if (!zonas.length) return;
        var maxN = zonas[0].total;

        zonas.forEach(function (z) {
          if (!z.lat || !z.lng) return;
          var lat = Number(z.lat), lng = Number(z.lng);
          var color = colorZona(z.total, maxN);
          var radio = Math.max(16, Math.min(44, 16 + z.total * 5));

          var lista = (z.estudiantes || []).map(function (e) {
            return '<li><a href="/coordinacion-utbb/detalle/' + e.id + '" style="color:#1b7a3d;">' +
              escapar(e.nombre) + '</a><br><span style="color:#888;font-size:.78rem;">' +
              escapar(e.matricula) + ' · ' + escapar(e.carrera) + '</span></li>';
          }).join('');

          L.circleMarker([lat, lng], {
            radius: radio,
            color: color, fillColor: color, fillOpacity: 0.72, weight: 2,
          }).bindPopup(
            '<div style="min-width:200px">' +
            '<strong style="font-size:1rem;">' + escapar(z.zona) + '</strong><br>' +
            '<span style="color:#555;font-size:.85rem;">' + z.total +
              ' estudiante' + (z.total !== 1 ? 's' : '') + '</span>' +
            '<ul style="margin:8px 0 0;padding-left:14px;font-size:.85rem;max-height:180px;overflow-y:auto;">' +
            lista + '</ul></div>',
            { maxWidth: 300 }
          ).addTo(capas['zonas']);
          bounds.push([lat, lng]);
        });

        var el = document.querySelector('[data-num="zonas"]');
        if (el) el.textContent = zonas.length;
      })
      .catch(function () {});

    // Agrega todas las capas y ajusta la vista.
    Object.keys(capas).forEach(function (tipo) { map.addLayer(capas[tipo]); });
    if (bounds.length > 1) map.fitBounds(bounds, { padding: [50, 50] });

    // Conteos en el panel lateral.
    var conteo = d.conteo || {};
    var total = 0;
    Object.keys(META).forEach(function (tipo) {
      var n = conteo[tipo] || 0;
      total += n;
      var el = document.querySelector('[data-num="' + tipo + '"]');
      if (el) el.textContent = n;
    });
    document.getElementById('totalPuntos').textContent = total;

    // Filtros del panel lateral.
    document.querySelectorAll('.capa').forEach(function (label) {
      var tipo = label.getAttribute('data-tipo');
      var chk = label.querySelector('input[type="checkbox"]');
      chk.addEventListener('change', function () {
        if (chk.checked) map.addLayer(capas[tipo]);
        else map.removeLayer(capas[tipo]);
      });
    });
  }
})();
