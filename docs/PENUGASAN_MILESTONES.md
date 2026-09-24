# Penugasan Pengajar Milestones — Microtask Chain (PG.A → PG.C)

**Companion to `docs/PENUGASAN_PLAN.md`.** Decomposes the fix + daily timetable + export into strictly ordered microtasks. Each microtask must VERIFY before the next begins; a failing check becomes a bounded follow-up, not a widened edit (taste #3/#4). Later work does not start until gates pass.

**Source of truth for findings/decisions:** `PENUGASAN_PLAN.md` §3 (F-PG1–F-PG4) and §4 (D-PG1–D-PG8). The chain below does not restate plan prose; each `FINDS`/`RULES` line cites the registry. Violated invariant for the whole chain (taste bug rule, one hypothesis): *the attendance school set is empty because no UI writes the field the form reads* — F-PG1; PG.A is the single edit that tests it.

```text
MICROTASK: <one verb + one noun>
  EDIT:    <exact file(s)>
  FINDS:   <F-PG references>
  RULES:   <R-PG codes + existing invariants>
  DEPENDS: <entry dependency>
  OUTCOME: <one observable sentence>
  VERIFY:  <one falsifiable automated or executable check>
  DONE-IF: verify passes; only intended files changed
```

**Gate exit criteria (the chain closes when all hold):**

1. Admin-created active assignment makes the trainer's `Absensi Saya` dropdown selectable for an in-range date (F-PG1 closed; Bug D unblocked as a consequence, not a separate build).
2. Daily view for a picked `Tanggal` lists exactly `(assignments valid that date × school slots matching that weekday)` with columns `Sekolah | Trainer | Asisten | Waktu` (D-PG4/D-PG5).
3. CSV export is byte-equal to the visible rows with a date filename; print preview shows the same rows without toolbar chrome (D-PG6).
4. No role can read/write outside its §9 boundary; trainer assignment-write stays 403.
5. `npx playwright test tests/penugasan*.spec.js --workers=1` green with zero pageerror/console-error; full regression + `npm run build` green; unrelated failures labeled pre-existing with evidence (taste #9).
6. Every microtask carries `Verified: <command> -> <result>`; §11 write-back recorded; no `console.log` in `src/`, no build artifacts in `git status`.

---

## Gate PG.A — Assignment write (closes Bug A; F-PG1; D-PG1–D-PG3, D-PG7–D-PG8)

### PG.A.1 Build assignment manager

```text
MICROTASK: Build penugasan manager
  EDIT:    src/lib/penugasan.js (new, pure newPenugasanRow + validateRowDates only),
           src/features/penugasan/PenugasanManager.jsx (new, list + Tambah + Nonaktifkan via host-trainer full-replace update),
           src/App.jsx (tab registry entry Penugasan Pengajar, admin/superadmin only — single registry block)
  FINDS:   F-PG1; D-PG1, D-PG2, D-PG3, D-PG7, D-PG8
  RULES:   R-PG1, R-PG2, R-PG3, R-PG4, R-PG5, R-PG7; mirror TrainerAttendanceAdmin.jsx:153-210 table + Modal/AlertDialog idiom, classNames verbatim; Indonesian copy pinned (Penugasan Pengajar / Tambah Penugasan / Simpan / Batal / Nonaktifkan / Belum ada penugasan.); trainerId must equal host id (entities.php:150-152); nested cabangId omitted or school branch; top-level cabangId never sent (trainer.php:41-60 via prepareWritePayload); version carried, 409 surfaces re-read copy; deploy/ untouched
  DEPENDS: none
  OUTCOME: an admin creates one active assignment (defaults aktif=true, mulai=today local, selesai=null) and it persists across refresh.
  VERIFY:  npx playwright test tests/penugasan-manage.spec.js --workers=1 -> admin creates assignment, refresh, readCached('trainer') contains the row with aktif=true and in-range dates; validator rejects mismatched trainerId and out-of-order selesai<mulai with pinned copy; zero pageerror
  DONE-IF: verify passes; only intended files changed

  PG.A.1 → Verified: npx playwright test tests/penugasan-manage.spec.js --workers=1 -> 1 passed (19.4s), zero pageerror; row persists across reload in table + localStorage + /api/read.php?entity=trainer
```

### PG.A.2 Prove attendance unblocked

```text
MICROTASK: Prove Absensi Saya unblocked
  EDIT:    tests/penugasan-attendance-unblock.spec.js (new, persists per taste #16)
  FINDS:   F-PG1; D-PG1, D-PG2
  RULES:   R-PG6; role-based locators (getByRole), date-aware today fixture (no hardcoded dates), assert zero pageerror (favicon allowlist only), verify store state directly where UI hides the invariant (readCached penugasanPengajar)
  DEPENDS: PG.A.1
  OUTCOME: the trainer assigned in PG.A.1 can now select that school in Absensi Saya for an in-range date.
  VERIFY:  npx playwright test tests/penugasan-attendance-unblock.spec.js --workers=1 -> trainer opens Absensi Saya, picks today, school dropdown contains the assigned school and saves one Hadir; php server/tests/entity.validation.php + php server/tests/endpoint.protection.php stay green (assignment-scope leg)
  DONE-IF: verify passes; only intended files changed

  PG.A.2 → Verified: npx playwright test tests/penugasan-attendance-unblock.spec.js --workers=1 -> 1 passed (19.9s), zero pageerror; assignment created via UI (not API seed), trainer dropdown contains school + Hadir saved
```

---

## Gate PG.B — Daily timetable view (F-PG2; D-PG4, D-PG5, D-PG7–D-PG8)

### PG.B.1 Build daily timetable

```text
MICROTASK: Build daily timetable view
  EDIT:    src/lib/penugasan.js (add buildDailyTimetable({ trainers, sekolah, tanggal }) pure join),
           src/features/penugasan/PenugasanTimetable.jsx (new, Tanggal picker + derived table),
           src/lib/__tests__/penugasan-timetable.test.js (new, unit pins derivation)
  FINDS:   F-PG2; D-PG4, D-PG5, D-PG7, D-PG8
  RULES:   R-PG1, R-PG2, R-PG3, R-PG4; date input mirrors TrainerAttendanceForm.jsx:52-56 (default localDateString, change re-derives); weekday via local parse new Date(y, m-1, d) + DAY_NAMES map (never UTC-string parse — TrainerDashboard.jsx:38-45 trap); one row per (valid assignment x matching slot), zero rows when no slot that weekday; Asisten shows name or —; header shows Tanggal: YYYY-MM-DD · Hari; trainer sees own rows only; classNames verbatim, no new palette
  DEPENDS: PG.A.2
  OUTCOME: picking a date lists exactly Sekolah | Trainer | Asisten | Waktu for that weekday.
  VERIFY:  npm test -- penugasan-timetable + npx playwright test tests/penugasan-timetable.spec.js --workers=1 -> seeded school with 2 same-day slots expands to 2 rows with Waktu text equal to formatJadwalList per slot; Thursday pick hides Wednesday rows; empty date shows Belum ada jadwal penugasan untuk tanggal ini.; zero pageerror
  DONE-IF: verify passes; only intended files changed

  PG.B.1 → Verified: npx vitest run src/lib/__tests__/penugasan-timetable.test.js (4/4) + npx playwright test tests/penugasan-timetable.spec.js --workers=1 -> 1 passed (13.9s), zero pageerror; 2-slot expansion + other-date empty state proven. Deviations (one line each): unit run used explicit vitest paths (filtered `npm test -- x` also matches tests/*.spec.js under vitest — pre-existing); App.jsx tab wiring added beyond the 3 listed files (required for the UI VERIFY); getByLabel unused for the dateless-label picker (app-wide missing htmlFor/id pattern) — structural `main input[type=date]` + native-setter input event instead.
```

---

## Gate PG.C — Export + hardening + write-back (F-PG3–F-PG4; D-PG6–D-PG8)

### PG.C.1 Add CSV export

```text
MICROTASK: Add timetable CSV export
  EDIT:    src/lib/csv.js (add exportJadwalPenugasanCSV reusing downloadCSV),
           src/features/penugasan/PenugasanTimetable.jsx (add Unduh CSV emerald button, exports filtered visible rows only)
  FINDS:   F-PG3; D-PG6, D-PG7
  RULES:   R-PG1, R-PG2, R-PG3; headers [Sekolah, Trainer, Asisten, Waktu, Tanggal] pinned Indonesian; filename Jadwal_Penugasan_YYYY-MM-DD.csv (date-based per D-PG5, not monthly periode); BOM + quoting via downloadCSV so Excel opens it; export scope equals table scope (never more)
  DEPENDS: PG.B.1
  OUTCOME: Unduh CSV downloads a file whose rows equal the visible table.
  VERIFY:  npx playwright test tests/penugasan-export.spec.js --workers=1 -> download event fires, filename matches picked date, parsed CSV rows equal table cell text (comma names stay quoted, Excel BOM present); zero pageerror
  DONE-IF: verify passes; only intended files changed
```

### PG.C.2 Add print path

```text
MICROTASK: Add timetable print path
  EDIT:    src/features/penugasan/PenugasanTimetable.jsx (printable-report wrapper + PrintButton with no-print toolbar)
  FINDS:   F-PG3; D-PG6
  RULES:   R-PG1, R-PG2; reuse PrintButton.jsx:10 window.print() + src/print.css (no new dep, no new print idiom); button label Cetak Laporan; toolbar carries no-print so chrome never prints
  DEPENDS: PG.C.1
  OUTCOME: Cetak Laporan prints the same rows the screen shows, without buttons.
  VERIFY:  npx playwright test tests/penugasan-export.spec.js --workers=1 (print leg, window.print intercepted per testing taste #29) -> print called once, printable document contains picked Tanggal + all visible Waktu values, no toolbar text in print DOM
  DONE-IF: verify passes; only intended files changed
```

### PG.C.3 Harden and write back

```text
MICROTASK: Harden penugasan chain and write back
  EDIT:    tests/penugasan*.spec.js (keep as regression per taste #16; remove any one-off debug specs),
           docs/PENUGASAN_PLAN.md + docs/PENUGASAN_MILESTONES.md (Verified lines + status),
           docs/SCOPE_EXPANSION_MILESTONES.md (append closure row only — no renumbering of the existing chain)
  FINDS:   F-PG1–F-PG4
  RULES:   R-PG6, R-PG7; full loop npm test + npx playwright test tests/penugasan*.spec.js --workers=1 + existing tests/trainer-attendance*.spec.js + npm run build; unrelated failures labeled pre-existing with git-stash evidence (taste #9); re-run original acceptance (PG.A.2 unblock leg) before declaring done (taste #10); no console.log in src/ (grep gate), git status clean of artifacts; deploy/ only via npm run build:deploy (HARD parity gate)
  DEPENDS: PG.C.2
  OUTCOME: the chain is regression-pinned and the source docs reflect what actually shipped.
  VERIFY:  npm test -> green; npx playwright test tests/penugasan*.spec.js tests/trainer-attendance*.spec.js --workers=1 -> green zero pageerror; npm run build -> green; node -e ID check -> every F-PG/D-PG/R-PG cited below exists in PENUGASAN_PLAN.md
  DONE-IF: verify passes; only intended files changed
```

---

## Ordering rationale

- **PG.A before PG.B:** the timetable is a derived view over assignments; building the view first would be unverifiable against an always-empty source (taste: smallest slice that runs end-to-end, falsifiable).
- **PG.A.1 before PG.A.2:** the write must persist before the unblock claim can be tested; the unblock spec is the falsifiable check for the bug hypothesis, not a second feature.
- **PG.B before PG.C:** export/print serialize the visible rows; serializing before the rows are pinned would bake in a wrong shape.
- **PG.C.1 before PG.C.2:** CSV asserts exact cell equality (stronger), print asserts rendered parity (weaker); strong first.
- **PG.C.3 last:** hardening + write-back only after every behavior above is green.

## Deferred with owners

| Item | Owner / venue | Why deferred |
|---|---|---|
| Per-assignment time overrides | Future plan amendment (schema change) | Barred by R-PG4; needs explicit re-plan, not a silent field |
| Weekday enforcement on attendance | Business sign-off (TA.C.2b analog) | Would change R-TA8; display-only in this chain |
| Bug B direction repro | `MULTI_ACCOUNT_SYNC.md` follow-up | Lowest priority; needs runtime per-role captures |
| Bug C exact-message retry | `SchoolList.jsx`/`sekolah.php` thread | Needs pasted dialog + network body (taste #13: document, don't patch blind) |

## Completion contract

```text
assignment write -> self-attendance unblock -> daily timetable
  -> CSV export -> print path -> regression + build + write-back
```

Every arrow has a `Verified: <command> -> <result>` line before the chain closes. Dead code/orphan probes are purged at PG.C.3 (taste quality gate), not left as follow-ups.
