-- M-AF5.4 / F-20 / D-20 = A — one-time data migration.
--
-- Privacy decision: siswa.foto holds photos of minors stored locally with no
-- consent tracking. Per taste #50 (privacy-as-removal) and AUDIT_PLAN.md D-20,
-- the field is being removed from the UI; this migration nullifies any
-- pre-existing foto values so the canonical server payload no longer carries
-- the photo PII either.
--
-- Idempotence: the WHERE-clause guards on JSON_VALUE(payload, '$.foto')
-- IS NOT NULL. JSON_VALUE returns SQL NULL for both JSON-null values AND
-- for paths that don't exist (unlike JSON_EXTRACT, which returns the
-- literal string "null" for JSON-null — that's the gotcha that broke
-- the first attempt). So after the first run every foto value is JSON
-- null, JSON_VALUE returns SQL NULL, and the second pass touches zero
-- rows (taste #35).
--
-- Reference-preserving: only the $.foto key is touched; every other key
-- in the siswa payload survives untouched.
--
-- Naming: server/migrations/<timestamp>-<slug>.sql. The 2026-09-05 prefix
-- matches the date this microtask lands; the file name is the version key
-- recorded in the `migrations` table by server/bootstrap.php::runMigrations().

UPDATE siswa
   SET payload = JSON_SET(payload, '$.foto', NULL)
 WHERE JSON_VALUE(payload, '$.foto') IS NOT NULL;