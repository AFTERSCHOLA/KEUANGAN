# Trainer Self-Scope Fix Milestones — Microtask Chain (SF.1 → SF.4)

**Companion to `docs/TRAINER_SELF_SCOPE_FIX_PLAN.md`.**
Each microtask has one observable outcome + one falsifiable VERIFY. Later work does not start until the gate passes. Taste #13: findings outside this scope are documented, not patched here.

**Source of truth:** `TRAINER_SELF_SCOPE_FIX_PLAN.md` D1–D4, R1–R4; `TRAINER_ATTENDANCE_PLAN.md` R-TA6/R-TA7/R-TA8/R-TA15.

---

## Gate exit criteria

Chain closes when:

1. Asisten with host-stored assignment sees her schools on a covered date.
2. Same asisten sees the empty message on an uncovered date.
3. No host PII reaches the trainer client.
4. Form updates after hydrate without remount.
5. Existing trainer-attendance specs + production build pass.

---

### SF.1 Server lane myPenugasan

```text
MICROTASK: Trainer-only assignment index lane

EDIT: server/api/myPenugasan.php (new),
      server/tests/my-penugasan.contract.php (new, mirrors
      server/tests/endpoint.protection.php idiom)

FINDS: F-SF1 (client scope source is own-only; server has full rows)

RULES: R1; trainer-only; union trainerId/asistenId/asistenIds[];
       aktif + periodeMulai/Selesai shape preserved verbatim

DEPENDS: none

OUTCOME: GET /api/myPenugasan.php as Alifah returns her 2 host rows
         (tridaya + sains-albiruni, peran A) with no nama/wa/honor;
         as admin returns 403; unauthenticated returns 401.

VERIFY: php server/tests/my-penugasan.contract.php
        -> "SF.1 myPenugasan returns own rows only, 0 PII fields"

DONE-IF: verify passes; only intended files added
```

### SF.2 Client fetch for myPenugasan

```text
MICROTASK: In-memory fetch for the new lane

EDIT: src/lib/myPenugasan.js (new: fetchMyPenugasan()),
      src/lib/__tests__/myPenugasan.test.js (new)

FINDS: F-SF1

RULES: R1, R2; in-memory per session (not localStorage trainer key);
       date predicate reuses isAssignmentActiveOnDate from
       src/lib/penugasan.js (no fork)

DEPENDS: SF.1

OUTCOME: given fixture rows [{sekolahId, periodeMulai: 2026-07-01,
         periodeSelesai: null, aktif: true}], helper returns the
         sekolahId for tanggal 2026-11-02 and empty for a row with
         aktif=false or periodeMulai=2026-11-03.

VERIFY: npm test -- myPenugasan
        -> 3/3 pass (covered date visible, uncovered hidden, inactive hidden)

DONE-IF: verify passes; only intended files added
```

### SF.3 Form switches source + subscribes

```text
MICROTASK: TrainerAttendanceForm uses myPenugasan + live subscribe

EDIT: src/features/attendance/TrainerAttendanceForm.jsx:37-79,132-168

FINDS: F-SF1; D3, D4

RULES: R2, R3; delete the trainers-loop derivation; derive from
       sekolah cache ∩ myPenugasan date check; add subscribeStore +
       mount read() mirroring TrainerAttendanceAdmin.jsx:49-60;
       remove dead dataRev state

DEPENDS: SF.2

OUTCOME: as Alifah (own trainer cache = own record only, sekolah
         cache = server-scoped, myPenugasan = 2 rows), opening Absensi
         Saya on 2026-11-02 shows SD Tridaya + SD Sains Albiruni;
         switching tanggal to an uncovered date shows the existing
         "Tidak ada penugasan aktif..." message and disables Simpan.

VERIFY: npx playwright test tests/trainer-attendance-form.spec.js
        -> asisten-host fixture: covered date 2 options, uncovered 0
        -> "SF.3 asisten sees host schools on covered date"

DONE-IF: verify passes; only intended files changed
```

### SF.4 Regression + build

```text
MICROTASK: Full regression and production build

EDIT: none (verification only)

FINDS: gate criteria 5

RULES: R3, R4

DEPENDS: SF.3

OUTCOME: existing attendance + scope suites still green and the
         production bundle builds.

VERIFY: npm test -- src/lib/__tests__
        + npx playwright test tests/trainer-attendance-form.spec.js
          tests/store-trainer-siswa-scope.spec.js
        + npm run build
        -> all green, build exit 0

DONE-IF: verify passes; zero src changes in this microtask
```
