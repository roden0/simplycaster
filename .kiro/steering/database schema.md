-- ============================================================================
-- SimplyCaster PostgreSQL 18 Schema
-- Corregido según mejores prácticas y errores identificados
-- ============================================================================

-- Configuración inicial
SET timezone = 'UTC';
SET client_encoding = 'UTF8';

-- ============================================================================
-- EXTENSIONES
-- ============================================================================

-- pgcrypto para funciones criptográficas (gen_random_bytes, etc.)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- pg_trgm para búsquedas de texto difusas (LIKE optimizado, similarity)
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================================
-- ENUM TYPES
-- ============================================================================

CREATE TYPE user_role AS ENUM ('guest', 'host', 'admin');
CREATE TYPE room_status AS ENUM ('waiting', 'active', 'recording', 'closed');
CREATE TYPE recording_status AS ENUM ('recording', 'uploading', 'processing', 'completed', 'failed');
CREATE TYPE invitation_status AS ENUM ('pending', 'accepted', 'expired', 'revoked');

-- ============================================================================
-- TABLA: users
-- Usuarios permanentes del sistema (Host y Admin)
-- Guest se maneja en tabla separada por su naturaleza temporal
-- ============================================================================

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(7), -- UUID v7 nativo en PostgreSQL 18
    email VARCHAR(255) NOT NULL,
    
    -- Autenticación: salt (per-user) + pepper (global, en ENV)
    -- password_hash = argon2id(password + pepper, salt)
    password_hash VARCHAR(255), -- NULL cuando pendiente de activación
    password_salt VARCHAR(255), -- salt único por usuario (base64, 32 bytes)
    
    role user_role NOT NULL DEFAULT 'host',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Seguridad adicional
    failed_login_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    last_login_at TIMESTAMPTZ,
    last_login_ip INET,
    
    -- Auditoría
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID, -- FK agregada después para evitar dependencia circular
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ, -- soft delete
    
    -- Constraints
    CONSTRAINT users_role_check CHECK (role IN ('host', 'admin')),
    CONSTRAINT users_email_format CHECK (email ~* '^[^@]+@[^@]+\.[^@]+$'),
    CONSTRAINT users_failed_attempts_check CHECK (failed_login_attempts >= 0),
    CONSTRAINT users_password_complete CHECK (
        (password_hash IS NULL AND password_salt IS NULL) OR 
        (password_hash IS NOT NULL AND password_salt IS NOT NULL)
    )
);

-- FK circular para created_by
ALTER TABLE users ADD CONSTRAINT users_created_by_fkey 
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

-- Índice único parcial para email (soft delete compatible)
CREATE UNIQUE INDEX idx_users_email_unique ON users(LOWER(email)) 
    WHERE deleted_at IS NULL;

-- Índices adicionales
CREATE INDEX idx_users_role ON users(role) 
    WHERE deleted_at IS NULL AND is_active = TRUE;

CREATE INDEX idx_users_locked ON users(locked_until) 
    WHERE locked_until IS NOT NULL AND locked_until > NOW();

-- Índice trigram para búsqueda de emails
CREATE INDEX idx_users_email_trgm ON users USING gin(email gin_trgm_ops)
    WHERE deleted_at IS NULL;

-- ============================================================================
-- TABLA: password_reset_tokens
-- Tokens para reset de contraseña
-- ============================================================================

CREATE TABLE password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(7),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    ip_address INET,
    user_agent TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT password_reset_expires_future CHECK (expires_at > created_at),
    CONSTRAINT password_reset_used_before_expiry CHECK (
        used_at IS NULL OR used_at <= expires_at
    )
);

-- Índice único parcial para token_hash activos
CREATE UNIQUE INDEX idx_password_reset_token_unique ON password_reset_tokens(token_hash)
    WHERE used_at IS NULL;

CREATE INDEX idx_password_reset_user ON password_reset_tokens(user_id, created_at DESC);
CREATE INDEX idx_password_reset_cleanup ON password_reset_tokens(expires_at) 
    WHERE used_at IS NULL;

-- ============================================================================
-- TABLA: user_invitations
-- Invitaciones para crear nuevos usuarios (Host/Admin)
-- ============================================================================

CREATE TABLE user_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(7),
    email VARCHAR(255) NOT NULL,
    role user_role NOT NULL,
    token_hash VARCHAR(255) NOT NULL,
    status invitation_status NOT NULL DEFAULT 'pending',
    
    invited_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    accepted_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT invitation_role_check CHECK (role IN ('host', 'admin')),
    CONSTRAINT invitation_expires_future CHECK (expires_at > created_at),
    CONSTRAINT invitation_accepted_logic CHECK (
        (status = 'accepted' AND accepted_at IS NOT NULL) OR
        (status != 'accepted' AND accepted_at IS NULL)
    )
);

-- Índice único para token_hash pendientes
CREATE UNIQUE INDEX idx_invitations_token_unique ON user_invitations(token_hash)
    WHERE status = 'pending';

-- Índice único para email + role pendiente (evitar invitaciones duplicadas)
CREATE UNIQUE INDEX idx_invitations_email_role_unique ON user_invitations(LOWER(email), role)
    WHERE status = 'pending';

CREATE INDEX idx_invitations_invited_by ON user_invitations(invited_by, created_at DESC);
CREATE INDEX idx_invitations_cleanup ON user_invitations(expires_at) 
    WHERE status = 'pending';

-- ============================================================================
-- TABLA: rooms
-- Salas de conversación
-- ============================================================================

CREATE TABLE rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(7),
    name VARCHAR(255),
    slug VARCHAR(255),
    status room_status NOT NULL DEFAULT 'waiting',
    
    -- Configuración de la sala
    max_participants INTEGER NOT NULL DEFAULT 10,
    allow_video BOOLEAN NOT NULL DEFAULT TRUE,
    
    -- Host de la sala
    host_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Control de grabación (unificado con status)
    recording_started_at TIMESTAMPTZ,
    recording_stopped_at TIMESTAMPTZ,
    
    -- Auditoría
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    
    CONSTRAINT rooms_max_participants_range CHECK (max_participants BETWEEN 1 AND 100),
    CONSTRAINT rooms_slug_format CHECK (slug ~* '^[a-z0-9-]+$' OR slug IS NULL),
    CONSTRAINT rooms_recording_logic CHECK (
        (status = 'recording' AND recording_started_at IS NOT NULL) OR
        (status != 'recording')
    ),
    CONSTRAINT rooms_recording_sequence CHECK (
        recording_stopped_at IS NULL OR recording_stopped_at > recording_started_at
    )
);

-- Índice único para slug activas
CREATE UNIQUE INDEX idx_rooms_slug_unique ON rooms(slug) 
    WHERE slug IS NOT NULL AND closed_at IS NULL;

CREATE INDEX idx_rooms_host_active ON rooms(host_id, created_at DESC) 
    WHERE closed_at IS NULL;

CREATE INDEX idx_rooms_status ON rooms(status, created_at DESC) 
    WHERE closed_at IS NULL;

-- ============================================================================
-- TABLA: guests
-- Participantes temporales de las salas
-- Se eliminan cuando la sala se cierra
-- ============================================================================

CREATE TABLE guests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(7),
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    
    -- Identificación temporal
    display_name VARCHAR(100) NOT NULL,
    email VARCHAR(255),
    
    -- Token de acceso (magic link)
    access_token_hash VARCHAR(255) NOT NULL,
    token_expires_at TIMESTAMPTZ NOT NULL,
    
    -- Control de conexión
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    left_at TIMESTAMPTZ,
    kicked_at TIMESTAMPTZ,
    kicked_by UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- Auditoría
    invited_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT guests_token_expires_future CHECK (token_expires_at > created_at),
    CONSTRAINT guests_last_seen_after_join CHECK (last_seen_at >= joined_at),
    CONSTRAINT guests_mutual_exclusion CHECK (
        (left_at IS NULL AND kicked_at IS NULL) OR
        (left_at IS NOT NULL AND kicked_at IS NULL) OR
        (left_at IS NULL AND kicked_at IS NOT NULL)
    )
);

-- Índice único para tokens activos
CREATE UNIQUE INDEX idx_guests_token_unique ON guests(access_token_hash)
    WHERE left_at IS NULL AND kicked_at IS NULL;

CREATE INDEX idx_guests_room_active ON guests(room_id, joined_at DESC)
    WHERE left_at IS NULL AND kicked_at IS NULL;

CREATE INDEX idx_guests_cleanup ON guests(token_expires_at) 
    WHERE left_at IS NULL AND kicked_at IS NULL;

-- ============================================================================
-- TABLA: recordings
-- Grabaciones de las salas
-- ============================================================================

CREATE TABLE recordings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(7),
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    
    -- Identificación de la grabación
    folder_name VARCHAR(255) NOT NULL,
    
    -- Metadata
    duration_seconds INTEGER,
    total_size_bytes BIGINT,
    participant_count INTEGER NOT NULL DEFAULT 0,
    
    -- Estado
    status recording_status NOT NULL DEFAULT 'recording',
    
    -- Control
    started_at TIMESTAMPTZ NOT NULL,
    stopped_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    
    -- Auditoría
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    
    CONSTRAINT recordings_duration_positive CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
    CONSTRAINT recordings_size_positive CHECK (total_size_bytes IS NULL OR total_size_bytes >= 0),
    CONSTRAINT recordings_stopped_after_start CHECK (stopped_at IS NULL OR stopped_at > started_at),
    CONSTRAINT recordings_completed_after_stop CHECK (
        completed_at IS NULL OR (stopped_at IS NOT NULL AND completed_at >= stopped_at)
    )
);

-- Índice único parcial para folder_name activos
CREATE UNIQUE INDEX idx_recordings_folder_unique ON recordings(folder_name)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_recordings_created_by ON recordings(created_by, started_at DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_recordings_status ON recordings(status, started_at DESC)
    WHERE deleted_at IS NULL;

-- ============================================================================
-- TABLA: recording_files
-- Archivos individuales de cada participante en una grabación
-- ============================================================================

CREATE TABLE recording_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(7),
    recording_id UUID NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
    
    -- Identificación del archivo
    file_name VARCHAR(255) NOT NULL,
    file_path TEXT NOT NULL,
    mime_type VARCHAR(100) NOT NULL DEFAULT 'audio/webm',
    
    -- Participante
    participant_id UUID,
    participant_name VARCHAR(100) NOT NULL,
    participant_type VARCHAR(10) NOT NULL,
    
    -- Metadata del archivo
    size_bytes BIGINT NOT NULL,
    duration_seconds INTEGER,
    
    -- Control de upload
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    checksum_sha256 VARCHAR(64),
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    
    CONSTRAINT recording_files_size_positive CHECK (size_bytes > 0),
    CONSTRAINT recording_files_participant_type_check CHECK (participant_type IN ('guest', 'host')),
    CONSTRAINT recording_files_path_unique_per_recording UNIQUE (recording_id, file_path)
);

CREATE INDEX idx_recording_files_recording ON recording_files(recording_id, uploaded_at DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_recording_files_participant ON recording_files(participant_id)
    WHERE deleted_at IS NULL AND participant_id IS NOT NULL;

-- ============================================================================
-- TABLA: feed_episodes
-- Episodios del podcast feed (sólo Admin)
-- ============================================================================

CREATE TABLE feed_episodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(7),
    
    -- Metadata del episodio
    title VARCHAR(255) NOT NULL,
    description TEXT,
    slug VARCHAR(255) NOT NULL,
    
    -- Audio
    audio_file_path TEXT NOT NULL,
    audio_mime_type VARCHAR(100) NOT NULL DEFAULT 'audio/mpeg',
    audio_size_bytes BIGINT NOT NULL,
    duration_seconds INTEGER NOT NULL,
    
    -- Metadata adicional (podcast standard)
    episode_number INTEGER,
    season_number INTEGER,
    explicit BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Publicación
    published_at TIMESTAMPTZ,
    is_published BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Auditoría
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    
    CONSTRAINT feed_episodes_slug_format CHECK (slug ~* '^[a-z0-9-]+$'),
    CONSTRAINT feed_episodes_duration_positive CHECK (duration_seconds > 0),
    CONSTRAINT feed_episodes_size_positive CHECK (audio_size_bytes > 0),
    CONSTRAINT feed_episodes_published_logic CHECK (
        (is_published = TRUE AND published_at IS NOT NULL) OR
        (is_published = FALSE)
    )
);

-- Índice único para slug activos
CREATE UNIQUE INDEX idx_feed_episodes_slug_unique ON feed_episodes(slug)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_feed_episodes_published ON feed_episodes(published_at DESC) 
    WHERE is_published = TRUE AND deleted_at IS NULL;

CREATE INDEX idx_feed_episodes_created_by ON feed_episodes(created_by, created_at DESC)
    WHERE deleted_at IS NULL;

-- ============================================================================
-- TABLA: audit_log
-- Log de auditoría para acciones críticas
-- ============================================================================

CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(7),
    
    -- Actor
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    user_email VARCHAR(255) NOT NULL,
    user_role user_role NOT NULL,
    
    -- Acción
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID,
    
    -- Contexto
    ip_address INET,
    user_agent TEXT,
    metadata JSONB,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_user ON audit_log(user_id, created_at DESC);
CREATE INDEX idx_audit_action ON audit_log(action, created_at DESC);
CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_created ON audit_log(created_at DESC);
CREATE INDEX idx_audit_metadata ON audit_log USING gin(metadata) 
    WHERE metadata IS NOT NULL;

-- ============================================================================
-- FUNCIONES Y TRIGGERS
-- ============================================================================

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- Triggers para updated_at
CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON users
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_rooms_updated_at 
    BEFORE UPDATE ON rooms
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_recordings_updated_at 
    BEFORE UPDATE ON recordings
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_feed_episodes_updated_at 
    BEFORE UPDATE ON feed_episodes
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Función para marcar guests como expirados cuando se cierra una sala
CREATE OR REPLACE FUNCTION expire_guests_on_room_close()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.closed_at IS NOT NULL AND OLD.closed_at IS NULL THEN
        UPDATE guests 
        SET 
            token_expires_at = NOW(),
            left_at = COALESCE(left_at, NOW())
        WHERE room_id = NEW.id 
          AND left_at IS NULL 
          AND kicked_at IS NULL;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER expire_guests_trigger 
    AFTER UPDATE ON rooms
    FOR EACH ROW 
    EXECUTE FUNCTION expire_guests_on_room_close();

-- Función para actualizar last_seen_at de guests
CREATE OR REPLACE FUNCTION update_guest_last_seen()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.last_seen_at = NOW();
    RETURN NEW;
END;
$$;

-- No aplicamos trigger automático, se actualiza desde la aplicación

-- ============================================================================
-- VISTAS
-- ============================================================================

-- Vista de salas activas con información del host y conteo de guests
CREATE OR REPLACE VIEW active_rooms_view AS
SELECT 
    r.id,
    r.name,
    r.slug,
    r.status,
    r.recording_started_at,
    r.max_participants,
    r.allow_video,
    r.created_at,
    u.email AS host_email,
    u.id AS host_id,
    COUNT(g.id) FILTER (WHERE g.left_at IS NULL AND g.kicked_at IS NULL) AS active_guests_count
FROM rooms r
INNER JOIN users u ON r.host_id = u.id
LEFT JOIN guests g ON g.room_id = r.id
WHERE r.closed_at IS NULL
GROUP BY r.id, r.name, r.slug, r.status, r.recording_started_at, 
         r.max_participants, r.allow_video, r.created_at, u.email, u.id;

-- Vista de grabaciones con información agregada
CREATE OR REPLACE VIEW recordings_summary_view AS
SELECT 
    r.id,
    r.folder_name,
    r.status,
    r.duration_seconds,
    r.total_size_bytes,
    r.participant_count,
    r.started_at,
    r.completed_at,
    r.deleted_at,
    u.email AS created_by_email,
    u.role AS created_by_role,
    rm.name AS room_name,
    COUNT(rf.id) AS file_count
FROM recordings r
INNER JOIN users u ON r.created_by = u.id
INNER JOIN rooms rm ON r.room_id = rm.id
LEFT JOIN recording_files rf ON r.id = rf.recording_id AND rf.deleted_at IS NULL
GROUP BY r.id, r.folder_name, r.status, r.duration_seconds, r.total_size_bytes,
         r.participant_count, r.started_at, r.completed_at, r.deleted_at,
         u.email, u.role, rm.name;

-- Vista de episodios publicados del feed
CREATE OR REPLACE VIEW published_feed_view AS
SELECT 
    id,
    title,
    description,
    slug,
    audio_file_path,
    audio_mime_type,
    audio_size_bytes,
    duration_seconds,
    episode_number,
    season_number,
    explicit,
    published_at
FROM feed_episodes
WHERE is_published = TRUE 
  AND deleted_at IS NULL
ORDER BY published_at DESC;

-- ============================================================================
-- ROW-LEVEL SECURITY (RLS)
-- ============================================================================

-- Habilitar RLS en tablas sensibles
ALTER TABLE recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE recording_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE feed_episodes ENABLE ROW LEVEL SECURITY;

-- Función auxiliar para obtener user_id actual de manera segura
CREATE OR REPLACE FUNCTION current_app_user_id()
RETURNS UUID
LANGUAGE plpgsql STABLE
AS $$
BEGIN
    RETURN NULLIF(current_setting('app.current_user_id', TRUE), '')::UUID;
EXCEPTION
    WHEN OTHERS THEN
        RETURN NULL;
END;
$$;

-- Función auxiliar para obtener role actual
CREATE OR REPLACE FUNCTION current_app_user_role()
RETURNS user_role
LANGUAGE plpgsql STABLE
AS $$
BEGIN
    RETURN NULLIF(current_setting('app.current_user_role', TRUE), '')::user_role;
EXCEPTION
    WHEN OTHERS THEN
        RETURN NULL;
END;
$$;

-- ============================================================================
-- Políticas RLS para recordings
-- ============================================================================

-- Admin: acceso total
CREATE POLICY recordings_admin_all ON recordings
    FOR ALL
    USING (current_app_user_role() = 'admin')
    WITH CHECK (current_app_user_role() = 'admin');

-- Host: solo sus propias grabaciones
CREATE POLICY recordings_host_select ON recordings
    FOR SELECT
    USING (
        current_app_user_role() = 'host' AND
        created_by = current_app_user_id()
    );

CREATE POLICY recordings_host_update ON recordings
    FOR UPDATE
    USING (
        current_app_user_role() = 'host' AND
        created_by = current_app_user_id()
    )
    WITH CHECK (
        current_app_user_role() = 'host' AND
        created_by = current_app_user_id()
    );

CREATE POLICY recordings_host_delete ON recordings
    FOR UPDATE -- soft delete vía UPDATE
    USING (
        current_app_user_role() = 'host' AND
        created_by = current_app_user_id()
    )
    WITH CHECK (
        current_app_user_role() = 'host' AND
        created_by = current_app_user_id()
    );

-- ============================================================================
-- Políticas RLS para recording_files
-- ============================================================================

CREATE POLICY recording_files_admin_all ON recording_files
    FOR ALL
    USING (current_app_user_role() = 'admin')
    WITH CHECK (current_app_user_role() = 'admin');

CREATE POLICY recording_files_host_select ON recording_files
    FOR SELECT
    USING (
        current_app_user_role() = 'host' AND
        EXISTS (
            SELECT 1 FROM recordings r
            WHERE r.id = recording_files.recording_id
              AND r.created_by = current_app_user_id()
        )
    );

CREATE POLICY recording_files_host_insert ON recording_files
    FOR INSERT
    WITH CHECK (
        current_app_user_role() = 'host' AND
        EXISTS (
            SELECT 1 FROM recordings r
            WHERE r.id = recording_files.recording_id
              AND r.created_by = current_app_user_id()
        )
    );

CREATE POLICY recording_files_host_delete ON recording_files
    FOR UPDATE
    USING (
        current_app_user_role() = 'host' AND
        EXISTS (
            SELECT 1 FROM recordings r
            WHERE r.id = recording_files.recording_id
              AND r.created_by = current_app_user_id()
        )
    )
    WITH CHECK (
        current_app_user_role() = 'host' AND
        EXISTS (
            SELECT 1 FROM recordings r
            WHERE r.id = recording_files.recording_id
              AND r.created_by = current_app_user_id()
        )
    );

-- ============================================================================
-- Políticas RLS para feed_episodes (solo admin)
-- ============================================================================

CREATE POLICY feed_episodes_admin_all ON feed_episodes
    FOR ALL
    USING (current_app_user_role() = 'admin')
    WITH CHECK (current_app_user_role() = 'admin');

-- Acceso público de lectura para feed publicado (sin autenticación)
CREATE POLICY feed_episodes_public_read ON feed_episodes
    FOR SELECT
    USING (is_published = TRUE AND deleted_at IS NULL);

-- ============================================================================
-- COMENTARIOS (documentación)
-- ============================================================================

COMMENT ON TABLE users IS 
'Usuarios permanentes del sistema (Host y Admin). Guest se maneja en tabla separada.';

COMMENT ON COLUMN users.password_salt IS 
'Salt único por usuario (32 bytes random, base64). Combinado con pepper global en ENV.';

COMMENT ON COLUMN users.password_hash IS 
'Hash Argon2id: argon2id(password + pepper_env, salt). Usar time_cost=3, memory_cost=64MB.';

COMMENT ON COLUMN users.failed_login_attempts IS 
'Contador de intentos fallidos. Reset a 0 en login exitoso. Bloqueo tras 5 intentos.';

COMMENT ON COLUMN users.locked_until IS 
'Timestamp hasta el cual la cuenta está bloqueada. Bloqueo de 15 min tras 5 intentos fallidos.';

COMMENT ON TABLE rooms IS 
'Salas de conversación en tiempo real. Estado unificado en campo status (no usar is_recording).';

COMMENT ON TABLE guests IS 
'Participantes temporales. Tokens expiran al cerrar sala. Se limpian vía trigger automático.';

COMMENT ON TABLE recordings IS 
'Metadata de grabaciones multi-pista. folder_name = timestamp inicio o nombre de sala.';

COMMENT ON TABLE recording_files IS 
'Archivos individuales de audio por participante. Verificar integridad con checksum_sha256.';

COMMENT ON TABLE feed_episodes IS 
'Episodios del podcast feed RSS. Solo Admin gestiona. Feed público accesible sin auth.';

COMMENT ON TABLE audit_log IS 
'Log inmutable de auditoría. Registra todas las acciones críticas con contexto completo.';

COMMENT ON COLUMN guests.access_token_hash IS 
'Hash SHA-256 del magic link token. Token nunca se almacena en texto plano.';

-- ============================================================================
-- DATOS INICIALES
-- ============================================================================

-- Crear usuario admin inicial
-- IMPORTANTE: Cambiar email y password en producción
DO $$
DECLARE
    admin_id UUID;
    admin_salt VARCHAR(255);
BEGIN
    -- Generar salt (en producción, generar desde la aplicación)
    admin_salt := encode(gen_random_bytes(32), 'base64');
    
    -- Insertar admin
    -- NOTA: password_hash debe generarse con Argon2id desde la aplicación
    -- Aquí usamos un placeholder que DEBE ser reemplazado
    INSERT INTO users (
        email, 
        password_hash, 
        password_salt, 
        role, 
        is_active, 
        email_verified
    )
    VALUES (
        'admin@simplycast.local',
        'REPLACE_WITH_ARGON2ID_HASH', -- Generar: argon2id('password' + pepper, salt)
        admin_salt,
        'admin',
        TRUE,
        TRUE
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO admin_id;
    
    IF admin_id IS NOT NULL THEN
        RAISE NOTICE 'Admin user created with ID: %', admin_id;
        RAISE NOTICE 'CRITICAL: Change password immediately in production!';
    END IF;
END $$;

-- ============================================================================
-- JOBS DE LIMPIEZA (ejecutar periódicamente con pg_cron o cron externo)
-- ============================================================================

-- Limpiar tokens de reset expirados (ejecutar diariamente)
-- DELETE FROM password_reset_tokens WHERE expires_at < NOW() - INTERVAL '7 days';

-- Limpiar invitaciones expiradas (ejecutar diariamente)
-- DELETE FROM user_invitations WHERE status = 'expired' AND expires_at < NOW() - INTERVAL '30 days';

-- Limpiar guests de salas cerradas (ejecutar cada hora)
-- DELETE FROM guests WHERE room_id IN (SELECT id FROM rooms WHERE closed_at < NOW() - INTERVAL '24 hours');

-- Vacuum analyze para mantener estadísticas actualizadas
-- VACUUM ANALYZE;

-- ============================================================================
-- FIN DEL SCHEMA
-- ============================================================================

-- ============================================================================
-- Drizzle Schemas

// ============================================================================
// db/schema.ts - SimplyCaster Drizzle Schema
// PostgreSQL 18 con UUID v7, Salt+Pepper, RLS
// ============================================================================

import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  bigint,
  timestamp,
  inet,
  jsonb,
  pgEnum,
  uniqueIndex,
  index,
  check,
  sql,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ============================================================================
// ENUMS
// ============================================================================

export const userRoleEnum = pgEnum("user_role", ["guest", "host", "admin"]);
export const roomStatusEnum = pgEnum("room_status", [
  "waiting",
  "active",
  "recording",
  "closed",
]);
export const recordingStatusEnum = pgEnum("recording_status", [
  "recording",
  "uploading",
  "processing",
  "completed",
  "failed",
]);
export const invitationStatusEnum = pgEnum("invitation_status", [
  "pending",
  "accepted",
  "expired",
  "revoked",
]);

// ============================================================================
// HELPER: UUID v7 por defecto
// ============================================================================

const uuidv7 = sql`gen_random_uuid(7)`;

// ============================================================================
// TABLA: users
// ============================================================================

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().default(uuidv7),
    email: varchar("email", { length: 255 }).notNull(),

    // Autenticación: salt + pepper
    passwordHash: varchar("password_hash", { length: 255 }),
    passwordSalt: varchar("password_salt", { length: 255 }),

    role: userRoleEnum("role").notNull().default("host"),
    isActive: boolean("is_active").notNull().default(true),
    emailVerified: boolean("email_verified").notNull().default(false),

    // Seguridad
    failedLoginAttempts: integer("failed_login_attempts").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    lastLoginIp: inet("last_login_ip"),

    // Auditoría
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: uuid("created_by"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    // Índice único para email (case-insensitive, soft-delete compatible)
    emailUniqueIdx: uniqueIndex("idx_users_email_unique").on(
      sql`LOWER(${table.email})`
    ).where(sql`${table.deletedAt} IS NULL`),

    // Índices de búsqueda
    roleIdx: index("idx_users_role").on(table.role).where(
      sql`${table.deletedAt} IS NULL AND ${table.isActive} = true`
    ),
    lockedIdx: index("idx_users_locked").on(table.lockedUntil).where(
      sql`${table.lockedUntil} IS NOT NULL AND ${table.lockedUntil} > NOW()`
    ),

    // Constraints
    roleCheck: check(
      "users_role_check",
      sql`${table.role} IN ('host', 'admin')`
    ),
    emailFormatCheck: check(
      "users_email_format",
      sql`${table.email} ~* '^[^@]+@[^@]+\.[^@]+$'`
    ),
    failedAttemptsCheck: check(
      "users_failed_attempts_check",
      sql`${table.failedLoginAttempts} >= 0`
    ),
    passwordCompleteCheck: check(
      "users_password_complete",
      sql`(${table.passwordHash} IS NULL AND ${table.passwordSalt} IS NULL) OR 
           (${table.passwordHash} IS NOT NULL AND ${table.passwordSalt} IS NOT NULL)`
    ),
  })
);

// ============================================================================
// TABLA: password_reset_tokens
// ============================================================================

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").primaryKey().default(uuidv7),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 255 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    ipAddress: inet("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tokenUniqueIdx: uniqueIndex("idx_password_reset_token_unique").on(
      table.tokenHash
    ).where(sql`${table.usedAt} IS NULL`),
    userIdx: index("idx_password_reset_user").on(table.userId, table.createdAt),
    cleanupIdx: index("idx_password_reset_cleanup").on(table.expiresAt).where(
      sql`${table.usedAt} IS NULL`
    ),
    expiresFutureCheck: check(
      "password_reset_expires_future",
      sql`${table.expiresAt} > ${table.createdAt}`
    ),
    usedBeforeExpiryCheck: check(
      "password_reset_used_before_expiry",
      sql`${table.usedAt} IS NULL OR ${table.usedAt} <= ${table.expiresAt}`
    ),
  })
);

// ============================================================================
// TABLA: user_invitations
// ============================================================================

export const userInvitations = pgTable(
  "user_invitations",
  {
    id: uuid("id").primaryKey().default(uuidv7),
    email: varchar("email", { length: 255 }).notNull(),
    role: userRoleEnum("role").notNull(),
    tokenHash: varchar("token_hash", { length: 255 }).notNull(),
    status: invitationStatusEnum("status").notNull().default("pending"),
    invitedBy: uuid("invited_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tokenUniqueIdx: uniqueIndex("idx_invitations_token_unique").on(
      table.tokenHash
    ).where(sql`${table.status} = 'pending'`),
    emailRoleUniqueIdx: uniqueIndex("idx_invitations_email_role_unique").on(
      sql`LOWER(${table.email})`,
      table.role
    ).where(sql`${table.status} = 'pending'`),
    invitedByIdx: index("idx_invitations_invited_by").on(
      table.invitedBy,
      table.createdAt
    ),
    cleanupIdx: index("idx_invitations_cleanup").on(table.expiresAt).where(
      sql`${table.status} = 'pending'`
    ),
    roleCheck: check(
      "invitation_role_check",
      sql`${table.role} IN ('host', 'admin')`
    ),
    expiresFutureCheck: check(
      "invitation_expires_future",
      sql`${table.expiresAt} > ${table.createdAt}`
    ),
    acceptedLogicCheck: check(
      "invitation_accepted_logic",
      sql`(${table.status} = 'accepted' AND ${table.acceptedAt} IS NOT NULL) OR
           (${table.status} != 'accepted' AND ${table.acceptedAt} IS NULL)`
    ),
  })
);

// ============================================================================
// TABLA: rooms
// ============================================================================

export const rooms = pgTable(
  "rooms",
  {
    id: uuid("id").primaryKey().default(uuidv7),
    name: varchar("name", { length: 255 }),
    slug: varchar("slug", { length: 255 }),
    status: roomStatusEnum("status").notNull().default("waiting"),
    maxParticipants: integer("max_participants").notNull().default(10),
    allowVideo: boolean("allow_video").notNull().default(true),
    hostId: uuid("host_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    recordingStartedAt: timestamp("recording_started_at", {
      withTimezone: true,
    }),
    recordingStoppedAt: timestamp("recording_stopped_at", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (table) => ({
    slugUniqueIdx: uniqueIndex("idx_rooms_slug_unique").on(table.slug).where(
      sql`${table.slug} IS NOT NULL AND ${table.closedAt} IS NULL`
    ),
    hostActiveIdx: index("idx_rooms_host_active").on(
      table.hostId,
      table.createdAt
    ).where(sql`${table.closedAt} IS NULL`),
    statusIdx: index("idx_rooms_status").on(table.status, table.createdAt)
      .where(sql`${table.closedAt} IS NULL`),
    maxParticipantsCheck: check(
      "rooms_max_participants_range",
      sql`${table.maxParticipants} BETWEEN 1 AND 100`
    ),
    slugFormatCheck: check(
      "rooms_slug_format",
      sql`${table.slug} ~* '^[a-z0-9-]+$' OR ${table.slug} IS NULL`
    ),
    recordingLogicCheck: check(
      "rooms_recording_logic",
      sql`(${table.status} = 'recording' AND ${table.recordingStartedAt} IS NOT NULL) OR
           (${table.status} != 'recording')`
    ),
    recordingSequenceCheck: check(
      "rooms_recording_sequence",
      sql`${table.recordingStoppedAt} IS NULL OR 
           ${table.recordingStoppedAt} > ${table.recordingStartedAt}`
    ),
  })
);

// ============================================================================
// TABLA: guests
// ============================================================================

export const guests = pgTable(
  "guests",
  {
    id: uuid("id").primaryKey().default(uuidv7),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    displayName: varchar("display_name", { length: 100 }).notNull(),
    email: varchar("email", { length: 255 }),
    accessTokenHash: varchar("access_token_hash", { length: 255 }).notNull(),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true })
      .notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    leftAt: timestamp("left_at", { withTimezone: true }),
    kickedAt: timestamp("kicked_at", { withTimezone: true }),
    kickedBy: uuid("kicked_by").references(() => users.id, {
      onDelete: "set null",
    }),
    invitedBy: uuid("invited_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tokenUniqueIdx: uniqueIndex("idx_guests_token_unique").on(
      table.accessTokenHash
    ).where(sql`${table.leftAt} IS NULL AND ${table.kickedAt} IS NULL`),
    roomActiveIdx: index("idx_guests_room_active").on(
      table.roomId,
      table.joinedAt
    ).where(sql`${table.leftAt} IS NULL AND ${table.kickedAt} IS NULL`),
    cleanupIdx: index("idx_guests_cleanup").on(table.tokenExpiresAt).where(
      sql`${table.leftAt} IS NULL AND ${table.kickedAt} IS NULL`
    ),
    tokenExpiresFutureCheck: check(
      "guests_token_expires_future",
      sql`${table.tokenExpiresAt} > ${table.createdAt}`
    ),
    lastSeenAfterJoinCheck: check(
      "guests_last_seen_after_join",
      sql`${table.lastSeenAt} >= ${table.joinedAt}`
    ),
    mutualExclusionCheck: check(
      "guests_mutual_exclusion",
      sql`(${table.leftAt} IS NULL AND ${table.kickedAt} IS NULL) OR
           (${table.leftAt} IS NOT NULL AND ${table.kickedAt} IS NULL) OR
           (${table.leftAt} IS NULL AND ${table.kickedAt} IS NOT NULL)`
    ),
  })
);

// ============================================================================
// TABLA: recordings
// ============================================================================

export const recordings = pgTable(
  "recordings",
  {
    id: uuid("id").primaryKey().default(uuidv7),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    folderName: varchar("folder_name", { length: 255 }).notNull(),
    durationSeconds: integer("duration_seconds"),
    totalSizeBytes: bigint("total_size_bytes", { mode: "number" }),
    participantCount: integer("participant_count").notNull().default(0),
    status: recordingStatusEnum("status").notNull().default("recording"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    stoppedAt: timestamp("stopped_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    folderUniqueIdx: uniqueIndex("idx_recordings_folder_unique").on(
      table.folderName
    ).where(sql`${table.deletedAt} IS NULL`),
    createdByIdx: index("idx_recordings_created_by").on(
      table.createdBy,
      table.startedAt
    ).where(sql`${table.deletedAt} IS NULL`),
    statusIdx: index("idx_recordings_status").on(table.status, table.startedAt)
      .where(sql`${table.deletedAt} IS NULL`),
    durationPositiveCheck: check(
      "recordings_duration_positive",
      sql`${table.durationSeconds} IS NULL OR ${table.durationSeconds} >= 0`
    ),
    sizePositiveCheck: check(
      "recordings_size_positive",
      sql`${table.totalSizeBytes} IS NULL OR ${table.totalSizeBytes} >= 0`
    ),
    stoppedAfterStartCheck: check(
      "recordings_stopped_after_start",
      sql`${table.stoppedAt} IS NULL OR ${table.stoppedAt} > ${table.startedAt}`
    ),
    completedAfterStopCheck: check(
      "recordings_completed_after_stop",
      sql`${table.completedAt} IS NULL OR 
           (${table.stoppedAt} IS NOT NULL AND ${table.completedAt} >= ${table.stoppedAt})`
    ),
  })
);

// ============================================================================
// TABLA: recording_files
// ============================================================================

export const recordingFiles = pgTable(
  "recording_files",
  {
    id: uuid("id").primaryKey().default(uuidv7),
    recordingId: uuid("recording_id")
      .notNull()
      .references(() => recordings.id, { onDelete: "cascade" }),
    fileName: varchar("file_name", { length: 255 }).notNull(),
    filePath: text("file_path").notNull(),
    mimeType: varchar("mime_type", { length: 100 }).notNull().default(
      "audio/webm",
    ),
    participantId: uuid("participant_id"),
    participantName: varchar("participant_name", { length: 100 }).notNull(),
    participantType: varchar("participant_type", { length: 10 }).notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    durationSeconds: integer("duration_seconds"),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    checksumSha256: varchar("checksum_sha256", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    recordingIdx: index("idx_recording_files_recording").on(
      table.recordingId,
      table.uploadedAt
    ).where(sql`${table.deletedAt} IS NULL`),
    participantIdx: index("idx_recording_files_participant").on(
      table.participantId
    ).where(sql`${table.deletedAt} IS NULL AND ${table.participantId} IS NOT NULL`),
    pathUniquePerRecording: uniqueIndex(
      "recording_files_path_unique_per_recording"
    ).on(table.recordingId, table.filePath),
    sizePositiveCheck: check(
      "recording_files_size_positive",
      sql`${table.sizeBytes} > 0`
    ),
    participantTypeCheck: check(
      "recording_files_participant_type_check",
      sql`${table.participantType} IN ('guest', 'host')`
    ),
  })
);

// ============================================================================
// TABLA: feed_episodes
// ============================================================================

export const feedEpisodes = pgTable(
  "feed_episodes",
  {
    id: uuid("id").primaryKey().default(uuidv7),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    slug: varchar("slug", { length: 255 }).notNull(),
    audioFilePath: text("audio_file_path").notNull(),
    audioMimeType: varchar("audio_mime_type", { length: 100 })
      .notNull()
      .default("audio/mpeg"),
    audioSizeBytes: bigint("audio_size_bytes", { mode: "number" }).notNull(),
    durationSeconds: integer("duration_seconds").notNull(),
    episodeNumber: integer("episode_number"),
    seasonNumber: integer("season_number"),
    explicit: boolean("explicit").notNull().default(false),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    isPublished: boolean("is_published").notNull().default(false),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    slugUniqueIdx: uniqueIndex("idx_feed_episodes_slug_unique").on(table.slug)
      .where(sql`${table.deletedAt} IS NULL`),
    publishedIdx: index("idx_feed_episodes_published").on(table.publishedAt)
      .where(
        sql`${table.isPublished} = true AND ${table.deletedAt} IS NULL`
      ),
    createdByIdx: index("idx_feed_episodes_created_by").on(
      table.createdBy,
      table.createdAt
    ).where(sql`${table.deletedAt} IS NULL`),
    slugFormatCheck: check(
      "feed_episodes_slug_format",
      sql`${table.slug} ~* '^[a-z0-9-]+$'`
    ),
    durationPositiveCheck: check(
      "feed_episodes_duration_positive",
      sql`${table.durationSeconds} > 0`
    ),
    sizePositiveCheck: check(
      "feed_episodes_size_positive",
      sql`${table.audioSizeBytes} > 0`
    ),
    publishedLogicCheck: check(
      "feed_episodes_published_logic",
      sql`(${table.isPublished} = true AND ${table.publishedAt} IS NOT NULL) OR
           (${table.isPublished} = false)`
    ),
  })
);

// ============================================================================
// TABLA: audit_log
// ============================================================================

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().default(uuidv7),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    userEmail: varchar("user_email", { length: 255 }).notNull(),
    userRole: userRoleEnum("user_role").notNull(),
    action: varchar("action", { length: 100 }).notNull(),
    entityType: varchar("entity_type", { length: 50 }).notNull(),
    entityId: uuid("entity_id"),
    ipAddress: inet("ip_address"),
    userAgent: text("user_agent"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userIdx: index("idx_audit_user").on(table.userId, table.createdAt),
    actionIdx: index("idx_audit_action").on(table.action, table.createdAt),
    entityIdx: index("idx_audit_entity").on(table.entityType, table.entityId),
    createdIdx: index("idx_audit_created").on(table.createdAt),
    metadataIdx: index("idx_audit_metadata").on(table.metadata).where(
      sql`${table.metadata} IS NOT NULL`
    ),
  })
);

// ============================================================================
// RELACIONES
// ============================================================================

export const usersRelations = relations(users, ({ many, one }) => ({
  createdRooms: many(rooms, { relationName: "host" }),
  createdRecordings: many(recordings),
  createdEpisodes: many(feedEpisodes),
  sentInvitations: many(userInvitations),
  invitedGuests: many(guests, { relationName: "inviter" }),
  kickedGuests: many(guests, { relationName: "kicker" }),
  auditLogs: many(auditLog),
  createdBy: one(users, {
    fields: [users.createdBy],
    references: [users.id],
  }),
}));

export const roomsRelations = relations(rooms, ({ one, many }) => ({
  host: one(users, {
    fields: [rooms.hostId],
    references: [users.id],
    relationName: "host",
  }),
  guests: many(guests),
  recordings: many(recordings),
}));

export const guestsRelations = relations(guests, ({ one }) => ({
  room: one(rooms, {
    fields: [guests.roomId],
    references: [rooms.id],
  }),
  invitedBy: one(users, {
    fields: [guests.invitedBy],
    references: [users.id],
    relationName: "inviter",
  }),
  kickedBy: one(users, {
    fields: [guests.kickedBy],
    references: [users.id],
    relationName: "kicker",
  }),
}));

export const recordingsRelations = relations(recordings, ({ one, many }) => ({
  room: one(rooms, {
    fields: [recordings.roomId],
    references: [rooms.id],
  }),
  createdBy: one(users, {
    fields: [recordings.createdBy],
    references: [users.id],
  }),
  files: many(recordingFiles),
}));

export const recordingFilesRelations = relations(recordingFiles, ({ one }) => ({
  recording: one(recordings, {
    fields: [recordingFiles.recordingId],
    references: [recordings.id],
  }),
}));

export const feedEpisodesRelations = relations(feedEpisodes, ({ one }) => ({
  createdBy: one(users, {
    fields: [feedEpisodes.createdBy],
    references: [users.id],
  }),
}));

export const userInvitationsRelations = relations(userInvitations, ({ one }) => ({
  invitedBy: one(users, {
    fields: [userInvitations.invitedBy],
    references: [users.id],
  }),
}));

export const passwordResetTokensRelations = relations(
  passwordResetTokens,
  ({ one }) => ({
    user: one(users, {
      fields: [passwordResetTokens.userId],
      references: [users.id],
    }),
  })
);

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  user: one(users, {
    fields: [auditLog.userId],
    references: [users.id],
  }),
}));

// ============================================================================
// TIPOS INFERIDOS
// ============================================================================

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Room = typeof rooms.$inferSelect;
export type NewRoom = typeof rooms.$inferInsert;

export type Guest = typeof guests.$inferSelect;
export type NewGuest = typeof guests.$inferInsert;

export type Recording = typeof recordings.$inferSelect;
export type NewRecording = typeof recordings.$inferInsert;

export type RecordingFile = typeof recordingFiles.$inferSelect;
export type NewRecordingFile = typeof recordingFiles.$inferInsert;

export type FeedEpisode = typeof feedEpisodes.$inferSelect;
export type NewFeedEpisode = typeof feedEpisodes.$inferInsert;

export type UserInvitation = typeof userInvitations.$inferSelect;
export type NewUserInvitation = typeof userInvitations.$inferInsert;

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type NewPasswordResetToken = typeof passwordResetTokens.$inferInsert;

export type AuditLog = typeof auditLog.$inferSelect;
export type NewAuditLog = typeof auditLog.$inferInsert;
