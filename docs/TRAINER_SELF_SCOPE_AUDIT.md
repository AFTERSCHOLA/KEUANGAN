# Trainer Cache/Scope Audit — Same-Bug Sweep (No Fix In This Doc)

**Goal:** Inventory every other place that derives trainer assignment scope from the own-only trainer cache or from stale snapshots, so a later chain can fix them without re-investigating.

**Scope:** Read-only audit. No src changes here. Findings are seconded for a later plan; nothing below authorizes an edit.

**Method:** Searched all `readCached('trainer')` / `trainerHasAnyActiveAssignmentToSekolahClient` / `penugasanInvolvesTrainer` call sites, then checked each against the server contract (`authorize.php:trainerHasActiveAssignment` scans all rows; `read.php` trainer lane returns own record only; `readCached('sekolah')` is server-scoped + snapshot-backed).

## 1. Root pattern (proven)

- Client source: `readCached('trainer')` for role trainer = own record only (`server/auth/authorize.php:163-166`).
- Server truth: assignment scan covers all trainer payloads (`server/auth/authorize.php:76-142`).
- Mismatch proven: `Verified: node check5.cjs -> 2026-11-02 FULL=[tridaya,sains-albiruni] OWN=[]`.
- Hygiene amplifier: dead `dataRev` + missing `subscribeStore`/`read()` effect leaves the wrong answer on screen after hydrate.

## 2. Findings

| ID | Location | Pattern | Effect for asisten (host-stored rows) | Severity | Problematic? |
|---|---|---|---|---|---|
| F1 | `src/features/attendance/TrainerAttendanceForm.jsx:37-65,165-167` | Valid schools from trainer-cache loop; dead `dataRev`, no subscribe/read | Covered date shows "Tidak ada penugasan aktif", dropdown disabled; server would ALLOW | Immediate | Yes — fixed by `TRAINER_SELF_SCOPE_FIX_*` chain |
| F2 | `src/features/auth/TrainerDashboard.jsx:25,71-87` | `assignedSchools`/`tomorrowSchools` = `sekolahIds` ∪ `trainerHasAnyActiveAssignmentToSekolahClient` (trainer-cache scan), no snapshot | Dashboard "Tidak ada sekolah terjadwal hari ini" on a day the trainer is actually assigned; `done` badge also misses host rows | High | Yes — same root, deferred |
| F3 | `src/components/NotificationBell.jsx:62-70` | Trainer lane filters `sekolah` by `sekolahIds` ∪ `trainerHasAnyActiveAssignmentToSekolahClient` | Bell misses today's/tomorrow's assigned schools for asisten; count understated | Medium | Yes — same root, deferred |
| F4 | `src/features/penugasan/PenugasanTimetable.jsx:92-113` | `buildDailyTimetable({trainers own-only...})` then `penugasanInvolvesTrainer` filter | Asisten timetable empty despite live assignments; admin view unaffected (full cache) | Medium | Yes — same root, deferred |
| F5 | `src/features/attendance/AttendanceForm.jsx:29-31,63-67` | `trainerIdsForSekolahOnDate(trainers...)` over trainer cache; dead `dataRev`, no subscribe | Empty trainer picker for newly assigned schools until remount; trainer role never uses this form in practice, admin cache is full so usually masked | Low | Problematic as hygiene, deferred |
| F6 | `src/lib/store.js:230-251` `isWithinScope` trainer branch | Secondary client filter re-checks `trainerHasAnyActiveAssignmentToSekolahClient` for sekolah/siswa/eksternal | Masked today by `persistTrainerScopeSnapshot` (snapshotIds OR-path saves `readCached('sekolah')`), but any caller that bypasses the snapshot path re-exposes F1–F4 | Low now / High if snapshot removed | Fragile by design, deferred |

Not affected (checked, no action): `TrainerAttendanceAdmin.jsx`, `TrainerAttendanceRecap.jsx`, `TrainerAttendanceSummary.jsx`, `RiwayatAbsensi.jsx`, `TrainerHistory.jsx` — all read `absensiPengajar`/`absensi` by ownership-only (`R-TA15`), no assignment-date derivation, so host-vs-own storage is irrelevant.

## 3. Hygiene vs caching verdict

Both. The load-bearing defect is architectural (wrong scope source: own-only cache where the contract needs cross-record assignment membership). The amplifier is hygiene (dead `dataRev`, missing `subscribeStore` + mount `read()`, `useMemo` deps that never invalidate). Fixing hygiene alone (adding subscribe) would still show the wrong answer — just a fresher wrong answer.

## 4. Recommended later chain (not started)

1. Reuse the `myPenugasan` lane from the fix chain as the single scope source for F2–F4 (dashboard, bell, timetable).
2. Delete dead `dataRev` in F1/F5 and apply the standard subscribe+mount-read idiom.
3. Add one shared selector (e.g. `assignedSekolahForTrainerOnDate`) so the predicate is not re-forked per file.
4. Regression: existing `store-trainer-siswa-scope`, `trainer-attendance-form`, plus a new asisten-host dashboard/bell fixture.

## 5. Verification status

- `Verified: node check5.cjs -> FULL=2 schools / OWN=0 schools on 2026-11-02`
- `Verified: rg-equivalent Select-String sweep -> 6 trainer-scope call sites inventoried above`
- `Unverified: production DB rows for Alifah (dump is pre-November; assumed unchanged per your note)`
- `Remaining: second chain to be planned/executed separately; no src touched by this doc`
