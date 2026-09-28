-- D-RM2 — persistent login tokens (remember-me, opt-in).
-- Only the token HASH is stored; the raw token lives solely in the
-- HttpOnly persistent cookie. Rotation deletes the used hash and mints a
-- new one (single-use lineage). Explicit logout deletes the presented
-- hash (D-RM5).
--
-- Idempotence (taste #35): a single CREATE TABLE IF NOT EXISTS, recorded
-- in the `migrations` table by server/bootstrap.php::runMigrations(), so
-- the file runs exactly once per database. Reference-preserving: no
-- existing table is touched. No foreign key to users: token rows must
-- survive admin user-record rewrites without cascading deletes; validity
-- is re-checked against users (active) at restore time instead.

CREATE TABLE IF NOT EXISTS remember_tokens (
    token_hash CHAR(64) NOT NULL PRIMARY KEY,
    user_id VARCHAR(191) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    last_used_at DATETIME NULL,
    INDEX idx_remember_user_expires (user_id, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
