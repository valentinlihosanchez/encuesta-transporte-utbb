'use strict';

/**
 * Configuracion y catalogos compartidos por backend y frontend.
 * Estos datos se exponen al front via /api/config para no duplicarlos.
 */

// Coordenadas de la UTBB (Blvd. Nuevo Vallarta No. 65 Poniente, Nuevo Vallarta,
// Bahia de Banderas, Nayarit, C.P. 63735). Geocodificadas una sola vez con
// Nominatim y fijadas aqui como centro por defecto de los mapas.
const UTBB = {
  nombre: 'Universidad Tecnologica de Bahia de Banderas (UTBB)',
  direccion:
    'Blvd. Nuevo Vallarta No. 65 Poniente, Nuevo Vallarta, Bahia de Banderas, Nayarit, C.P. 63735',
  // Coordenadas reales aproximadas de la UTBB (corregidas).
  lat: 20.7095371,
  lng: -105.2848148,
};

// Recuadro de busqueda para sesgar el geocoder (Nominatim) hacia la zona de la
// UTBB. Sin esto, buscar textos ambiguos (ej. "centro") manda a otros estados.
// ~0.4 grados (~44 km) alrededor de la UTBB: cubre Bahia de Banderas (Nayarit),
// Puerto Vallarta (Jalisco) y poblados aledanos (Bucerias, Mezcales, La Cruz,
// Sayulita, Valle de Banderas, etc.).
const BUSQUEDA_DELTA = 0.4;
// Formato Nominatim viewbox: min_lon, max_lat, max_lon, min_lat (izq,arriba,der,abajo).
UTBB.viewbox = [
  (UTBB.lng - BUSQUEDA_DELTA).toFixed(5),
  (UTBB.lat + BUSQUEDA_DELTA).toFixed(5),
  (UTBB.lng + BUSQUEDA_DELTA).toFixed(5),
  (UTBB.lat - BUSQUEDA_DELTA).toFixed(5),
].join(',');

// Carreras agrupadas por categoria (paso 1).
const CARRERAS = {
  Licenciaturas: [
    'Gestion y Desarrollo Turistico',
    'Gastronomia',
    'Terapia Fisica',
    'Negocios y Mercadotecnia',
    'Contaduria',
    'Medico Cirujano y Partero',
  ],
  Ingenierias: [
    'Tecnologias de la Informacion e Innovacion Digital',
    'Mantenimiento Industrial',
    'Agricultura Sustentable y Protegida',
    'Energias y Desarrollo Sostenible',
  ],
};

// Lista plana de carreras validas (para validar en el backend).
const CARRERAS_VALIDAS = Object.values(CARRERAS).flat();

// Cuatrimestres: planes de TSU+Ingenieria/Licenciatura llegan hasta 11-12.
const CUATRIMESTRES = Array.from({ length: 12 }, (_, i) => String(i + 1));

// Colonias / zonas sugeridas para el campo "Donde vives" (semilla inicial).
// La lista se autoalimenta: lo que escriben los estudiantes se agrega como
// sugerencia para los siguientes (ver /api/colonias).
const COLONIAS_SEED = [
  'El Colomo',
  'Sanju Ranch (San Juan de Abajo)',
  'Santa Fe',
  'Jardines del Sol',
  'Azul Turquesa',
  'Infonavit',
  'Las Conchas',
  'San Jose',
  'Valle de Banderas',
  'Tapachula',
  'Porvenir',
  'San Vicente',
  'Palma Real',
  'La Mision',
  'Los Angeles',
  'Altavela',
  'Mezcales',
  'TondoYork (Tondoroque)',
  'Valle Inundado (Valle Dorado)',
  'El Manguito',
  'Bucerias',
  'La Cruz',
  'Jarretaderas',
  'Costa Coral (Jarretas)',
  'Costa Coral (Valle Inundado)',
  'Las Juntas',
  'Mojoneras',
  'PitiYork',
];

const MEDIOS_TRANSPORTE = ['camion', 'carro_personal', 'otro'];
const DIAS_SEMANA = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'];
const USARIA_RUTA = ['si', 'no', 'tal_vez'];

const DOMINIO_CORREO = '@academica.utbb.edu.mx';

/**
 * Genera una lista de minutos-desde-medianoche entre [inicioMin, finMin]
 * con el intervalo dado. Funcion reutilizable (no listas a mano).
 *
 * @param {number} inicioMin minuto inicial (ej. 7*60 = 7:00)
 * @param {number} finMin    minuto limite inclusive
 * @param {number} intervalo paso en minutos
 * @returns {number[]} arreglo de minutos
 */
function generarHorarios(inicioMin, finMin, intervalo) {
  const horarios = [];
  let actual = inicioMin;
  while (actual <= finMin) {
    horarios.push(actual);
    actual += intervalo;
  }
  return horarios;
}

// Convierte minutos-desde-medianoche a "HH:MM" 24h (formato para guardar/<select value>).
function minutosA24h(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Convierte minutos-desde-medianoche a "h:MM AM/PM" (formato para mostrar).
function minutosA12h(min) {
  let h = Math.floor(min / 60);
  const m = min % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${String(m).padStart(2, '0')} ${ampm}`;
}

// Construye objetos {value:"HH:MM", label:"h:MM AM/PM"} a partir de minutos.
function aOpciones(minutosArr) {
  return minutosArr.map((min) => ({
    value: minutosA24h(min),
    label: minutosA12h(min),
  }));
}

// ---------------------------------------------------------------------------
// Horarios de ENTRADA (paso 2): inicio 7:00 am, intervalo 50 min, hasta 9:00 pm.
// generarHorarios(7*60, 21*60, 50) llega de forma natural hasta 8:20 pm (20:20),
// porque 50 no divide exacto el rango. Se agrega manualmente 9:00 pm (21:00)
// como ultima opcion fija para cubrir el limite superior solicitado, aunque no
// respete el intervalo exacto.
// ---------------------------------------------------------------------------
const HORARIOS_ENTRADA = aOpciones([
  ...generarHorarios(7 * 60, 21 * 60, 50),
  21 * 60, // 9:00 pm fijo (limite superior solicitado)
]).filter(
  // de-duplica por si el ultimo natural coincidiera con el fijo
  (opt, idx, arr) => arr.findIndex((o) => o.value === opt.value) === idx
);

// ---------------------------------------------------------------------------
// Horarios de SALIDA (paso 3, por dia): inicio 7:50 am, intervalo 50 min, hasta 11:00 pm.
// generarHorarios(7*60+50, 23*60, 50) llega de forma natural hasta 10:50 pm (22:50).
// Se agrega manualmente 11:00 pm (23:00) como ultima opcion fija para cubrir el
// limite superior solicitado, aunque no respete el intervalo exacto.
// ---------------------------------------------------------------------------
const HORARIOS_SALIDA = aOpciones([
  ...generarHorarios(7 * 60 + 50, 23 * 60, 50),
  23 * 60, // 11:00 pm fijo (limite superior solicitado)
]).filter((opt, idx, arr) => arr.findIndex((o) => o.value === opt.value) === idx);

// Conjuntos de valores validos para validar en backend.
const VALORES_HORA_ENTRADA = new Set(HORARIOS_ENTRADA.map((o) => o.value));
const VALORES_HORA_SALIDA = new Set(HORARIOS_SALIDA.map((o) => o.value));

module.exports = {
  UTBB,
  CARRERAS,
  CARRERAS_VALIDAS,
  CUATRIMESTRES,
  MEDIOS_TRANSPORTE,
  DIAS_SEMANA,
  USARIA_RUTA,
  COLONIAS_SEED,
  DOMINIO_CORREO,
  HORARIOS_ENTRADA,
  HORARIOS_SALIDA,
  VALORES_HORA_ENTRADA,
  VALORES_HORA_SALIDA,
  generarHorarios,
  minutosA24h,
  minutosA12h,
};
