# Encuesta de Transporte Universitario UTBB

Aplicacion web para recolectar como se trasladan los estudiantes de la
**Universidad Tecnologica de Bahia de Banderas (UTBB)** a la universidad, con el
fin de disenar una **ruta oficial de transporte** (paradas, horarios de salida y
de regreso).

Tiene dos partes:

1. **Encuesta publica** (mobile-first) que llenan los estudiantes, con formulario
   por pasos y mapas interactivos para marcar donde toman el camion.
2. **Panel de administracion** privado para visualizar, filtrar, graficar, mapear
   y exportar todas las respuestas.

---

## Stack tecnologico

| Capa | Tecnologia |
|------|------------|
| Backend | Node.js + Express |
| Base de datos | PostgreSQL (driver `pg`, consultas parametrizadas) |
| Vistas | EJS (server-side rendering) |
| Frontend encuesta | HTML + CSS + JavaScript vanilla (mobile-first) |
| Mapas | Leaflet.js + OpenStreetMap + Nominatim (sin API key) |
| Graficas | Chart.js |
| Auth admin | Sesion (express-session + connect-pg-simple) con bcrypt |
| Clustering mapa | leaflet.markercluster |

### Decisiones tecnicas

- **`pg` en vez de Prisma.** El esquema requerido es pequeno y estable, y se pidio
  un `schema.sql` explicito. Usar el driver `pg` con **consultas parametrizadas**
  evita una capa de ORM/migraciones extra, da control total del SQL y cumple el
  esquema solicitado tal cual. Todas las consultas son parametrizadas (nunca se
  concatenan strings), lo que previene inyeccion SQL.
- **Sesion en vez de JWT.** El panel es server-side rendering; una sesion con
  cookie `httpOnly` es mas simple y segura para este caso que manejar tokens en el
  cliente. Las sesiones se guardan en la tabla `session` de PostgreSQL.
- **Leaflet + OpenStreetMap + Nominatim.** No requieren API key, ideal para este
  proyecto. Lo que se guarda en la BD es **latitud/longitud**, que es lo que sirve
  para disenar la ruta. (Si en el futuro se quisiera Google Maps por mejor
  precision de direcciones, habria que definir `GOOGLE_MAPS_API_KEY`; ver
  `.env.example`.)

---

## Plan por fases (asi se construyo)

- **Fase 1 — Base + BD.** Proyecto Express, estructura de carpetas, `docker-compose`
  para PostgreSQL, `schema.sql` y migracion. *Verificado:* la migracion crea las 5
  tablas y la estructura coincide con el esquema pedido.
- **Fase 2 — Encuesta publica.** Formulario por pasos (registro, llegada con logica
  condicional, horarios de salida), validacion de correo institucional, mapas,
  endpoint `POST /api/encuesta` con anti-duplicados y rate-limit. *Verificado:* envios
  reales insertados en las 3 tablas y confirmados por SQL; duplicados y correo no
  institucional rechazados.
- **Fase 3 — Panel admin.** Login bcrypt, tabla filtrable y paginada, detalle con
  mini-mapa, mapa general con clustering, dashboard Chart.js, export CSV, eliminar.
  *Verificado:* flujo de login (302/401), endpoints de datos, export y borrado en
  cascada.
- **Fase 4 — E2E y pulido.** Prueba headless real del formulario completo (0 errores
  de consola), prueba E2E de API, datos demo y screenshots.

---

## Requisitos

- Node.js 18+ (probado con Node 24)
- PostgreSQL 14+ **o** Docker (para levantar Postgres con `docker-compose`)

---

## Instalacion y ejecucion

### 1. Clonar e instalar dependencias

```bash
npm install
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env
# edita .env: credenciales de BD, SESSION_SECRET, ADMIN_USER, ADMIN_PASSWORD
```

Genera un `SESSION_SECRET` seguro:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### 3. Levantar PostgreSQL

**Opcion A — Docker (recomendada para empezar rapido):**

```bash
docker compose up -d
```

Esto crea la base `encuesta_transporte` (usuario `utbb` / contrasena `utbb`) y
**ejecuta automaticamente** `migrations/schema.sql` la primera vez.

**Opcion B — PostgreSQL local ya instalado:**

Crea la base y el usuario (ajusta a tu instalacion), apunta `DATABASE_URL` en `.env`
y corre la migracion manualmente:

```bash
npm run migrate
```

### 4. Crear el usuario administrador

```bash
npm run seed:admin     # usa ADMIN_USER / ADMIN_PASSWORD de .env
```

### 5. (Opcional) Cargar datos de demostracion

```bash
npm run seed:demo      # 10 estudiantes de ejemplo de la zona Bahia de Banderas
```

### 6. Arrancar el servidor

```bash
npm run dev            # con recarga (nodemon)
# o
npm start
```

- Encuesta publica: <http://localhost:3000/>
- Panel admin: <http://localhost:3000/admin>

---

## Scripts disponibles

| Script | Descripcion |
|--------|-------------|
| `npm run dev` | Servidor con recarga (nodemon) |
| `npm start` | Servidor en produccion |
| `npm run migrate` | Aplica `migrations/schema.sql` |
| `npm run seed:admin` | Crea/actualiza el admin |
| `npm run seed:demo` | Inserta datos de demostracion |
| `npm run test:e2e` | Prueba E2E de API (servidor debe estar corriendo) |
| `npm run test:browser` | Prueba headless del formulario (requiere Chrome) |

> Las pruebas headless usan `puppeteer-core` apuntando al Chrome ya instalado; no
> forman parte de las dependencias de produccion (se instalan con `--no-save`).

---

## Esquema de la base de datos

`migrations/schema.sql` (idempotente) crea:

- **`estudiantes`** — datos del estudiante (matricula y correo `UNIQUE`).
- **`transporte_entrada`** — medio de transporte, domicilio, parada(s) de camion
  (lat/lng), transbordo, y si usaria la ruta oficial.
- **`horarios_entrada`** — hora de entrada por dia (lun-vie), con `no_aplica`
  (`UNIQUE(estudiante_id, dia_semana)`).
- **`horarios_salida`** — hora de salida por dia (lun-vie), con `no_aplica`
  (`UNIQUE(estudiante_id, dia_semana)`).
- **`admin_usuarios`** — usuarios del panel (hash bcrypt).
- **`session`** — sesiones del panel (gestionada por connect-pg-simple).

Las tablas hijas usan `ON DELETE CASCADE`, asi que borrar un estudiante limpia
sus respuestas automaticamente.

---

## Logica de horarios

Los horarios **no se escriben a mano**; se generan con `generarHorarios(inicio, fin,
intervalo)` en `src/config.js`:

- **Entrada (paso 2):** desde 7:00 am cada 50 min. El ultimo valor natural cae en
  8:20 pm; se agrega manualmente **9:00 pm** como opcion final para cubrir el limite
  superior pedido. La hora de entrada se captura **por cada dia (lun-vie)** mediante
  una barra deslizable por dia (con opcion "No aplica").
- **Salida (paso 3):** desde 7:50 am cada 50 min. El ultimo valor natural cae en
  10:50 pm; se agrega manualmente **11:00 pm** como opcion final. Tambien por dia.

El criterio esta documentado con comentarios en `src/config.js`.

## Flujo segun el medio de transporte

- **Camion / transporte publico:** responde hora de entrada por dia, domicilio
  (opcional), parada(s) de camion en el mapa, transbordo y horarios de salida.
- **Otro** (bici, moto, caminando): igual que camion pero sin parada de camion.
- **Carro personal:** la encuesta esta dirigida a quienes usarian el transporte
  oficial, asi que al elegir carro personal **se bloquea el resto** y se muestra un
  aviso. Solo se guarda el registro y el medio (para tener el conteo de cuantos
  estudiantes llegan en carro propio).

---

## Seguridad

- Credenciales y secretos en `.env` (nunca hardcodeados); ver `.env.example`.
- Contrasenas de admin con **bcrypt** (cost 12).
- Todas las rutas `/admin/*` protegidas por middleware de sesion.
- **Consultas parametrizadas** en todo el acceso a BD (sin concatenacion de SQL).
- Validacion y normalizacion de toda entrada del usuario en el backend.
- **Rate-limiting** en el envio de la encuesta y en el login. El limite de la
  encuesta es generoso a proposito porque en el wifi del campus muchos estudiantes
  comparten una IP (NAT); los duplicados ya los frena la restriccion `UNIQUE`.

---

## Estructura del proyecto

```
src/
  config.js              catalogos y generacion de horarios (compartido)
  server.js              app Express
  db/pool.js             pool de PostgreSQL + helper de transaccion
  routes/                api (config + envio), encuesta (publica), admin
  controllers/           logica de encuesta y de admin
  middlewares/auth.js    proteccion de /admin
  public/                CSS y JS del front (encuesta + admin)
  views/                 plantillas EJS (encuesta, admin, parciales)
migrations/schema.sql    esquema de la base de datos
scripts/                 migrate, seed:admin, seed:demo, pruebas
docker-compose.yml       PostgreSQL local
.env.example             plantilla de variables de entorno
```
