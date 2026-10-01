-- AA.A.1 — service tokens for Hybrid-Opaque auth (browser stays cookie+CSRF).
-- Only the token HASH is stored; the raw token is shown once at mint time.
-- Expiry, revocation, and user validity are re-checked at use time.
--
-- Idempotence (taste #35): a single CREATE TABLE IF NOT EXISTS, recorded
-- in the `migrations` table by server/bootstrap.php::runMigrations(), so
-- the file runs exactly once per database. Reference-preserving: no
-- existing table is touched. No foreign key to users: token rows must
-- survive admin user-record rewrites without cascading deletes; validity
-- is re-checked against users (active) at use time instead (mirror the
-- remember-tokens idiom server/migrations/2026-09-28-remember-tokens.sql).

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
