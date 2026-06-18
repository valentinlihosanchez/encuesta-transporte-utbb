-- ============================================================================
-- Encuesta de Transporte Universitario UTBB
-- Esquema de base de datos (PostgreSQL)
-- ============================================================================
-- Idempotente: se puede ejecutar varias veces sin error.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Estudiantes (registro / paso 1)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS estudiantes (
  id              SERIAL PRIMARY KEY,
  nombre_completo VARCHAR(150) NOT NULL,
  matricula       VARCHAR(30)  UNIQUE NOT NULL,
  correo          VARCHAR(150) UNIQUE NOT NULL,
  carrera         VARCHAR(100) NOT NULL,
  cuatrimestre    VARCHAR(10)  NOT NULL,
  grupo           VARCHAR(20)  NOT NULL,
  creado_en       TIMESTAMP    DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Transporte de entrada (paso 2)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transporte_entrada (
  id                    SERIAL PRIMARY KEY,
  estudiante_id         INTEGER REFERENCES estudiantes(id) ON DELETE CASCADE,
  medio_transporte      VARCHAR(20) NOT NULL,   -- camion | carro_personal | otro
  medio_transporte_otro VARCHAR(100),
  hora_entrada          TIME NOT NULL,
  vive_direccion        TEXT,
  vive_lat              DECIMAL(10,7),
  vive_lng              DECIMAL(10,7),
  parada_camion_lat     DECIMAL(10,7),
  parada_camion_lng     DECIMAL(10,7),
  transborda            BOOLEAN DEFAULT FALSE,
  segunda_parada_lat    DECIMAL(10,7),
  segunda_parada_lng    DECIMAL(10,7),
  usaria_ruta_oficial   VARCHAR(10),            -- si | no | tal_vez
  creado_en             TIMESTAMP DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Horarios de ENTRADA por dia (paso 2). La hora de entrada ahora se captura
-- por cada dia lunes-viernes (antes era un unico valor en transporte_entrada).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS horarios_entrada (
  id            SERIAL PRIMARY KEY,
  estudiante_id INTEGER REFERENCES estudiantes(id) ON DELETE CASCADE,
  dia_semana    VARCHAR(10) NOT NULL,  -- lunes | martes | miercoles | jueves | viernes
  hora_entrada  TIME,                  -- NULL si no_aplica = true
  no_aplica     BOOLEAN DEFAULT FALSE,
  UNIQUE (estudiante_id, dia_semana)
);

-- La hora_entrada unica de transporte_entrada queda obsoleta (ahora es por dia).
-- Se vuelve opcional para no romper datos existentes ni el INSERT.
ALTER TABLE transporte_entrada ALTER COLUMN hora_entrada DROP NOT NULL;

-- ---------------------------------------------------------------------------
-- Horarios de salida por dia (paso 3)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS horarios_salida (
  id            SERIAL PRIMARY KEY,
  estudiante_id INTEGER REFERENCES estudiantes(id) ON DELETE CASCADE,
  dia_semana    VARCHAR(10) NOT NULL,  -- lunes | martes | miercoles | jueves | viernes
  hora_salida   TIME,                  -- NULL si no_aplica = true
  no_aplica     BOOLEAN DEFAULT FALSE,
  UNIQUE (estudiante_id, dia_semana)
);

-- ---------------------------------------------------------------------------
-- Usuarios administradores
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_usuarios (
  id            SERIAL PRIMARY KEY,
  usuario       VARCHAR(50)  UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  creado_en     TIMESTAMP DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Sesiones (usadas por connect-pg-simple para el login del panel admin)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS session (
  sid    VARCHAR NOT NULL COLLATE "default",
  sess   JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL
)
WITH (OIDS = FALSE);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'session_pkey'
  ) THEN
    ALTER TABLE session ADD CONSTRAINT session_pkey PRIMARY KEY (sid) NOT DEFERRABLE INITIALLY IMMEDIATE;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_session_expire ON session (expire);

-- ---------------------------------------------------------------------------
-- Indices para acelerar filtros del panel admin
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_estudiantes_carrera      ON estudiantes (carrera);
CREATE INDEX IF NOT EXISTS idx_estudiantes_cuatrimestre ON estudiantes (cuatrimestre);
CREATE INDEX IF NOT EXISTS idx_estudiantes_grupo        ON estudiantes (grupo);
CREATE INDEX IF NOT EXISTS idx_estudiantes_creado_en    ON estudiantes (creado_en);
CREATE INDEX IF NOT EXISTS idx_transporte_estudiante    ON transporte_entrada (estudiante_id);
CREATE INDEX IF NOT EXISTS idx_transporte_medio         ON transporte_entrada (medio_transporte);
CREATE INDEX IF NOT EXISTS idx_horarios_estudiante      ON horarios_salida (estudiante_id);
CREATE INDEX IF NOT EXISTS idx_horarios_ent_estudiante  ON horarios_entrada (estudiante_id);
