CREATE TABLE IF NOT EXISTS cabang (
    id VARCHAR(191) NOT NULL PRIMARY KEY,
    kode VARCHAR(16) NOT NULL,
    nama VARCHAR(191) NOT NULL,
    active TINYINT(1) NOT NULL DEFAULT 1,
    version INT UNSIGNED NOT NULL DEFAULT 1,
    payload JSON NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_cabang_kode (kode)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(191) NOT NULL PRIMARY KEY,
    username VARCHAR(191) NOT NULL,
    display_name VARCHAR(191) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('superadmin', 'admin_cabang', 'trainer') NOT NULL,
    cabang_id VARCHAR(191) NULL,
    trainer_id VARCHAR(191) NULL,
    active TINYINT(1) NOT NULL DEFAULT 1,
    must_change_password TINYINT(1) NOT NULL DEFAULT 1,
    failed_login_count INT UNSIGNED NOT NULL DEFAULT 0,
    locked_until DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_login_at DATETIME NULL,
    UNIQUE KEY uq_users_username (username),
    INDEX idx_users_role_branch (role, cabang_id),
    INDEX idx_users_trainer (trainer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS audit_log (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    actor_user_id VARCHAR(191) NULL,
    actor_role VARCHAR(32) NULL,
    cabang_id VARCHAR(191) NULL,
    event_type VARCHAR(64) NOT NULL,
    target_type VARCHAR(64) NULL,
    target_id VARCHAR(191) NULL,
    metadata JSON NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_audit_branch_created (cabang_id, created_at),
    INDEX idx_audit_actor_created (actor_user_id, created_at),
    INDEX idx_audit_event_created (event_type, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS login_attempts (
    key_hash CHAR(64) NOT NULL PRIMARY KEY,
    failed_count INT UNSIGNED NOT NULL DEFAULT 0,
    locked_until DATETIME NULL,
    last_attempt_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(128) NOT NULL PRIMARY KEY,
    checksum CHAR(64) NOT NULL,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS absensi (
    id VARCHAR(191) NOT NULL PRIMARY KEY,
    cabang_id VARCHAR(191) NULL,
    version INT UNSIGNED NOT NULL DEFAULT 1,
    payload JSON NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_absensi_cabang_created (cabang_id, created_at),
    INDEX idx_absensi_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS absensi_pengajar (
    id VARCHAR(191) NOT NULL PRIMARY KEY,
    cabang_id VARCHAR(191) NOT NULL,
    correction_of VARCHAR(191) NULL,
    version INT UNSIGNED NOT NULL DEFAULT 1,
    payload JSON NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_absensi_pengajar_cabang_created (cabang_id, created_at),
    INDEX idx_absensi_pengajar_updated (updated_at),
    INDEX idx_absensi_pengajar_correction (correction_of)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS spp_payments (
    id VARCHAR(191) NOT NULL PRIMARY KEY,
    cabang_id VARCHAR(191) NULL,
    version INT UNSIGNED NOT NULL DEFAULT 1,
    payload JSON NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_spp_cabang_created (cabang_id, created_at),
    INDEX idx_spp_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS honor_payments (
    id VARCHAR(191) NOT NULL PRIMARY KEY,
    cabang_id VARCHAR(191) NULL,
    correction_of VARCHAR(191) NULL,
    version INT UNSIGNED NOT NULL DEFAULT 1,
    payload JSON NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_honor_cabang_created (cabang_id, created_at),
    INDEX idx_honor_correction (correction_of),
    INDEX idx_honor_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sync_log (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    entity VARCHAR(64) NOT NULL,
    record_id VARCHAR(191) NOT NULL,
    operation VARCHAR(32) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_sync_entry (entity, record_id, operation)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sekolah (
    id VARCHAR(191) NOT NULL PRIMARY KEY,
    cabang_id VARCHAR(191) NOT NULL,
    version INT UNSIGNED NOT NULL DEFAULT 1,
    payload JSON NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_sekolah_cabang_updated (cabang_id, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS trainer (
    id VARCHAR(191) NOT NULL PRIMARY KEY,
    cabang_id VARCHAR(191) NULL,
    version INT UNSIGNED NOT NULL DEFAULT 1,
    payload JSON NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_trainer_cabang_updated (cabang_id, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS siswa (
    id VARCHAR(191) NOT NULL PRIMARY KEY,
    cabang_id VARCHAR(191) NOT NULL,
    version INT UNSIGNED NOT NULL DEFAULT 1,
    payload JSON NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_siswa_cabang_updated (cabang_id, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Slice 1 Raport (2026-10-03) — tabel raport semester per siswa.
-- Fresh databases get it from this baseline; existing databases via
-- server/migrations/2026-10-03-raport-schema.sql. Tanpa correction_of
-- (meniru tabel sekolah, bukan ledger).
CREATE TABLE IF NOT EXISTS raport (
    id VARCHAR(191) NOT NULL PRIMARY KEY,
    cabang_id VARCHAR(191) NOT NULL,
    version INT UNSIGNED NOT NULL DEFAULT 1,
    payload JSON NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_raport_cabang_updated (cabang_id, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- CS.B.2 (D-CS5) — minimal external-assistant person record (no login).
-- Fresh databases get it from this baseline; existing databases via
-- server/migrations/2026-09-27-cover-slot-eksternal.sql.
CREATE TABLE IF NOT EXISTS eksternal (
    id VARCHAR(191) NOT NULL PRIMARY KEY,
    cabang_id VARCHAR(191) NOT NULL,
    version INT UNSIGNED NOT NULL DEFAULT 1,
    payload JSON NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_eksternal_cabang_updated (cabang_id, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS invoices (
    id VARCHAR(191) NOT NULL PRIMARY KEY,
    cabang_id VARCHAR(191) NOT NULL,
    version INT UNSIGNED NOT NULL DEFAULT 1,
    payload JSON NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_invoices_cabang_updated (cabang_id, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS settings (
    id VARCHAR(191) NOT NULL PRIMARY KEY,
    cabang_id VARCHAR(191) NULL,
    version INT UNSIGNED NOT NULL DEFAULT 1,
    payload JSON NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS migrations (
    version VARCHAR(128) NOT NULL PRIMARY KEY,
    source_checksum CHAR(64) NULL,
    row_counts JSON NULL,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS backups (
    id VARCHAR(191) NOT NULL PRIMARY KEY,
    checksum CHAR(64) NOT NULL,
    location VARCHAR(500) NOT NULL,
    created_by VARCHAR(191) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    verified_at TIMESTAMP NULL,
    INDEX idx_backups_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS photo_uploads (
    id VARCHAR(191) NOT NULL PRIMARY KEY,
    cabang_id VARCHAR(191) NULL,
    owner_user_id VARCHAR(191) NOT NULL,
    storage_path VARCHAR(500) NOT NULL,
    mime_type VARCHAR(64) NOT NULL,
    byte_size INT UNSIGNED NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_photos_owner_created (owner_user_id, created_at),
    INDEX idx_photos_branch_created (cabang_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- AA.A.1 (D-AA2, D-AA5, D-AA7) — service tokens for Hybrid-Opaque auth.
-- Fresh databases get it from this baseline; existing databases via
-- server/migrations/2026-09-24-service-tokens.sql.
CREATE TABLE IF NOT EXISTS service_tokens (
  id VARCHAR(191) NOT NULL PRIMARY KEY,
  prefix VARCHAR(16) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  last4 CHAR(4) NOT NULL,
  user_id VARCHAR(191) NOT NULL,
  role ENUM('superadmin','admin_cabang','trainer') NOT NULL,
  cabang_id VARCHAR(191) NULL,
  trainer_id VARCHAR(191) NULL,
  name VARCHAR(191) NOT NULL,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  last_used_at DATETIME NULL,
  created_ip VARCHAR(64) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_service_tokens_prefix (prefix),
  UNIQUE KEY uq_service_tokens_hash (token_hash),
  INDEX idx_service_tokens_user (user_id),
  INDEX idx_service_tokens_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

