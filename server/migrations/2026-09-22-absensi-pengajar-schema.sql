-- TA.B.1 / F-TA1 F-TA8 / D-TA7 D-TA8 D-TA9 D-TA10 — trainer attendance table.
--
-- absensiPengajar is a separate entity from absensi (legacy kegiatan
-- attendance) per D-TA7/R-TA1 — do not merge into the absensi table even
-- though the status enum (Hadir/Izin/Alpa) matches today. Without this
-- table, server/bootstrap.php::entityConfig() already points writes at
-- `absensi_pengajar`, so any real write (TA.B.2) fails at the SQL layer
-- with "Table 'absensi_pengajar' doesn't exist" even though validation
-- (server/validation/entities.php::validateAbsensiPengajar()) already
-- passes cleanly.
--
-- cabang_id is NOT NULL here — unlike legacy absensi (cabang_id NULL) —
-- because validateAbsensiPengajar() already hard-requires a non-empty
-- cabangId (see docblock in server/validation/entities.php). The column
-- definition must agree with what the validator enforces, or a record
-- that passes validation could still fail the DB constraint, or worse,
-- a constraint looser than the validator would let bad data in some
-- other write path.
--
-- Idempotence (taste #35): CREATE TABLE IF NOT EXISTS is a no-op when
-- re-applied; guarded additionally by the `migrations` table row that
-- server/bootstrap.php::runMigrations() records on success, so this file
-- runs exactly once per database.
--
-- Reference-preserving: this only adds a new table, no existing table or
-- column is touched. Fresh installs also see this table because
-- server/schema.sql carries the same definition (added alongside this
-- migration, single source of truth for the column shapes).
--
-- Naming: server/migrations/<timestamp>-<slug>.sql. The 2026-09-22 prefix
-- sorts after 2026-09-12-logo-nullable-cabang.sql, so it applies last.
-- The `;\n` statement terminator is part of the file's contract with
-- runMigrations()' splitter.

CREATE TABLE IF NOT EXISTS absensi_pengajar (
    id VARCHAR(191) NOT NULL PRIMARY KEY,
    cabang_id VARCHAR(191) NOT NULL,
    version INT UNSIGNED NOT NULL DEFAULT 1,
    payload JSON NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_absensi_pengajar_cabang_created (cabang_id, created_at),
    INDEX idx_absensi_pengajar_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
