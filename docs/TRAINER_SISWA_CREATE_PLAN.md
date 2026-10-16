# Trainer Scoped Siswa Create — Plan

**Status:** Approved 2026-10-16 (option A: trainer create scoped to assigned schools, adaptive).
**Companion:** `docs/TRAINER_SISWA_CREATE_MILESTONES.md` (ordered MICROTASK chain TS.1–TS.3).
**Position:** Narrow privilege expansion on top of `SCOPE_EXPANSION_PRIVILEGES.md`. All decisions in `IMPLEMENTATION_PLAN.md` and `SCOPE_EXPANSION_PLAN.md` remain in force unless explicitly revised in §4 below. If this file disagrees with those two, **this file wins for the Data Siswa trainer-create scope only**.

---

## 1. Context and inputs

- Today there is exactly one Student creation path: `src/features/students/StudentList.jsx` (`openAdd` at :68–82, `save` at :92–107 via `writeRemote("siswa", form)`, form `SiswaForm` at :593–810).
- Trainers are forced into read-only mode: `src/App.jsx:377` renders `<StudentList readOnly />` for `role === "trainer"`. The button hides at `StudentList.jsx:162,221`, modals at `:179,540`, the Aksi column at `:264,420` (colSpan at `:274–282` compensates).
- The server has no trainer Siswa write lane: `server/auth/authorize.php:342–405` covers only `absensi`, `absensiPengajar`, `raport`, and denied `eksternal`; anything else falls to `return false` at `:405` (403). Confirmed by `server/tests/authorize.policy.php:210–215`.
- `cabangId` is never trusted from the client: `server/api/siswa.php:31–47` rejects a sent `cabangId` (422) and derives it from `sekolahId`. Validation (`server/validation/entities.php:406–449`) only checks `cabangId == sekolah.cabang`, not trainer assignment.
- Assigned-school sources already exist on both sides. Client: `src/lib/store.js:100–114` (`trainerHasAnyActiveAssignmentToSekolahClient`) plus legacy `trainer.sekolahIds` plus the server-scope snapshot. Server: `trainerHasActiveAssignment` (`server/auth/authorize.php:76–142`, date-gated via `periodeMulai`/`periodeSelesai`, trainer/asisten union via `penugasanInvolvesTrainer` parity). Both are live reads, so filtering on them is adaptive by construction: a new assignment makes the new school eligible with no cache to invalidate.
- The attendance empty state (`src/features/attendance/AttendanceForm.jsx:292–293`) has no creation entry and stays untouched in this slice.
- Delete cascades server-side (`nullifyAbsensiSiswaId`, `server/api/siswa.php:66–97`; sppPayments rows survive append-only). Delete therefore stays admin-only.

---

## 2. Goals and non-goals

### Goals

1. Trainer can add a Student through the existing "Tambah Siswa Baru" button and the existing `SiswaForm` (same labels, same Indonesian copy, same validation idiom).
2. The school dropdown in that flow lists only the schools the trainer is assigned to, and adapts automatically when assignments change.
3. The privilege boundary is explicit and narrow: create-only, assignment-scoped, server-enforced. Anything outside that scope still returns 403.
4. The privilege matrix, the plan, and the code agree with each other when the gate closes (no silent broadening).

### Non-goals

- No change to Edit / Delete / payment actions (Aksi column stays hidden for trainers).
- No change to attendance forms, billing rules, Trial semantics (M5.4.3 untouched), or the finance/invoice ledger.
- No new components, no new UI pattern, no new status default. Typo-fix-by-trainer (update lane) is an explicit follow-up candidate, not this slice.

---

## 3. Findings (grounded in current source)

- **F1:** Single creation path with trainer forced to `readOnly` — `src/App.jsx:377`; `StudentList.jsx:68–107` (logic), `:162,221` (button), `:179,540` (modals), `:264,420` + `:274–282` (Aksi column + colSpan).
- **F2:** No trainer Siswa write lane — `server/auth/authorize.php:342–405` ? `:405`; `server/api/siswa.php:31–47` (server-derived `cabangId`); `server/validation/entities.php:406–449` (no assignment check).
- **F3:** Assigned-school sources exist on both sides and are live reads — `src/lib/store.js:100–114,220–233`; `server/auth/authorize.php:76–142`.
- **F4:** Attendance empty state has no creation entry — `src/features/attendance/AttendanceForm.jsx:292–293` (out of scope, stays text-only).
- **F5:** Delete cascade + append-only payments — `server/api/siswa.php:66–97`; delete stays admin-only.

---

## 4. Decisions (approved)

- **D1:** Option A approved 2026-10-16 — trainer self-add of Students, scoped to assigned schools only, adaptive to new assignments.
- **D2 (concrete pick):** Same button, same form. Only the school list is filtered. `openAdd` defaults to the first *allowed* school instead of global `sekolah[0]`; an empty allowed list disables the button with the hint "Belum ada sekolah penugasan" and no submit is possible.
- **D3 (concrete pick):** Create-only. Trainer `update` / `delete` / `correct` / `verify` on `siswa` stay denied server-side; the Aksi column stays `!readOnly`-only client-side.
- **D4 (concrete pick):** Server gate = live-DB `aktif` assignment covering that `sekolahId` at today (trainer or asisten position, `penugasanInvolvesTrainer` parity, `periodeMulai`/`periodeSelesai` + cover-link handling per `authorize.php:76–142`). A new assignment is immediately eligible.

---

## 5. Rules (binding on all microtasks)

- **R1:** The server is authoritative; the UI is a mirror (`SCOPE_EXPANSION_PRIVILEGES.md:119–126`). A forged or unassigned `sekolahId` returns 403 even if the client is bypassed.
- **R2:** `cabangId` is never trusted from the client (`server/api/siswa.php:33–35` stays as-is). Cross-branch `sekolahId` returns 403.
- **R3:** Every F/D/R id referenced by the milestones must exist in both documents (verified by grep before the gate closes). No orphan ids, no dead code, no `console.log` in `src/`.

---

## 6. Privilege boundary (explicit, per taste #33)

| Action on Data Siswa | Superadmin | Admin Cabang | Trainer (after this plan) |
|---|---|---|---|
| Create, own/assigned scope | Full | Full own branch | Assigned schools only (D4 gate) |
| Update | Full | Full own branch | Denied (D3) |
| Delete | Full | Full own branch | Denied (F5 cascade risk) |
| Read | Full | Own branch | Assigned + snapshot scope (unchanged) |

No existing lane is widened: the trainer lane is additive and the narrowest of the three. Broadening it later (e.g. update lane) requires a new decision and a new microtask, not a silent edit.

---

## 7. File assignment map

| Area | Files |
|---|---|
| Server lane + policy tests | `server/auth/authorize.php`, `server/tests/authorize.policy.php`, `server/tests/endpoint.protection.php` |
| Frontend scope | `src/App.jsx`, `src/features/students/StudentList.jsx` (incl. `SiswaForm` school select), `src/lib/__tests__/` (scoped-schools unit) |
| Docs | `docs/SCOPE_EXPANSION_PRIVILEGES.md` (Data Siswa row), this plan + companion milestones |

---

## 8. Alignment vs existing docs (verify-the-verification gate)

| Item | Docs say | Disposition |
|---|---|---|
| Trainer Siswa read-only | `SCOPE_EXPANSION_PRIVILEGES.md:31,59` | Amended by TS.3 to "create in assigned schools (no update/delete); read rest" |
| Trainer tabs incl. Siswa read-only | `SCOPE_EXPANSION_MILESTONES.md:19` | Amended: button appears under trainer scope, actions stay hidden |
| Downhill-only privilege | `PRIVILEGES.md:10–15` | Kept — assignment scope is narrower than branch scope |
| Trial excluded from SPP | M5.4.3 | Untouched |
| Scoped trainer-write precedent | `authorize.php:390–398` (raport) | Pattern copied, not invented |
| Deferred inline-create precedent | `authorize.php:378–382` (eksternal) | Contrasted in §6; Siswa gets the lane Eksternal was denied because enrollment (unlike external persons) is answerable field work under D1 |

---

## 9. Review focus (each line is pinned to a microtask test)

1. Forged `sekolahId` outside assignment ? 403 (TS.1).
2. Expired or inactive assignment ? 403 (TS.1).
3. Trainer with zero assigned schools ? disabled button + hint, no submit path (TS.2).
4. Admin and Superadmin flows byte-identical, including the `sekolah[0]` default (TS.2 regression).
5. Cross-branch `sekolahId` (same school name, other branch) ? 403 even though `cabangId` derives from the school (TS.1).

---

## 10. What survives vs what is next

- Survives: everything outside §4 — role model, read scopes, billing, attendance, audit shape.
- Next (not this slice): trainer update lane for own-created rows (needs a decision), attendance-inline quick-add (needs a decision), admin verify queue for trainer-created Students (only if field data shows abuse).

---

**End of plan. Gate closes when every microtask in the companion milestones verifies and §5 R3 cross-checks clean.**

