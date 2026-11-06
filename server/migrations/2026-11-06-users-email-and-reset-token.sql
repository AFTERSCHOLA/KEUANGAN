-- FP.1 / Task 4: Add email and password reset token columns to users.
--
-- Adds email (nullable, unique), reset_token_hash, and reset_token_expires_at
-- to users table for self-service password reset via SMTP.
--
-- Idempotence: recorded in migrations table by server/bootstrap.php::runMigrations().
-- Reference-preserving: existing users rows remain intact with NULL email/tokens.

ALTER TABLE users ADD COLUMN email VARCHAR(191) NULL UNIQUE AFTER display_name;
ALTER TABLE users ADD COLUMN reset_token_hash VARCHAR(255) NULL AFTER must_change_password;
ALTER TABLE users ADD COLUMN reset_token_expires_at DATETIME NULL AFTER reset_token_hash;
CREATE INDEX idx_users_email ON users (email);
