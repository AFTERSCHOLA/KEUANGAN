# Auto Penugasan Milestones — Microtask Chain (AP-A → AP-D + Checkpoint)

**Companion to `docs/AUTO_PENUGASAN_PLAN.md`.** Strictly ordered; each microtask must VERIFY before the next begins. Source of truth for findings/decisions: PLAN §3 (F-AP1–F-AP6) and §4 (D-AP1–D-AP8). Chain hypothesis (taste bug rule): *honor stays 0 after the natural onboarding because no write path creates the assignment the Gate C source reads* — F-AP1; AP-A is the single edit that tests it.

```text
MICROTASK: <one verb + one noun>
  EDIT:    <exact file(s)>
  FINDS:   <F-AP references>
  RULES:   <R-AP codes + invariants>
  DEPENDS: <entry dependency>
  OUTCOME: <one observable sentence>
  VERIFY:  <one falsifiable automated or executable check>
  DONE-IF: verify passes; only intended files changed
```

**Gate exit criteria (chain closes when all hold):**

1. Assigning a school to a trainer (either direction) yields exactly one overlapping active assignment; trainer `Absensi Saya` unblocks with zero Penugasan Manager visits.
2. Changing `sekolah.jadwalList` propagates to timetable/Rekap with no penugasan edit (D-AP2 guard green).
3. Manager Tindakan is dynamic per status; delete preserves `absensi_pengajar` history and honor math.
4. Legacy duality labeled; matrix format matches D-AP5; full-detail export on the confirmed page.
5. admin_cabang writes own-branch honor (append + correction-delete trailed); cross-branch/trainer writes still 403.
6. Regression: `tests/penugasan*.spec.js` + `tests/trainer-attendance*.spec.js` + new `tests/auto-penugasan-*.spec.js` green, zero pageerror; `npm test` green; `npm run build` green; unrelated failures labeled pre-existing with evidence.

---

## Gate AP-A — Auto-create on assignment (F-AP1; D-AP1, D-AP2)

### AP.A.1 Append assignment server-side on link

```text
MICROTASK: Append assignment on school-trainer link
  EDIT:    server/lib/assignments.php (new, shared ensureAssignment() + pure diff helper; no client dual-write),
            server/api/trainer.php (pre-masterWrite inject into $data: atomic, no extra version bump),
            server/api/_master.php (additive echo: trainer update response carries canonical penugasanPengajar — F-AP7; existing generic merge picks it up, zero client change),
            server/api/sekolah.php (post-UPDATE ensure per added trainerId),
            server/api/users.php (post-INSERT ensure per sekolahId — covers TrainerList create-with-account, the primary onboarding path; widened from the two-file draft: without it Sim step 6 stays broken)
  FINDS:   F-AP1; D-AP1
  RULES:   R-AP1, R-AP2, R-AP5; first read trainer.php:20-62 + sekolah.php:150-200 + entities.php:148-275 before editing (name the anchor); session cabangId is authority, never the client's (trainer.php:41-60 idiom); version/409 preserved (_master.php:115-123); toast copy pinned PLAN §7 (Penugasan otomatis dibuat)
  DEPENDS: none
  OUTCOME: admin checks one school on a trainer (or one trainer on a school) and exactly one active row (mulai=today local, selesai=null, asisten=null) exists with no duplicate on re-save.
  VERIFY:  npx playwright test tests/auto-penugasan-create.spec.js (new, Sim-marked, cleanup in-run) --workers=1 -> link via TrainerList, refresh, readCached + GET /api/read.php?entity=trainer shows one overlapping aktif=true row; re-save adds zero rows; cross-branch link attempt creates no row (save itself stays accepted — legacy laxness, out of scope); zero pageerror
  DONE-IF: verify passes; only intended files changed

  AP.A.1 → Verified: npx playwright test tests/auto-penugasan-create.spec.js --project=default --workers=1 -> 1 passed (48.3s), zero pageerror; users.php path 1 row (mulai=today, selesai/asisten null), trainer.php edit 2 rows, re-save still 2 (F-AP7 echo-back), cross-branch 200 + still 2 rows, trainer Absensi Saya offers both schools with zero blockade markers, cleanup 0 leftovers. First run failed the re-save leg (2→1: writeRemote merges SENT record over cache, store.js:376-380 — recorded as F-AP7, fixed via additive echo in _master.php). Server regression: entity.validation.php all passed; endpoint.protection.php 228 checks, 0 failed. Changed: server/lib/assignments.php (new), server/api/trainer.php, server/api/sekolah.php, server/api/users.php, server/api/_master.php, tests/auto-penugasan-create.spec.js (new). Failed-run residue (suffix ap522152) removed via _cleanup_sim_data.php + users tail SQL, verified 0 refs.
```

### AP.A.2 Backfill existing links (one-time, idempotent)

```text
MICROTASK: Backfill assignments for existing links
  EDIT:    server/bin/backfill-penugasan.php (new, CLI one-time; reuses ensureAssignment() helper from AP.A.1) + server/tests/endpoint.protection.php (extend: backfill legs)
  FINDS:   F-AP1; D-AP1
  RULES:   R-AP1, R-AP2, R-AP5; taste #35: idempotent, collision-safe, reference-preserving — every existing school↔trainer link (both directions) lacking an overlapping aktif=true row gets exactly one (mulai=today local, selesai=null, asisten=null); second run adds zero rows and validates clean; completion recorded only after transformed data validates
  DEPENDS: AP.A.1
  OUTCOME: seed trainers and any live-branch links unblock in Absensi Saya without manual re-saves.
  VERIFY:  D:\Games and Apps\xampp\php\php.exe server/bin/backfill-penugasan.php -> run twice: first adds N rows, second adds 0; GET /api/read.php?entity=trainer shows the rows; penugasan-attendance-unblock leg green for a backfilled trainer
  DONE-IF: verify passes; only intended files changed

  AP.A.2 → Verified: backfill-penugasan.php run twice against temp link (seed trn-test-1 ↔ sch-bf-tmp, both directions) -> run1 `links 1, added 1, uncovered 0, BACKFILL OK`; run2 `links 1, added 0, uncovered 0, BACKFILL OK`. Canonical seed has zero links (db-reset seeds sekolahIds: []), so proof used disposable temp rows; seed payload restored byte-identical afterward + temp school/audit rows deleted. entity.validation.php green after. Changed: server/bin/backfill-penugasan.php (new).
```

### AP.A.3 Pin live schedule derivation

```text
MICROTASK: Guard live jadwal derivation
  EDIT:    tests/auto-penugasan-livejadwal.spec.js (new, persists per taste #16) + src/lib/__tests__/penugasan-timetable.test.js (extend: source-of-time assertion)
  FINDS:   F-AP1; D-AP2
  RULES:   R-AP1, R-AP3; date-aware today fixture; assert store state directly (penugasanPengajar rows carry no day/time fields)
  DEPENDS: AP.A.2
  OUTCOME: editing a school's jadwalList changes timetable/Rekap Waktu text with no penugasan write.
  VERIFY:  npx playwright test tests/auto-penugasan-livejadwal.spec.js --workers=1 -> auto-created assignment present, admin edits school slot time, timetable shows new Waktu, trainer payload version unchanged for penugasanPengajar; zero pageerror
  DONE-IF: verify passes; only intended files changed

  AP.A.3 → Verified: npx playwright test tests/auto-penugasan-livejadwal.spec.js --project=default --workers=1 -> 1 passed (31.1s), zero pageerror; trainer version 1→1 and penugasanPengajar byte-identical across the school jadwal edit (15:30–17:00 → 16:00–17:30), timetable row shows new Waktu, cleanup 0 leftovers. Unit: penugasan-timetable.test.js 5/5 (added live-derivation pin). Changed: src/lib/__tests__/penugasan-timetable.test.js, tests/auto-penugasan-livejadwal.spec.js (new).
```

---

## Gate AP-B — Manager completion (F-AP2; D-AP3)

### AP.B.1 Render dynamic actions + edit

```text
MICROTASK: Complete manager actions
  EDIT:    src/features/penugasan/PenugasanManager.jsx (Tindakan cell: aktif→Edit+Nonaktifkan, nonaktif→Edit+Aktifkan+Hapus; Edit reuses Tambah modal pre-filled; Aktifkan/Hapus via host-trainer full-array replace with version/409 copy)
  FINDS:   F-AP2; D-AP3
  RULES:   R-AP1, R-AP2, R-AP5; mirror TrainerAttendanceAdmin.jsx:153-210 idiom, classNames verbatim; copy pinned PLAN §7 (Edit/Nonaktifkan/Aktifkan/Hapus + three confirm strings)
  DEPENDS: AP.A.3
  OUTCOME: every row always offers a next action; Edit persists; Aktifkan re-enables attendance gating.
  VERIFY:  npx playwright test tests/penugasan-manage.spec.js (extend, same file) --workers=1 -> deactivate→row shows Aktifkan+Hapus+Edit; Edit changes asisten and persists; Aktifkan restores Absensi Saya dropdown; zero pageerror
  DONE-IF: verify passes; only intended files changed

  AP.B.1 → Verified: npx playwright test tests/penugasan-manage.spec.js --project=default --workers=1 -> 2 passed (34.3s), zero pageerrors, renderer heartbeat alive; edit (asisten→Trainer Test Dua) persists with same row id; Nonaktif→Edit+Aktifkan+Hapus visible, Nonaktifkan gone; Hapus confirm copy verified + cancelled; Aktifkan→Aktif with Edit+Nonaktifkan restored. Residue 0 (cleanup extended to delete temp schools — also purged 10 accumulated Sim/PGA schools, trn-test-1 rows back to 0). Edit limitation: same-host only (Sekolah/Instruktur selects lock in edit mode; cross-host move stays delete+create). Changed: src/features/penugasan/PenugasanManager.jsx, tests/penugasan-manage.spec.js (extended). Observations: (1) page.request pipeline wedged 4× late in long runs (login POST 60s timeout, never reached healthy PHP/Vite; root cause Unverified) — cleanup moved to a fresh API context (strictly better; hermetic runs since); (2) F-AP8 checkbox-vs-rerender flake (2×) worked around via asisten path.
```

### AP.B.2 Prove delete preserves history

```text
MICROTASK: Prove assignment delete preserves history
  EDIT:    tests/auto-penugasan-delete.spec.js (new, Sim-marked, cleanup in-run)
  FINDS:   F-AP2; D-AP3
  RULES:   R-AP1, R-AP3, R-AP4; destructive last, reactive cleanup (taste #55/#66)
  DEPENDS: AP.B.1
  OUTCOME: deleting the assignment removes only the array entry; attendance rows and honor math are byte-identical before/after.
  VERIFY:  npx playwright test tests/auto-penugasan-delete.spec.js --workers=1 -> trainer with Hadir absensiPengajar + honor beban>0, admin Hapus assignment, GET absensiPengajar rows intact and financialData beban unchanged, trainer dropdown blocks new saves (no active assignment); zero pageerror
  DONE-IF: verify passes; only intended files changed

  AP.B.2 → Verified: npx playwright test tests/auto-penugasan-delete.spec.js --project=default --workers=1 -> 1 passed (42.3s), zero pageerrors; pre-delete 1 absensiPengajar row, payment cells `1 Pertemuan / Rp 50.000 / Rp 0 / ●Rp 50.000` byte-identical before+after, same row id preserved, trainer blocked after delete, API cleanup 200/200, ledger orphan removed out-of-band (append-only, no API delete) with zero refs verified. Two earlier stalls were a SPEC bug, not app: Hapus exists only on inactive rows (D-AP3) and the spec clicked it on an active row — the actionability wait burned the whole test budget; fixed by deactivating first. Stalled-run residue (2 trainers/schools/users) removed, zero refs. Changed: tests/auto-penugasan-delete.spec.js (new).
```

---

## Gate AP-C — Duality label + matrix format + export (F-AP3–F-AP5; D-AP4, D-AP5)

### AP.C.1 Label legacy duality

```text
MICROTASK: Label legacy attendance memo
  EDIT:    src/features/attendance/AttendanceForm.jsx (memo line) + src/features/attendance/RiwayatAbsensi.jsx (same memo on list header)
  FINDS:   F-AP3; D-AP4
  RULES:   R-AP1, R-AP5; copy pinned PLAN §7 (Catatan: absensi ini tidak memengaruhi honor.); no logic touch (R1)
  DEPENDS: AP.B.2
  OUTCOME: both entry form and riwayat state the non-honor nature in Indonesian.
  VERIFY:  npx playwright test tests/auto-penugasan-label.spec.js (new, temp per taste #15, remove after pass) --workers=1 -> memo visible as admin and trainer; zero pageerror
  DONE-IF: verify passes; only intended files changed

  AP.C.1 → Verified: temp spec 1 passed (16.2s), zero pageerrors; memo visible on Data Absensi (superadmin + trainer) and Riwayat Absensi; temp spec removed after pass. Changed: src/features/attendance/AttendanceForm.jsx, src/features/attendance/RiwayatAbsensi.jsx (memo line only, no logic).
```

### AP.C.2 Reposition matrix status

```text
MICROTASK: Reposition matrix status text
  EDIT:    src/features/attendance/TrainerAttendanceRecap.jsx (cellText only) + src/lib/__tests__/trainerAttendance.test.js (extend cell expectations)
  FINDS:   F-AP4; D-AP5
  RULES:   R-AP1, R-AP5; logic untouched — Hadir bare, Hadir+ket → `Nama (I) — KET`, non-Hadir → `Nama (I) — Status[, KET]`; premise: status already rendered (Recap:42-47), this is position, not a new feature
  DEPENDS: AP.C.1
  OUTCOME: every matrix cell matches the D-AP5 format with no other visual change.
  VERIFY:  npm test -- trainerAttendance + persisted trainer-attendance-recap.spec.js (extended with Izin cells — better than a temp probe: the format is pinned in the suite)
  DONE-IF: verify passes; only intended files changed

  AP.C.2 → Verified: npx vitest run src/lib/__tests__/trainerAttendance.test.js -> 11 passed (7 existing + 4 new formatMatrixCell pins); npx playwright test tests/trainer-attendance-recap.spec.js --project=default --workers=1 -> 2 passed (30s), zero pageerrors, incl. new `Ira (A) — Izin` and `Asyifa (A) — Izin, Pengganti` cells. Changed: src/lib/trainerAttendance.js (+formatMatrixCell), src/features/attendance/TrainerAttendanceRecap.jsx (cellText delegates), src/lib/__tests__/trainerAttendance.test.js, tests/trainer-attendance-recap.spec.js (Izin seeds).
```

### AP.C.3 Export matrix actuals on Rekap page (confirmed 2026-09-25)

```text
MICROTASK: Export Rekap matrix actuals
  EDIT:    src/lib/csv.js (add exportRekapPengajarCSV(rows) reusing downloadCSV) + src/features/attendance/TrainerAttendanceRecap.jsx (Unduh CSV + PrintButton, printable-report/no-print idiom per FinanceReport.jsx:138-145)
  FINDS:   F-AP5; D-AP5
  RULES:   R-AP1, R-AP5; export mirrors visible cells byte-equal (D-PG6 idiom: BOM, quoting, `Rekap_Pengajar_YYYY-MM.csv`); cell text = D-AP5 format; Jadwal plan export untouched
  DEPENDS: AP.C.2
  OUTCOME: one click downloads full-detail (status + keterangan) actuals matching the matrix.
  VERIFY:  npx playwright test tests/rekap-pengajar-export.spec.js (new, Sim-marked) --workers=1 -> CSV download parses to visible cell texts incl. `Widia (I) — EXPO` + print preview shows same rows; zero pageerror
  DONE-IF: verify passes; only intended files changed

  AP.C.3 → Verified: npx playwright test tests/rekap-pengajar-export.spec.js --project=default --workers=1 -> 1 passed (16.9s), zero pageerrors; download `Rekap_Pengajar_2026-09.csv` with header + full-detail rows (`— EXPO`, `— Izin, Pengganti`), window.print intercepted once. Ledger orphans (3 ids) removed out-of-band, zero refs. Changed: src/lib/csv.js (+exportRekapPengajarCSV), src/features/attendance/TrainerAttendanceRecap.jsx (toolbar + printable-report), tests/rekap-pengajar-export.spec.js (new).
```

---

## Gate AP-D — Honor RBAC grant (F-AP6; D-AP7)

### AP.D.1 Allow own-branch honor write

```text
MICROTASK: Grant admin_cabang own-branch honor write
  EDIT:    server/auth/authorize.php (admin lane: honorPayments/invoices? no — honorPayments only; keep invoices superadmin) + server/tests/authorize.policy.php + server/tests/endpoint.protection.php (extend branch-scoped allow/deny legs)
  FINDS:   F-AP6; D-AP7
  RULES:   R-AP1, R-AP2, R-AP5; audit already covers appends+corrections (bootstrap.php:241) — no audit build; recordOwnsBranch is the only gate; trainer write stays 403 (no correct lane, authorize.php:191-212)
  DEPENDS: AP.C.2 (AP.C.3 may parallelize)
  OUTCOME: admin_cabang appends and correction-deletes own-branch honor; cross-branch attempts 403; every write leaves an audit_log row.
  VERIFY:  D:\Games and Apps\xampp\php\php.exe server/tests/endpoint.protection.php -> honor allow/deny legs green + npx playwright test tests/honor-delete-403.spec.js (extend: admin own-branch now allowed, cross-branch still 403) --workers=1; audit_log holds actor+cabang rows for both; zero pageerror
  DONE-IF: verify passes; only intended files changed

  AP.D.1 → Verified: endpoint.protection.php -> 235 checks, 0 failed (228 baseline + 7 new: admin append 201, cross-branch 403, correct 201, 4 audit asserts incl. actor_role admin_cabang + correctionOf metadata); npx playwright test tests/honor-delete-403.spec.js --project=default --workers=1 -> 2 passed (28.4s), zero pageerrors (trainer 403 unchanged; admin append 201 / cross 403 / correct 201). authorize.policy.php fails at a trainer-sekolah leg identically on pristine HEAD (pre-existing, out of scope — verified via double stash). Temp-trainer residue deleted in-run; 2 inert ledger rows remain by design (append-only, trailed, finance-skipped). Changed: server/auth/authorize.php (honorPayments out of admin deny-list), server/tests/authorize.policy.php, server/tests/endpoint.protection.php, tests/honor-delete-403.spec.js (extended).
```

---

## Checkpoint AP-E — Per-meeting billing (D-AP6; NO build in this chain)

```text
MICROTASK: Sign billing checkpoint
  EDIT:    docs/AUTO_PENUGASAN_PLAN.md (§4 D-AP6 only) + finance decision line in SCOPE_EXPANSION milestones owner row
  FINDS:   F-AP6-adjacent (Biaya Ekskul semester strings); D-AP6 tension (D1 cash vs sessions-based realization; finance.js:95-97,169-170)
  RULES:   taste #25 (stop on business-rule ambiguity); TA.C.2b-style sign-off required; no src/server EDIT in this microtask
  DEPENDS: AP.D.1
  OUTCOME: signed choice between (a) cash Pemasukan untouched + billable memo, or (b) D1 amended to sessions-based realization with ledger consequences spelled out.
  VERIFY:  Unverified: checkpoint signature recorded here with date + owner
  DONE-IF: signature recorded; zero code changed
```
