-- D9.2 — one-time cleanup for orphan users that predate the D9.1
-- cascade-deactivate guard in server/api/_master.php's masterDelete().
--
-- Problem: before D9.1, masterDelete() checked 7 operational tables
-- (sekolah, trainer, siswa, absensi, spp_payments, honor_payments,
-- invoices) before allowing a cabang/trainer delete, but never checked
-- `users`. A branch or trainer with no operational data but a still-
-- active login account could be deleted, leaving that user's
-- cabang_id/trainer_id pointing at a row that no longer exists while
-- `active` stayed 1 — an orphan account that could still log in.
--
-- This migration is the one-time sweep for orphans that already exist
-- from before D9.1 landed. D9.1 itself prevents new ones going forward;
-- this file does not duplicate that guard, it only cleans up history.
--
-- Idempotence (taste #35): both UPDATEs are guarded by `active = 1` AND
-- a NOT EXISTS check against the referenced table. After the first run,
-- every affected row has active = 0, so the WHERE clause matches zero
-- rows on every subsequent run — no re-deactivation, no re-audit.
--
-- Reference-preserving: only `active` and the dangling FK column
-- (cabang_id / trainer_id) are touched; every other user column
-- (username, password_hash, role, display_name, etc.) is untouched.
--
-- Audit: a synthetic 'system' actor audit_log row is written per
-- affected user, event_type = 'user_cascade_deactivated', matching the
-- event name D9.1 uses for the ongoing (non-migration) cascade path —
-- so both the historical cleanup and future cascades show up under the
-- same event_type in audit_log queries.
--
-- Naming: server/migrations/<timestamp>-<slug>.sql, applied in lexical
-- order and recorded in the `migrations` table by
-- server/bootstrap.php::runMigrations() (version key = filename minus
-- .sql).

-- Cabang orphans: active user with a cabang_id that no longer exists in `cabang`.
INSERT INTO audit_log (actor_user_id, actor_role, cabang_id, event_type, target_type, target_id, metadata)
SELECT NULL, 'system', u.cabang_id, 'user_cascade_deactivated', 'users', u.id,
       JSON_OBJECT('reason', 'orphan_cabang_cleanup_migration', 'orphaned_cabang_id', u.cabang_id)
  FROM users u
 WHERE u.active = 1
   AND u.cabang_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM cabang c WHERE c.id = u.cabang_id);

UPDATE users u
   SET u.active = 0,
       u.cabang_id = NULL
 WHERE u.active = 1
   AND u.cabang_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM cabang c WHERE c.id = u.cabang_id);

-- Trainer orphans: active user with a trainer_id that no longer exists in `trainer`.
INSERT INTO audit_log (actor_user_id, actor_role, cabang_id, event_type, target_type, target_id, metadata)
SELECT NULL, 'system', u.cabang_id, 'user_cascade_deactivated', 'users', u.id,
       JSON_OBJECT('reason', 'orphan_trainer_cleanup_migration', 'orphaned_trainer_id', u.trainer_id)
  FROM users u
 WHERE u.active = 1
   AND u.trainer_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM trainer t WHERE t.id = u.trainer_id);

UPDATE users u
   SET u.active = 0,
       u.trainer_id = NULL
 WHERE u.active = 1
   AND u.trainer_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM trainer t WHERE t.id = u.trainer_id);