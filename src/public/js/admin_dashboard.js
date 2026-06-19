/* Dashboard del admin: carga /coordinacion-utbb/dashboard/data.json y dibuja con Chart.js */
(function () {
  'use strict';

  var VERDE = '#1b7a3d';
  var PALETA = ['#1b7a3d', '#2e7d32', '#66bb6a', '#a5d6a7', '#1565c0', '#e65100', '#5e35b1', '#c0392b', '#00838f', '#f9a825'];

  var DIA_LABEL = { lunes: 'Lunes', martes: 'Martes', miercoles: 'Miercoles', jueves: 'Jueves', viernes: 'Viernes' };

  fetch('/coordinacion-utbb/dashboard/data.json', { headers: { Accept: 'application/json' } })
    .then(function (r) { return r.json(); })
    .then(render)
    .catch(function () {
      document.querySelector('.wrap').insertAdjacentHTML('beforeend',
        '<p class="vacio">No se pudieron cargar los datos del dashboard.</p>');
    });

  function render(d) {
    // KPIs
    document.getElementById('kpiTotal').textContent = d.total_estudiantes;
    var camion = (d.medios.find(function (m) { return m.medio === 'camion'; }) || { n: 0 }).n;
    document.getElementById('kpiCamion').textContent = camion;
    var transb = (d.transbordos.find(function (t) { return t.transborda === true; }) || { n: 0 }).n;
    document.getElementById('kpiTransbordo').textContent = transb;
    var rutaSi = (d.usaria_ruta.find(function (r) { return r.r === 'si'; }) || { n: 0 }).n;
    document.getElementById('kpiRutaSi').textContent = rutaSi;

    // Horas de entrada por dia (barras apiladas igual que salidas)
    entradasPorDia(d);

    // Medios (dona)
    var medioLabel = { camion: 'Camion', carro_personal: 'Carro personal', otro: 'Otro' };
    dona('chMedios', d.medios.map(function (m) { return medioLabel[m.medio] || m.medio; }),
      d.medios.map(function (m) { return m.n; }));

    // Transbordos (dona Si/No)
    var tNo = (d.transbordos.find(function (t) { return t.transborda === false; }) || { n: 0 }).n;
    dona('chTransbordo', ['Transborda', 'No transborda'], [transb, tNo]);

    // Usaria ruta (dona)
    var rutaLabel = { si: 'Si', no: 'No', tal_vez: 'Tal vez', sin_respuesta: 'Sin respuesta' };
    dona('chRuta', d.usaria_ruta.map(function (r) { return rutaLabel[r.r] || r.r; }),
      d.usaria_ruta.map(function (r) { return r.n; }));

    // Salidas por dia (barras apiladas: una serie por hora)
    salidasPorDia(d);
  }

  function barra(id, labels, datos, label, color) {
    new Chart(document.getElementById(id), {
      type: 'bar',
      data: { labels: labels, datasets: [{ label: label, data: datos, backgroundColor: color }] },
      options: { responsive: true, plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } },
    });
  }

  function dona(id, labels, datos) {
    new Chart(document.getElementById(id), {
      type: 'doughnut',
      data: { labels: labels, datasets: [{ data: datos, backgroundColor: PALETA }] },
      options: { responsive: true, plugins: { legend: { position: 'bottom' } } },
    });
  }

  function entradasPorDia(d) {
    var dias = d.dias_semana;
    var horasSet = {};
    d.entradas_por_dia.forEach(function (r) { horasSet[r.hora] = true; });
    var horas = Object.keys(horasSet).sort(function (a, b) {
      if (a === 'no_aplica') return 1;
      if (b === 'no_aplica') return -1;
      return a < b ? -1 : 1;
    });
    var datasets = horas.map(function (hora, i) {
      return {
        label: hora === 'no_aplica' ? 'No aplica' : hora,
        data: dias.map(function (dia) {
          var f = d.entradas_por_dia.find(function (r) { return r.dia_semana === dia && r.hora === hora; });
          return f ? f.n : 0;
        }),
        backgroundColor: hora === 'no_aplica' ? '#cfd8dc' : PALETA[i % PALETA.length],
      };
    });
    new Chart(document.getElementById('chEntradas'), {
      type: 'bar',
      data: { labels: dias.map(function (x) { return DIA_LABEL[x] || x; }), datasets: datasets },
      options: {
        responsive: true,
        plugins: { legend: { position: 'bottom' } },
        scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } },
      },
    });
  }

  function salidasPorDia(d) {
    var dias = d.dias_semana;
    // Reune todas las horas presentes (incluye 'no_aplica')
    var horasSet = {};
    d.salidas_por_dia.forEach(function (r) { horasSet[r.hora] = true; });
    var horas = Object.keys(horasSet).sort(function (a, b) {
      if (a === 'no_aplica') return 1;
      if (b === 'no_aplica') return -1;
      return a < b ? -1 : 1;
    });

    var datasets = horas.map(function (hora, i) {
      return {
        label: hora === 'no_aplica' ? 'No aplica' : hora,
        data: dias.map(function (dia) {
          var f = d.salidas_por_dia.find(function (r) { return r.dia_semana === dia && r.hora === hora; });
          return f ? f.n : 0;
        }),
        backgroundColor: hora === 'no_aplica' ? '#cfd8dc' : PALETA[i % PALETA.length],
      };
    });

    new Chart(document.getElementById('chSalidas'), {
      type: 'bar',
      data: { labels: dias.map(function (x) { return DIA_LABEL[x] || x; }), datasets: datasets },
      options: {
        responsive: true,
        plugins: { legend: { position: 'bottom' } },
        scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } },
      },
    });
  }
})();
