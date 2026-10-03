-- Slice 1 Raport (2026-10-03) — tabel raport semester per siswa.
--
-- Satu record per (siswaId, semester, tahunAjaran): simpan ulang adalah
-- koreksi record yang sama (load-to-correct, meniru Riwayat Absensi),
-- bukan duplikat. Nilai snapshot (tingkatSnapshot/mapelSnapshot) tinggal
-- di payload JSON — edit Data Siswa tidak menulis ulang raport lama
-- (display-cache pattern seperti `sekolahNama`).
--
-- Tanpa kolom `correction_of` — meniru tabel `sekolah`, bukan ledger
-- honorPayments/absensiPengajar. cabang_id NOT NULL karena
-- server/validation/entities.php::validateRaport() mewajibkan cabangId
-- dan mencocokkannya dengan cabang sekolah siswa (pola validateSiswa):
-- definisi kolom harus setuju dengan yang ditegakkan validator.
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
-- Naming: server/migrations/<timestamp>-<slug>.sql. The 2026-10-03 prefix
-- sorts after earlier migrations, so it applies last.
-- The `;\n` statement terminator is part of the file's contract with
-- runMigrations()' splitter.

CREATE TABLE IF NOT EXISTS raport (
    id VARCHAR(191) NOT NULL PRIMARY KEY,
    cabang_id VARCHAR(191) NOT NULL,
    version INT UNSIGNED NOT NULL DEFAULT 1,
    payload JSON NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_raport_cabang_updated (cabang_id, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
