-- CS.B.2 / F-CS5 / D-CS5 — minimal external-assistant person record.
-- External assistants have no login account; an authorized admin/trainer
-- in-scope for the school+date records their attendance with a mandatory
-- `dicatatOleh` recorder audit. Shape: { nama, kontak, sekolahId,
-- cabangId } inside payload (mirrors the master-data tables below).
--
-- Idempotence (taste #35): a single CREATE TABLE IF NOT EXISTS, recorded
-- in the `migrations` table by server/bootstrap.php::runMigrations(), so
-- the file runs exactly once per database. Reference-preserving: no
-- existing table is touched. cabang_id is NOT NULL (ownership, same as
-- sekolah/siswa) so branch scoping and the cabang-delete guard hold.
-- No correction_of column: external-person fixes are update/delete via
-- server/api/eksternal.php (master-data lifecycle), not ledger
-- corrections — attendance rows stay append-only.

CREATE TABLE IF NOT EXISTS eksternal (
    id VARCHAR(191) NOT NULL PRIMARY KEY,
    cabang_id VARCHAR(191) NOT NULL,
    version INT UNSIGNED NOT NULL DEFAULT 1,
    payload JSON NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_eksternal_cabang_updated (cabang_id, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
