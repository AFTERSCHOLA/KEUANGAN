# Trainer Self-Scope Fix Plan — Asisten Sees Assigned Schools

**Goal:** An asisten (e.g. Alifah Maharan, whose assignment lives on the host trainer's record) sees her assigned schools in Absensi Saya on any date inside `aktif + periodeMulai..periodeSelesai`.

**Architecture:** Stop deriving the school list from `readCached('trainer')` (own-record-only for role trainer). Add a privacy-safe server lane returning only the caller's own assignment rows, and make `TrainerAttendanceForm` consume it plus the existing server-scoped `sekolah` cache. No PII of other trainers ever reaches the client.

**Tech Stack:** PHP (`server/api/`), React (`src/features/attendance/`), Playwright + existing `tests/trainer-attendance-form.spec.js` idiom, production build.

**Spec:** `docs/TRAINER_ATTENDANCE_PLAN.md` §5.2, §10 R-TA6/R-TA7/R-TA8/R-TA15; root-cause evidence in `docs/TRAINER_SELF_SCOPE_AUDIT.md` §1.

## Global Constraints

- Trainer role never receives other trainers' PII (nama/WA/honor of host trainers stay server-side).
- `R-TA8` stays: school selectable only when an `aktif` assignment covers the picked `tanggal`.
- `R-TA15` stays: history remains ownership-only, no date gate on read.
- Indonesian UI copy unchanged (`Tidak ada penugasan aktif...` string stays).
- Smallest slice first; no refactor of `isWithinScope` trainer branch in this chain.

## Review Focus

- Asisten with only `asistenIds[1]` (2nd-assistant slot) on host record sees the school — expect visible.
- Assignment with `periodeSelesai=""` (empty string, not null) behaves as open-ended — expect visible (matches `isAssignmentActiveOnDate`).
- `coverOf` assignment without live origin stays hidden — expect hidden.
- Trainer with zero assignments sees the existing empty message, not a crash — expect message.
- Rapid tanggal changes across month boundary keep `periode` derivation `tanggal.slice(0,7)` — expect correct period on write.

---

## 1. Context

`TrainerAttendanceForm.jsx:49-65` loops `readCached('trainer')`. For role trainer that cache is own-record-only (`authorize.php:163-166`), so an asisten whose rows live on the host record always computes an empty set, while the server write gate (`trainerHasActiveAssignment`, scans all rows) would ALLOW the same write. Dashboard, bell, and timetable share the pattern (see audit doc §2).

## 2. Decisions

- **D1 (Concrete pick):** new `GET /api/myPenugasan.php`, trainer-only, returns `[{ sekolahId, periodeMulai, periodeSelesai, aktif, peran }]` for the caller only. Not a full trainer payload, not an enrichment on `sekolah`.
- **D2:** client stores the result in-memory per session (not in the `afterschola_v4_*` localStorage trainer key, to avoid widening the cached PII surface).
- **D3:** `TrainerAttendanceForm` derives `validSekolahForDate` from `sekolah` cache ∩ myPenugasan date predicate (`isAssignmentActiveOnDate`, shared, not forked). `penugasanInvolvesTrainer` loop over trainer cache is deleted from this file.
- **D4:** the same file gains the standard `subscribeStore` + mount `read()` pattern (mirrors `TrainerAttendanceAdmin.jsx:49-60`) so post-hydrate data appears without remount; dead `dataRev` state is removed.

## 3. Data model

```text
myPenugasan row
{ sekolahId, periodeMulai, periodeSelesai|null, aktif, peran: 'I'|'A' }
```

Server builds it from all `trainer.payload.penugasanPengajar[]` via the existing union (`trainerId`/`asistenId`/`asistenIds[]`), same predicate family as `trainerHasActiveAssignment` but returns rows instead of boolean.

## 4. Access model

- `GET /api/myPenugasan.php`: trainer-only (own rows). `admin_cabang`/`superadmin`: 403 (they use `PenugasanManager` + full trainer cache).
- No `sekolahId` query param filtering server-side in v1 (YAGNI; client filters by date).

## 5. UI concept

No visual change. Same date picker, same school dropdown, same empty message. Only the source of the dropdown options changes, plus it now updates after hydrate.

## 6. Rules

- **R1:** Never return host trainer PII from the new lane.
- **R2:** Date predicate is `isAssignmentActiveOnDate` (client) mirroring `trainerHasActiveAssignment` (server); do not fork a third copy.
- **R3:** This chain does not change `isWithinScope`, `read.php` trainer scoping, or history read scope.
- **R4:** Each microtask has one VERIFY; later work starts only after the gate passes.

## 7. Deferred

Broader surfaces with the same pattern (dashboard, bell, timetable, `AttendanceForm` staleness) are inventoried in `docs/TRAINER_SELF_SCOPE_AUDIT.md` §2 and explicitly out of scope here.
