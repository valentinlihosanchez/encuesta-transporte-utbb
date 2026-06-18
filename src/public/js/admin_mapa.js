/* Mapa general del admin: 3 capas de ubicaciones (domicilio, parada, segunda),
   cada una agrupada (clustering) y filtrable desde el panel lateral. */
(function () {
  'use strict';

  var META = {
    domicilio: { color: '#5e35b1', label: 'Donde vive' },
    parada: { color: '#1565c0', label: 'Donde toma el camion' },
    segunda: { color: '#e65100', label: 'Donde toma el 2do camion' },
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

  function render(d) {
    var map = L.map('mapaGeneral').setView([d.utbb.lat, d.utbb.lng], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; OpenStreetMap',
    }).addTo(map);

    // Marcador de la UTBB (siempre visible).
    L.circleMarker([d.utbb.lat, d.utbb.lng], {
      radius: 11, color: '#1b7a3d', fillColor: '#1b7a3d', fillOpacity: 1, weight: 2,
    }).addTo(map).bindPopup('<strong>UTBB</strong>');

    // Una capa de clustering por tipo.
    var capas = {};
    var bounds = [[d.utbb.lat, d.utbb.lng]];
    Object.keys(META).forEach(function (tipo) {
      capas[tipo] = L.markerClusterGroup({ showCoverageOnHover: false });
    });

    (d.puntos || []).forEach(function (p) {
      var meta = META[p.tipo];
      if (!meta) return;
      var lat = Number(p.lat), lng = Number(p.lng);
      var m = L.circleMarker([lat, lng], {
        radius: 8, color: meta.color, fillColor: meta.color, fillOpacity: 0.85, weight: 1,
      }).bindPopup(
        '<strong>' + escapar(p.nombre_completo) + '</strong><br>' +
        escapar(p.carrera) + '<br>' + meta.label +
        '<br><a href="/coordinacion-utbb/detalle/' + p.id + '">Ver detalle</a>'
      );
      capas[p.tipo].addLayer(m);
      bounds.push([lat, lng]);
    });

    // Agrega todas las capas al mapa (todas visibles al inicio).
    Object.keys(capas).forEach(function (tipo) { map.addLayer(capas[tipo]); });
    if (bounds.length > 1) map.fitBounds(bounds, { padding: [50, 50] });

    // Conteos en el panel.
    var conteo = d.conteo || {};
    var total = 0;
    Object.keys(META).forEach(function (tipo) {
      var n = conteo[tipo] || 0;
      total += n;
      var el = document.querySelector('[data-num="' + tipo + '"]');
      if (el) el.textContent = n;
    });
    document.getElementById('totalPuntos').textContent = total;

    // Filtros: mostrar/ocultar cada capa al marcar/desmarcar.
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
