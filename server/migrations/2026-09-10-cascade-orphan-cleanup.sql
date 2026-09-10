-- D9.2 / F-04 — one-time migration: clean up existing orphan users.
--
-- The dual of D9.1's runtime cascade (server/api/_master.php
-- masterDelete): D9.1 prevents NEW orphans going forward; this migration
-- neutralizes the users that were orphaned BEFORE D9.1 landed (the
-- orphans the team's manual testing surfaced — audit-app-vs-tests
-- F-04, decision D-04 = A).
--
-- Orphan definition (the predicate): an active user whose cabang_id
-- points at a row absent from `cabang`, or whose trainer_id points at
-- a row absent from `trainer`. Per the D9.2 OUTCOME, both FK columns
-- are nulled regardless of which one dangled.
--
-- Reference-preserving (taste #35): only `active`, `cabang_id`, and
-- `trainer_id` are touched — username, display_name, password_hash,
-- role, and every other users column survive, mirroring the users.php
-- soft-delete shape that D9.1's cascade reuses.
--
-- Statement ORDER is load-bearing: the audit INSERT..SELECT runs first
-- because it captures the orphan set (and their pre-cleanup dangling
-- ids) while the predicate still matches; the UPDATE below flips
-- `active` to 0, which the INSERT's `u.active = 1` gate keys on.
-- Never reorder these two statements.
--
-- Audit (F-04): one `user_orphan_cleaned` audit_log row per affected
-- user, same metadata shape as D9.1's `user_cascade_deactivated`
-- ({cabangId, trainerId}); ids only, no username/display_name (taste
-- #50 privacy). actor_user_id / actor_role are NULL — a system
-- migration has no human actor. audit_log.cabang_id keeps the user's
-- dangling branch id so the row stays queryable from the branch-scoped
-- audit views even after users.cabang_id is nulled.
--
-- Idempotence (taste #35): both statements gate on `active = 1`.
-- After the first run every orphan is active=0, so a second pass
-- inserts 0 audit rows and updates 0 users — a no-op. The primary
-- guard is the `migrations` table row that
-- server/bootstrap.php::runMigrations() records on success.
--
-- Naming: server/migrations/<timestamp>-<slug>.sql. The 2026-09-10
-- prefix is this microtask's landing date and sorts after
-- 2026-09-05-siswa-foto-purge.sql, so the two files apply in that
-- order. The `;\n` statement terminators are part of the file's
-- contract with runMigrations()' splitter.

INSERT INTO audit_log (actor_user_id, actor_role, cabang_id, event_type, target_type, target_id, metadata)
SELECT NULL, NULL, u.cabang_id, 'user_orphan_cleaned', 'user', u.id,
       JSON_OBJECT('cabangId', u.cabang_id, 'trainerId', u.trainer_id)
  FROM users u
 WHERE u.active = 1
   AND ((u.cabang_id IS NOT NULL AND u.cabang_id NOT IN (SELECT id FROM cabang))
     OR (u.trainer_id IS NOT NULL AND u.trainer_id NOT IN (SELECT id FROM trainer)));

UPDATE users
   SET active = 0,
       cabang_id = NULL,
       trainer_id = NULL
 WHERE active = 1
   AND ((cabang_id IS NOT NULL AND cabang_id NOT IN (SELECT id FROM cabang))
     OR (trainer_id IS NOT NULL AND trainer_id NOT IN (SELECT id FROM trainer)));
