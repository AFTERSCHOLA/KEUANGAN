# Trainer Scoped Siswa Create — Microtask Chain (TS.1–TS.3)

**Companion to `docs/TRAINER_SISWA_CREATE_PLAN.md`.**
This document decomposes the approved option A into strictly-ordered microtasks. Each microtask must VERIFY before the next begins. Failure becomes bounded follow-up and never silently widens scope.

**Source of truth:** `TRAINER_SISWA_CREATE_PLAN.md` §3 (F1–F5), §4 (D1–D4), §5 (R1–R3), §9 (review focus).

**Entry gate:** Plan approved 2026-10-16 (D1). `npm run setup` seeds available (`superadmin@test.local`, `admin.cabang@test.local`, `trainer@test.local` per `docs/LOCAL_SETUP.md`).

---

### TS.1 Server: trainer `siswa/create` scoped lane

```text
MICROTASK: Trainer siswa create lane (create-only, assignment-scoped)

EDIT: server/auth/authorize.php (trainer block, currently :342–405),
      server/tests/authorize.policy.php,
      server/tests/endpoint.protection.php

FINDS: F2, F3, F5

RULES: R1, R2; D4; cabangId derivation untouched (server/api/siswa.php:31–47);
       restore/manage_users/manage_branch/manage_settings/manage_backup/
       edit_tarif/write_honor_payment/settle_honor deny-list untouched;
       admin_cabang and superadmin lanes untouched

DEPENDS: none

OUTCOME: authorize("create", "siswa") returns true iff the caller is a
         trainer AND the payload sekolahId is covered by a live-DB aktif
         assignment at today (trainer or asisten position,
         penugasanInvolvesTrainer parity, periodeMulai/periodeSelesai and
         cover-link handling per authorize.php:76–142). Trainer "update",
         "delete", "correct", and "verify" on "siswa" keep returning false.
         Successful writes emit the existing siswa_created audit event with
         actor_role=trainer; no audit read surface changes.

VERIFY: npm run test:server -> green, including new trainer-siswa cases:
        assigned-school create -> 201 with server-derived cabangId;
        unassigned-school create -> 403; expired/inactive assignment -> 403;
        cross-branch sekolahId -> 403; cabangId sent in body -> 422;
        admin own-branch create -> 201 (unchanged); trainer update -> 403;
        trainer delete -> 403.
        Falsifiable check: flip one assignment aktif flag to false in the
        test fixture and the matching create case MUST turn 403.

DONE-IF: verify passes; only intended files changed; no admin/superadmin
         behavior altered; new cases persist as named regression coverage.
```

---

### TS.2 Frontend: same button, assigned-schools-only dropdown

```text
MICROTASK: Trainer-scoped Tambah Siswa (filter schools, adaptive)

EDIT: src/App.jsx:377 (pass trainerScoped for role === "trainer"),
      src/features/students/StudentList.jsx:19 (new trainerScoped prop),
      :68–82 (openAdd defaults to first allowed school),
      :162,221 (show "Tambah Siswa Baru" when trainerScoped),
      :179,540 (mount the modal for trainerScoped),
      SiswaForm :676–704 (school select renders the allowed-schools list only),
      src/lib/__tests__/ (new scoped-schools unit next to
      store-trainer-siswa-scope.test.js)

FINDS: F1, F3, F4

RULES: R1; D2, D3; mirror the existing SiswaForm idiom, do not invent;
       Indonesian copy unchanged; Aksi column stays !readOnly-only
       (:264,420 and colSpan :274–282 untouched); AttendanceForm untouched (F4)

DEPENDS: TS.1 (the client pre-block mirrors the server lane; the server
         remains the guard, so a forged client still gets 403)

OUTCOME: Trainer sees "Tambah Siswa Baru". The school dropdown lists only
         union(legacy trainer.sekolahIds, server snapshot, aktif
         penugasanPengajar incl. asisten positions) and follows new
         assignments with no code or config change. Zero allowed schools ->
         disabled button with hint "Belum ada sekolah penugasan" and no
         submit path. Edit/Delete/payment actions stay hidden for trainers.
         Admin and Superadmin rendering is unchanged, including the
         sekolah[0] default in openAdd.

VERIFY: npx vitest run src/lib/__tests__/store-trainer-siswa-scope.test.js
        -> pass, plus the new scoped-schools unit -> pass (union membership,
        empty-list hint branch, admin default untouched), then
        npm run build -> clean with no new warnings.
        Falsifiable check: remove the last assignment from the trainer
        fixture and the button MUST render disabled with the hint.

DONE-IF: verify passes; no orphan props or components; no console.log in
         src/; git status shows only intended files.
```

---

### TS.3 Privilege matrix amendment + full gate

```text
MICROTASK: Amend matrix, reconcile ids, full verification

EDIT: docs/SCOPE_EXPANSION_PRIVILEGES.md:31,59 (Data Siswa row becomes
      "create in assigned schools, no update/delete; read rest" for Trainer),
      docs/TRAINER_SISWA_CREATE_PLAN.md + docs/TRAINER_SISWA_CREATE_MILESTONES.md
      (this pair — id reconciliation only, no scope change)

FINDS: F1–F5

RULES: R3; D1–D4; every F/D/R id referenced here exists in the plan and
      vice versa (grep cross-check); no SCOPE_EXPANSION renumbering
      (standalone pair, downstream chains unaffected)

DEPENDS: TS.1, TS.2

OUTCOME: Matrix, plan, milestones, and code agree. No stale "Trainer
         read-only" claim remains on the Data Siswa row. All F/D/R ids
         resolve in both documents.

VERIFY: npm run test:server -> green; full vitest run -> green (any
        unrelated failure is labeled Remaining with owner, never patched
        here); npm run build -> clean; grep for console.log in src/ ->
        empty; id cross-check -> every F1–F5, D1–D4, R1–R3 found in both
        documents; manual end-to-end (trainer test account): add a student
        in an assigned school -> appears in Data Siswa and the attendance
        picker; attempt an unassigned school (crafted request) -> 403;
        admin add/edit/delete flow unchanged.

DONE-IF: all checks above pass; matrix row + both docs committed; exit gate
         met: trainer self-add works inside assignment scope, is blocked
         outside it, and admin flows are unchanged.
```

---

## Exit gate (whole chain)

The chain closes iff ALL of the following hold:

1. TS.1 VERIFY green (scoped 201s + 403s + 422s as specified).
2. TS.2 VERIFY green (scoped button + adaptive dropdown + disabled empty state + clean build).
3. TS.3 VERIFY green (matrix amended, ids cross-check clean, full suite + build green).
4. No widening: trainer update/delete on siswa still 403; Aksi column still hidden for trainers.
5. `git status` shows only intended files; no build artifacts, no `node_modules`/`dist` leakage.

---

**End of milestones.**

