# Penugasan Pengajar Plan — Assignment Write + Daily Timetable + Export

**Status:** DONE 2026-09-24 — Gates PG.A–PG.C closed (Verified per microtask in `docs/PENUGASAN_MILESTONES.md`; joint regression 16/16 + `npm test` 42/198 + `npm run build` green; closure row appended to `SCOPE_EXPANSION_MILESTONES.md` Gate PG). **Gate PG.D (double-booking guard, F-PG5/D-PG9) appended 2026-09-28 — see `docs/PENUGASAN_MILESTONES.md` Gate PG.D for its VERIFY.**
**Position:** Temporary scope-expansion chain per taste #40. It does **not** replace `IMPLEMENTATION_PLAN.md`, `SCOPE_EXPANSION_PLAN.md`, `SCOPE_EXPANSION_PRIVILEGES.md`, or `TRAINER_ATTENDANCE_PLAN.md` / `TRAINER_ATTENDANCE_MILESTONES.md`. When Gate PG.C closes, §11 records completion back on the source docs.
**Contract order:** `docs/UNIVERSAL.md` (primary contract, read first) → `docs/IMPLEMENTATION_PLAN.md` Part 2 → `docs/SCOPE_EXPANSION_PLAN.md` + `docs/SCOPE_EXPANSION_PRIVILEGES.md` (scope-expansion first-reads) → `docs/TRAINER_ATTENDANCE_PLAN.md` §5.2/§8 + `docs/TRAINER_ATTENDANCE_MILESTONES.md` (assignment contract) → this file.

---

## 1. Context and inputs

- Bug A (verified against HEAD `0058ac4`): `Absensi Saya` (`src/features/attendance/TrainerAttendanceForm.jsx:35-50`) derives its school dropdown solely from `trainer.penugasanPengajar[]` with `aktif === true` and `periodeMulai..periodeSelesai` covering the picked date — the same predicate as `trainerHasActiveAssignmentClient()` (`src/lib/store.js:63-78`) and `trainerHasActiveAssignment()` (`server/auth/authorize.php:57-94`). The Edit Trainer checkbox writes only `sekolahIds[]` (`src/features/trainers/TrainerList.jsx:449-482`, 13 refs, 0 refs to `penugasanPengajar`). Sweep: `TrainerList + SchoolList + BranchManager` contain 0 writes to `penugasanPengajar`; only tests inject it (`tests/trainer-attendance-form.spec.js:98-107`). Result: the dropdown is always empty with `TrainerAttendanceForm.jsx:116` "Tidak ada penugasan aktif untuk tanggal ini…".
- Client request (2026-09-24): a daily table with header `Tanggal: YYYY-MM-DD` and columns `Sekolah | Trainer | Asisten | Waktu`, date-adjustable defaulting to today (local timestamp), exportable as CSV or PDF. This is a read-only derived view over data the app already stores; it does not by itself write assignments.
- Existing idioms to reuse, not invent: admin table + `Modal.jsx` + `AlertDialog.jsx` (`TrainerAttendanceAdmin.jsx:153-210`, `SchoolList.jsx:411-414`); native date input defaulting to `localDateString()` (`constants.js:398-400`, `TrainerAttendanceForm.jsx:17,52-56`); weekday derivation `DAY_NAMES[getDay()]` (`TrainerDashboard.jsx:6-13`); range formatting `formatJadwalList()` (`format.js:37-43`); CSV helper `downloadCSV()` (`csv.js:10-28`); print path `PrintButton` (`components/PrintButton.jsx:10`, `window.print()`) + `printable-report`/`no-print` (`FinanceReport.jsx:138-145`, `InvoiceTemplate.jsx`, `src/print.css`).
- Timezone trap already documented in-repo: Indonesian day names are user-local; UTC parsing lags WIB and empties the schedule (`TrainerDashboard.jsx:38-45`, `constants.js:394-397`). Arbitrary picked dates must parse as local (`new Date(y, m-1, d)`), never `new Date("YYYY-MM-DD")`.

## 2. Goals and non-goals

**Goals**

1. An admin can create/deactivate an assignment so the trainer's `Absensi Saya` dropdown becomes selectable (closes Bug A).
2. A date-driven daily timetable (`Tanggal` picker, default today) shows one row per `(assignment valid that date × school slot matching that weekday)`.
3. The visible rows export identically as CSV and via the existing print-to-PDF path.
4. Privilege boundaries stay explicit; no role is broadened as a shortcut (taste #33).

**Non-goals (stay out of this chain)**

- Per-assignment time overrides (trainer does Monday slot but not Wednesday's at the same school). Time stays owned by the School form (`IMPLEMENTATION_PLAN.md` Part 2 rule 1). If the client later requires it, that is a schema extension + explicit re-plan, not a silent field add (R-PG4).
- Attendance enforcement by weekday. V1 displays the schedule; the attendance form still gates only on date-range validity (R-TA8 unchanged).
- Historical snapshots. Past/future dates resolve against current assignment + schedule state (matrix analog D-TA16).
- Bug B (multi-account sync direction, lowest priority) and Bug C (`Invalid Branch` retry needs the exact dialog text) — documented in §10, not built here (taste #13).

## 3. Findings registry (F-PG)

| ID | Finding | Evidence |
|---|---|---|
| F-PG1 | **No UI writes `penugasanPengajar`.** Assignment schema + enforcement exist; the management UI from `TRAINER_ATTENDANCE_PLAN.md §8.2` was never built (concept only, no TA.* microtask). | `TrainerList.jsx:449-482` (0 refs); `TrainerAttendanceForm.jsx:35-50` requires it; `read.php:59-66` reads it from `trainer.payload`; `trainer-attendance-form.spec.js:98` injects it by hand |
| F-PG2 | **Daily timetable requested, unplanned.** Monthly school×date recap is planned (`TRAINER_ATTENDANCE_PLAN.md §8.3`); a daily person×time table (`Sekolah \| Trainer \| Asisten \| Waktu` per `Tanggal`) appears in no plan or milestone. | `TRAINER_ATTENDANCE_PLAN.md` §8 has no daily-timetable row; `SCOPE_EXPANSION_PLAN.md` Phase A has no such table |
| F-PG3 | **Per-table export requested; hubs exist.** CSV pack (6 exports) and print-to-PDF (`window.print` + print CSS) are the sanctioned paths; no timetable export exists yet. | `src/lib/csv.js:10-28,30-119`; `PrintButton.jsx:10`; `FinanceReport.jsx:138-145`; `src/print.css` |
| F-PG4 | **Out-of-scope observations, not built here.** Bug D is downstream of F-PG1 (empty assignments → `pengajarHonorStats` → beban 0, `finance.js:83`); Bug B needs a live multi-role repro; Bug C needs the exact `AlertDialog` text retry. | Prior verification 2026-09-24; `sekolah.php:165-183`, `SchoolList.jsx:129-183`; `rg "Invalid Branch"` → 0 hits in HEAD |
| F-PG5 | **No duplicate guard on manual saves.** `PenugasanManager.save()` validates vocab/dates only (`src/lib/penugasan.js:55-102`); `trainer.php` gates cover/vocab but `validateTrainer` never did overlap checks (`server/validation/entities.php:362`). Two identical aktif rows for the same instructor persist (team Bug 7). | `PenugasanManager.jsx:153-251` (no overlap call); `entities.php:360-362`; `penugasan-manage.spec.js` (no duplicate-rejection case) |

## 4. Decision set (D-PG)

| # | Decision | Status |
|---|---|---|
| D-PG1 | **Storage model unchanged (no architecture change).** Assignments stay an embedded array on the instruktur's own `trainer.payload` per D-TA6. No new table, no new entity, no `sekolah.payload` copy (`read.php:59-66` correction stands). | Locked |
| D-PG2 | **Explicit management UI (Option A), no dual-write.** New `Penugasan Pengajar` screen writes **only** `penugasanPengajar[]` via the existing `trainer.php update` path as a full-array replace (tests confirm replace semantics, `trainer-attendance-admin.spec.js:50`). No auto-backfill from `sekolahIds`, no checkbox dual-write (rejected Option B: invents date semantics + drift risk). `sekolahIds` checkbox untouched. | Locked |
| D-PG3 | **New-row defaults.** `aktif=true`, `periodeMulai=today (local)`, `periodeSelesai=null` (ongoing, per `authorize.php:44-48`). Deactivation = set `aktif=false` (no hard delete in v1; ledger-consistent, idempotent re-run). | Locked |
| D-PG4 | **Daily derivation (concrete pick).** One output row per `(assignment valid that date × jadwal slot with `dayOfWeek === picked weekday`)`. Schools with no slot that weekday produce **zero** rows (otherwise `Waktu` is meaningless). `Waktu` = `HH:MM–HH:MM` per slot via `formatJadwalList` per entry; `Asisten` = name or `—` (R-TA13 solo valid). Flat day-grouped list (Senin→Minggu order irrelevant for single-date view; kept for CSV determinism), **not** a day-column matrix (one school can hold multiple slots). | Locked |
| D-PG5 | **Date control (concrete pick).** Native `<input type="date">`, default `localDateString()`, local parse for weekday, changing the date re-derives rows (mirrors `TrainerAttendanceForm.jsx:52-56`). Filename/period for export is the picked date (`Jadwal_Penugasan_YYYY-MM-DD.csv`), not the monthly `periode` convention. | Locked |
| D-PG6 | **Export paths (concrete pick).** CSV = new `exportJadwalPenugasanCSV()` in `src/lib/csv.js` reusing `downloadCSV()` (BOM, quoting, date filename). PDF = existing print path (`PrintButton` + `printable-report`/`no-print` + `src/print.css`), user picks "Save as PDF" — no jsPDF/new dependency (needs a concrete failure to justify one; none here). Export writes only the filtered visible rows. | Locked |
| D-PG7 | **Privilege boundary explicit (taste #33).** `superadmin` = all branches + branch filter; `admin_cabang` = own branch only (session `cabangId` is authority, never the client's — mirrors `sekolah.php:155-164`, `trainer.php:41-48`); trainer = own rows only, **no** assignment write (R-TA6/R-TA7, `authorize.php:191-212`). No `roleCanReadEntity()` change. | Locked |
| D-PG8 | **Style source (taste #11, do not invent).** Table + modal + dialogs mirror `TrainerAttendanceAdmin.jsx:153-210`; primary `bg-blue-600 hover:bg-blue-700 text-white ... rounded-xl`, export `bg-emerald-600` (Part-5 design table). Indonesian copy pinned in §7. | Locked |
| D-PG9 | **Same-host double-booking reject (concrete pick, recorded 2026-09-28).** Pairwise guard over the saved full-array payload: same `sekolahId` + both `aktif` + intersecting `periodeMulai..periodeSelesai` + same slot scope (exact triple equality; unscoped fans out and blocks anything in the same school — YAGNI idiom shared with `hasOverlappingActiveAssignment`/D-CS2, no interval matching). Same-id pairs (edit path) and cover-linked pairs (cover rows share origin scope by design) never block. Client pre-check in `save()` surfaces the pinned copy before the write; `trainer.php` 422s authoritatively so direct API writes hold too. Cross-host asisten double-booking stays deferred (§10). | Locked |

## 5. Data model (restatement, no change)

```text
penugasanPengajar[] on trainer.payload (host = instruktur record):
{ id, sekolahId, trainerId (= host id, entities.php:150-152),
  asistenId: null | trainerId, cabangId (omit or school branch),
  periodeMulai: "YYYY-MM-DD", periodeSelesai: null | "YYYY-MM-DD",
  aktif: true | false }
```

`sekolah.jadwalList[] { dayOfWeek, time, endTime }` stays the sole owner of weekly time (Part 2 rule 1). Daily row = join at read time; nothing denormalized, nothing snapshotted.

## 6. Rules (R-PG)

- **R-PG1** One concern per edit (IMPLEMENTATION R1): manager UI, daily view, CSV, print, specs are separate microtasks; never restyle while fixing logic; classNames move verbatim.
- **R-PG2** Mirror, don't invent (taste #11): new code composes `Modal`/`AlertDialog`/`PrintButton`/`downloadCSV`/`formatJadwalList`/`localDateString` idioms; Style source §4/D-PG8.
- **R-PG3** Indonesian copy pinned (§7); tests select buttons by these exact names (testing taste #5-adjacent).
- **R-PG4** Schema = verbatim (IMPLEMENTATION R8): no new fields, no renamed fields, no per-assignment time in this chain. If the schema is wrong, raise it — don't silently extend it.
- **R-PG5** Concurrency respected: `trainer` update carries `version`; 409 (`_master.php:115-123`) surfaces as "data berubah, muat ulang" — never silent overwrite.
- **R-PG6** Verification language `Verified: <command> -> <result>` / `Unverified:` (UNIVERSAL); every microtask has one OUTCOME + one falsifiable VERIFY (taste #2); narrowest check runs immediately after the first edit (taste #4/#6).
- **R-PG7** `deploy/` is generated by `npm run build:deploy` only (taste #71); never hand-edit `deploy/`; parity gate is HARD (taste #72). Source hygiene gate: no `console.log` in `src/`, no build artifacts in `git status` (taste #20).
- **R-PG8** No double booking (D-PG9): manual saves that would persist two overlapping aktif rows for one instructor are rejected with the pinned copy `Penugasan ganda: sekolah dan waktu yang sama sudah terisi pada rentang tanggal ini.` — client pre-check + server 422, same predicate both layers.

## 7. UI concept (pinned copy)

Nav item `Penugasan Pengajar` (admin/superadmin only; trainer never sees the write UI). Manager: list columns `Sekolah | Instruktur | Asisten | Mulai | Selesai | Status | Tindakan`; buttons `Tambah Penugasan`, `Simpan`, `Batal`, `Nonaktifkan`; empty `Belum ada penugasan.` Form labels: `Sekolah`, `Instruktur`, `Asisten` (+ `— Tanpa asisten —`), `Tanggal Mulai`, `Tanggal Selesai` (+ `Berlaku terus (tanpa tanggal selesai)`), `Aktif`. Daily view: header `Jadwal Penugasan`, sub `Tanggal: YYYY-MM-DD · Hari`, picker `Tanggal`, buttons `Unduh CSV`, `Cetak Laporan` (`PrintButton`), empty `Belum ada jadwal penugasan untuk tanggal ini.`

## 8. Alignment table — verify-the-verification gate (taste #68)

| Finding | Confirmed by docs (file/section) | Not documented / implied | Disposition in this chain |
|---|---|---|---|
| F-PG1 missing write UI | `TRAINER_ATTENDANCE_PLAN.md §5.2` (shape) + §8.2 (menu concept) + `read.php:59-66` (trainer.payload source); `IMPLEMENTATION_PLAN.md` D2 (ID arrays both directions) | §8.2 never became a TA.* microtask — the "who builds it" is implied, never written | New build: PG.A |
| F-PG2 daily table | Monthly matrix planned (`TRAINER_ATTENDANCE_PLAN.md §8.3`, R-TA5 derived view) | Daily person×time table never specified | New build: PG.B (derived-view analog, no re-plan of §8.3) |
| F-PG3 export | CSV pack `IMPLEMENTATION_PLAN.md M2`/M3.4 print; `csv.js` + `PrintButton` contracts | Per-table timetable export never listed | New build: PG.C (additive, hub logic reused) |
| F-PG4 out-of-scope | Bug D follows D-TA14 Gate C (`finance.js:83`); Bug C/B owned by prior threads | Exact C message + B repro are inherently runtime evidence | Deferred with owners (§10), not built here |
| F-PG5 duplicate manual rows | `PenugasanManager.jsx:153-251` (vocab/dates only); `entities.php:360-362` (never did overlap checks); no duplicate-rejection case in `penugasan-manage.spec.js` | Rejection rule + pinned copy never specified | New build: PG.D (D-PG9/R-PG8, this chain) |

## 9. Access model (explicit, no broadening)

| Action | Superadmin | Admin Cabang | Trainer |
|---|---|---|---|
| Create/deactivate `penugasanPengajar` (via host trainer update) | ✅ all branches | ✅ own branch only (session authority) | ❌ never (R-TA6) |
| Read daily timetable | ✅ all + filter | ✅ own branch | 🟡 own rows only |
| Export CSV / print | ✅ filtered view | ✅ filtered view | 🟡 own rows only |
| Server rule | bypass | `trainer.php:41-48` + `masterWrite` version/branch checks; nested `cabangId` match if sent (`entities.php:176-194`) | `authorize.php:191-212` (write path 403; no `correct` lane) |

## 10. Deferred with owners

| Item | Owner / venue | Why deferred |
|---|---|---|
| Bug C exact-message retry (`Cabang wajib dipilih` vs server 422 vs stale `Invalid Branch`) | Operator + `SchoolList.jsx`/`sekolah.php` thread | Needs runtime evidence (dialog text + `POST /api/sekolah.php` body); this chain must not patch it blind (taste #13) |
| Bug B multi-account direction repro | `MULTI_ACCOUNT_SYNC.md` MAS follow-up | Lowest priority per instruction; needs per-role `read.php?entity=sekolah` capture |
| Cross-host asisten double-booking (same asisten, same slot, two instructors) | `DOUBLE_BOOKING_PLAN.md` / `DOUBLE_BOOKING_MILESTONES.md` Gate DB (DONE 2026-09-28, same-school occupant reading) — P1/P2/P5 readings owned in its §10 | Needed a cross-host server scan; PG.D scope was same-host only per recorded decision 2026-09-28 |
| Per-assignment time overrides | Future plan amendment | Schema change; explicitly out of R-PG4 |
| Weekday enforcement on attendance | Future decision | Would change R-TA8; needs explicit business sign-off like TA.C.2b |

## 11. Write-back contract (taste #32/#43, on PG.C close)

Record `Verified:` lines per microtask in `PENUGASAN_MILESTONES.md`; mark Gates PG.A–PG.C; append the closure row to `SCOPE_EXPANSION_MILESTONES.md` (no renumbering of the existing chain — this pair is the temporary gate doc per taste #40; folding is a separate explicit task).

## 12. Cross-references

- `docs/UNIVERSAL.md`, `docs/IMPLEMENTATION_PLAN.md` (Part 2 contract, Part 5 design table + file map, Part 6 R1–R8, Part 7 validation rows), `docs/SCOPE_EXPANSION_PLAN.md`, `docs/SCOPE_EXPANSION_PRIVILEGES.md`, `docs/TRAINER_ATTENDANCE_PLAN.md`, `docs/TRAINER_ATTENDANCE_MILESTONES.md`, `docs/MULTI_ACCOUNT_SYNC.md`
- `src/features/attendance/TrainerAttendanceForm.jsx`, `src/features/attendance/TrainerAttendanceAdmin.jsx`, `src/features/auth/TrainerDashboard.jsx`, `src/features/trainers/TrainerList.jsx`, `src/lib/store.js`, `src/lib/constants.js`, `src/lib/format.js`, `src/lib/csv.js`, `src/components/PrintButton.jsx`, `src/App.jsx`, `src/print.css`
- `server/api/trainer.php`, `server/api/_master.php`, `server/api/read.php`, `server/auth/authorize.php`, `server/validation/entities.php`
