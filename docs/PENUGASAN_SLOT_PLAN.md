# Penugasan Slot Plan — Per-Assignment HARI/JAM Scope

**Status:** DRAFT 2026-09-24 — Gates PS.A–PS.B open (no Verified lines yet; see `docs/PENUGASAN_SLOT_MILESTONES.md`).
**Position:** Temporary scope-expansion chain per taste #40. It does **not** replace `IMPLEMENTATION_PLAN.md`, `SCOPE_EXPANSION_PLAN.md`, `SCOPE_EXPANSION_PRIVILEGES.md`, `TRAINER_ATTENDANCE_PLAN.md` / `TRAINER_ATTENDANCE_MILESTONES.md`, or `PENUGASAN_PLAN.md` / `PENUGASAN_MILESTONES.md` (DONE 2026-09-24). It explicitly lifts the `R-PG4` bar on per-assignment time via re-plan (not a silent field add). When Gate PS.B closes, §11 records completion back on the source docs.
**Contract order:** `docs/UNIVERSAL.md` (primary contract, read first) → `docs/IMPLEMENTATION_PLAN.md` Part 2 → `docs/SCOPE_EXPANSION_PLAN.md` + `docs/SCOPE_EXPANSION_PRIVILEGES.md` (scope-expansion first-reads) → `docs/TRAINER_ATTENDANCE_PLAN.md` §5.2/§8 + `docs/TRAINER_ATTENDANCE_MILESTONES.md` → `docs/PENUGASAN_PLAN.md` §2/§4/§5 + `docs/PENUGASAN_MILESTONES.md` → this file.

---

## 1. Context and inputs

- Prior chain (DONE): assignments live as an embedded array on the instruktur's own `trainer.payload` (`PENUGASAN_PLAN.md D-PG1`, `server/api/read.php:59-66`). Manager writes only `penugasanPengajar[]` via full-array replace (`src/features/penugasan/PenugasanManager.jsx:76-91`). Daily view derives one row per `(assignment valid that date × jadwal slot with dayOfWeek === picked weekday)` (`src/lib/penugasan.js:70-102`, `PENUGASAN_PLAN.md D-PG4`). Schools with no slot that weekday produce zero rows; `Waktu` comes from `formatJadwalList([slot])`.
- Explicit bar being lifted: `PENUGASAN_PLAN.md` §2 Non-goals + `R-PG4` ("no per-assignment time in this chain; if the schema is wrong, raise it — don't silently extend it") and §10 Deferred ("Per-assignment time overrides | Future plan amendment | Barred by R-PG4"). This document is that amendment.
- Exemplar evidence (read 2026-09-24 via `openpyxl`, temp scripts only, no repo edits):
  - `docs/exemplar/JADWAL EKSTRAKULIKULER CODING___.xlsx!Sheet1 R05-R25`: weekly grid `SENIN/KAMIS/SELASA/RABU/JUMAT` with `SEKOLAH | TRAINER | ASISTEN | JAM` (e.g. `SD Tridaya | Widia Astuti | Vazira Putri | 14.15 - 15.15 WIB`; `SDN 037 Sabang` Kamis two slots `09.00 - 10.30` Vazira vs `12.15 - 13.35` Widia; `SDM 7 Bandung` Rabu three parallel rows Iqbaludin / Iqbaludin / Ditha Triyani).
  - `docs/exemplar/Jadwal Ngajar & Invoice.xlsx!Jadwal R02-R25`: `HARI | JAM | SEKOLAH | TRAINER | ASISTEN | KETERANGAN` (e.g. Rabu `SDM 7 Bandung` 13.15 Iqbaludin + 14.15 Iqbaludin + 14.15 Ditha; Kamis `SDN 037 Sabang` 09.00 Vazira + 12.15 Widia + 13.45/14.45 Paris Jundi at `SD Al-Irhaam`).
  - Consequence: one school holds multiple same-weekday slots with different people. Current `D-PG4` expansion shows the assignee in **all** slots that weekday — the exemplar assigns people per slot.
- Current shapes (grounding for the concrete pick):
  - `sekolah.jadwalList[] { dayOfWeek: 'Senin'…'Minggu', time: 'HH:MM', endTime: 'HH:MM' }` (`src/lib/constants.js:66-68`, `src/features/schools/SchoolList.jsx:542-646`, `type=time` inputs).
  - `penugasanPengajar[] { id, sekolahId, trainerId, asistenId: null|id, cabangId, periodeMulai: YYYY-MM-DD, periodeSelesai: null|YYYY-MM-DD, aktif }` (`src/lib/penugasan.js:9-28`, `server/validation/entities.php:126-199`).
- Timezone trap (reused, not re-solved): weekday is user-local; picked dates parse as local `new Date(y, m-1, d)`, never `new Date("YYYY-MM-DD")` (`PENUGASAN_PLAN.md` §1, `TrainerDashboard.jsx:38-45`, `penugasan.js:53-61`).
- Existing idioms to reuse, not invent: admin table + `Modal.jsx` + `AlertDialog.jsx` (`PenugasanManager.jsx:166-298`, mirrors `TrainerAttendanceAdmin.jsx:153-210`); `type=time` slot inputs (`SchoolList.jsx:571-599`); `downloadCSV()` + `PrintButton` + `printable-report`/`no-print` (D-PG6, untouched here).

## 2. Goals and non-goals

**Goals**

1. An admin can scope one assignment to a specific weekday and optionally a specific time range, so the daily timetable shows that person only in the matching slot(s).
2. Unscoped assignments (`null` scope) keep today's behavior byte-identical; old rows without the new fields stay valid (backward compatible, idempotent re-run).
3. `sekolah.jadwalList` stays the sole owner of time definitions; the assignment only filters (Part 2 rule 1 preserved).
4. Privilege boundaries stay explicit; no role is broadened as a shortcut (taste #33).

**Non-goals (stay out of this chain)**

- New time definitions on the assignment (free-text `14.15 - 15.15 WIB` boxes that diverge from `jadwalList`). Scope values must match the school's slot vocabulary; no parallel time source.
- Attendance enforcement by slot. V1 filters the display + export; the attendance form still gates only on date-range validity (R-TA8 unchanged) unless a later business sign-off changes it (TA.C.2b analog).
- Historical snapshots. Past/future dates resolve against current assignment + schedule state (matrix analog D-TA16).
- Honor-formula change. Slot scope does not alter `honor = Hadir × trainer.honor` (D-TA14); it only changes which timetable rows render.

## 3. Findings registry (F-PS)

| ID | Finding | Evidence |
|---|---|---|
| F-PS1 | **One assignment fans out to all same-weekday slots.** A trainer assigned to a school with two Rabu slots appears in both timetable rows, but the exemplar assigns people per slot. | `penugasan.js:84-95` (all `dayOfWeek === hari` slots expand); `Jadwal Ngajar & Invoice.xlsx!Jadwal R08-R10` (SDM 7 Rabu ×3 trainers); `JADWAL EKSTRA… R22-R23` (same) |
| F-PS2 | **Slot identity exists only on the school.** The assignment carries no weekday/time, so per-slot scoping has nowhere to live. | `penugasan.js:9-28` (no hari/jam keys); `entities.php:126-199` (no hari/jam gates); `PENUGASAN_PLAN.md` §5 (shape restatement, no time) |
| F-PS3 | **Bar was explicit, not an oversight.** Per-assignment time was deferred as a schema change requiring re-plan. | `PENUGASAN_PLAN.md` §2 Non-goals ("Time stays owned by the School form… explicit re-plan, not a silent field add (R-PG4)"); §10 Deferred row; `R-PG4` |
| F-PS4 | **Out-of-scope observations, not built here.** Slot-scoped attendance gating and slot-scoped honor weighting need business sign-off; export/print paths already exist. | `TRAINER_ATTENDANCE_PLAN.md` R-TA8/R-TA11; `PENUGASAN_MILESTONES.md` PG.C.1/PG.C.2 (CSV + print green) |

## 4. Decision set (D-PS)

| # | Decision | Status |
|---|---|---|
| D-PS1 | **Storage model unchanged (no architecture change).** Assignments stay an embedded array on the instruktur's own `trainer.payload` (D-PG1 stands). No new table, no `sekolah.payload` copy. | Locked |
| D-PS2 | **Concrete pick (taste #17): nullable triple scope on the assignment row.** New optional keys `hari: null \| 'Senin'…'Minggu'`, `jamMulai: null \| 'HH:MM'`, `jamSelesai: null \| 'HH:MM'`. `null` = unscoped (all slots). `hari` set + times `null` = that weekday, all its slots. Full triple set = only slots with exact `dayOfWeek === hari && time === jamMulai && endTime === jamSelesai`. Rejected: slot-index refs (fragile across school edits) and free-text time boxes (parallel time source, drift risk). | Locked |
| D-PS3 | **School owns time vocabulary; assignment only filters.** `jadwalList` remains the sole writer of `{dayOfWeek,time,endTime}` (Part 2 rule 1). The manager offers only values present in the picked school's `jadwalList` (plus `Semua hari` / `Semua jam`); hand-typed times outside that vocabulary are rejected with pinned copy. | Locked |
| D-PS4 | **Derivation (concrete pick).** `buildDailyTimetable` keeps its `(valid assignment × matching slot)` shape; the slot predicate gains `&& (!a.hari \|\| slot.dayOfWeek === a.hari) && (!a.jamMulai \|\| slot.time === a.jamMulai) && (!a.jamSelesai \|\| slot.endTime === a.jamSelesai)`. Partial times rejected at write (both or neither); exact string equality only, no interval overlap logic (YAGNI). Zero matching slots → zero rows for that assignment (D-PG4 analog). Deterministic order unchanged (sekolahNama → waktu → trainerId). | Locked |
| D-PS5 | **Backward compatibility (concrete pick).** Missing keys read as `null` (unscoped). Old validators accept rows without the triple; new validators accept `null` plus the school-vocabulary values only. Migration = no writes (zero-write rollover, sparse-map analog); re-running derivation is idempotent. | Locked |
| D-PS6 | **Manager UI (concrete pick).** Three extra controls in the existing `Tambah Penugasan` modal: `Hari` select (`Semua hari` + 7 names), `Jam Mulai` + `Jam Selesai` (`type=time`, disabled unless a specific `Hari` is picked; `Semua jam` = both empty). List gains a `Slot` column rendering `Semua slot` or `Senin · 14:00–15:00`. Style source D-PG8 (taste #11, do not invent). | Locked |
| D-PS7 | **Privilege boundary explicit (taste #33).** Same as PG §9: `superadmin` = all + filter; `admin_cabang` = own branch only (session `cabangId` is authority); trainer = own rows only, no assignment write (R-TA6/R-TA7). No `roleCanReadEntity()` change. | Locked |

## 5. Data model (extension, additive only)

```text
penugasanPengajar[] on trainer.payload (host = instruktur record):
{ id, sekolahId, trainerId (= host id, entities.php:150-152),
  asistenId: null | trainerId, cabangId (omit or school branch),
  periodeMulai: "YYYY-MM-DD", periodeSelesai: null | "YYYY-MM-DD",
  aktif: true | false,
  hari: null | 'Senin'|'Selasa'|'Rabu'|'Kamis'|'Jumat'|'Sabtu'|'Minggu',
  jamMulai: null | "HH:MM", jamSelesai: null | "HH:MM" }
```

Invariants: `jamMulai`/`jamSelesai` are both `null` or both `HH:MM` with `jamSelesai > jamMulai`; when set, the pair must equal at least one `jadwalList` entry for that `sekolahId` + `hari` at write time (D-PS3); `hari: null` forces both times `null` (unscoped). `sekolah.jadwalList[] { dayOfWeek, time, endTime }` unchanged.

## 6. Rules (R-PS)

- **R-PS1** One concern per edit (IMPLEMENTATION R1): schema/validators, manager UI, derivation, specs are separate microtasks; never restyle while fixing logic; classNames move verbatim.
- **R-PS2** Mirror, don't invent (taste #11): compose `Modal`/`AlertDialog`/`type=time`/`downloadCSV` idioms; Style source D-PG8.
- **R-PS3** Indonesian copy pinned (§7); tests select buttons by these exact names.
- **R-PS4** Schema additive only (IMPLEMENTATION R8 analog): no renames, no deletions, no new entities; missing triple reads as unscoped; silently writing unvalidated times is a defect.
- **R-PS5** Concurrency respected: `trainer` update carries `version`; 409 surfaces as "data berubah, muat ulang" — never silent overwrite (R-PG5 stands).
- **R-PS6** Verification language `Verified: <command> -> <result>` / `Unverified:` (UNIVERSAL); every microtask has one OUTCOME + one falsifiable VERIFY (taste #2); narrowest check runs immediately after the first edit (taste #4/#6).
- **R-PS7** `deploy/` is generated by `npm run build:deploy` only (taste #71); never hand-edit `deploy/`; parity gate is HARD (taste #72). Source hygiene gate: no `console.log` in `src/`, no build artifacts in `git status` (taste #20).

## 7. UI concept (pinned copy)

Manager modal additions (inside existing `Tambah Penugasan`, after `Asisten`): `Hari` select with `Semua hari` default + 7 day options; `Jam Mulai` + `Jam Selesai` `type=time` (empty = `Semua jam`; disabled when `Hari = Semua hari`); errors `Hari, jam mulai, dan jam selesai harus merujuk pada jadwal sekolah yang dipilih.` and `Jam selesai harus setelah jam mulai.` List columns become `Sekolah | Instruktur | Asisten | Slot | Mulai | Selesai | Status | Tindakan`; `Slot` shows `Semua slot` or e.g. `Rabu · 14:15–15:15`; empty stays `Belum ada penugasan.` Daily view headers unchanged (`Sekolah | Trainer | Asisten | Waktu`); scoped-out slots simply vanish (zero-row rule); export/print reuse PG.C paths untouched.

## 8. Alignment table — verify-the-verification gate (taste #68)

| Finding | Confirmed by docs (file/section) | Not documented / implied | Disposition in this chain |
|---|---|---|---|
| F-PS1 fan-out to all slots | `PENUGASAN_PLAN.md` D-PG4 (one row per valid assignment × matching slot); `src/lib/penugasan.js:84-95`; exemplar per-slot staffing (`Jadwal Ngajar & Invoice.xlsx!Jadwal R08-R10`, `JADWAL EKSTRA… R22-R23`) | Per-slot assignment never specified — D-PG4 assumes one person covers all slots that weekday | New build: PS.A–PS.B (filter predicate, D-PS4) |
| F-PS2 no slot keys on assignment | `PENUGASAN_PLAN.md` §5 (shape, no time); `entities.php:126-199` (no hari/jam gates); `TRAINER_ATTENDANCE_PLAN.md` §5.2 (base triple, no time) | Whether scope should be hari-only vs hari+jam was never decided | New decision: D-PS2 nullable triple (exact-match, no intervals) |
| F-PS3 explicit bar | `PENUGASAN_PLAN.md` §2 Non-goals + `R-PG4` + §10 Deferred row ("Barred by R-PG4") | Lifting procedure (re-plan doc) implied by R-PG4 ("raise it") but never executed | This pair is the re-plan; R-PG4 stays for PG scope, R-PS4 governs PS scope |
| F-PS4 gating/honor by slot | `TRAINER_ATTENDANCE_PLAN.md` R-TA8 (date-range gate), R-TA11/D-TA14 (honor gate); `PENUGASAN_MILESTONES.md` PG.C (export/print green) | Slot-scoped attendance/honor rules never written | Deferred with owners (§10), not built here |

## 9. Access model (explicit, no broadening)

| Action | Superadmin | Admin Cabang | Trainer |
|---|---|---|---|
| Create/deactivate scoped `penugasanPengajar` (via host trainer update, triple validated) | ✅ all branches | ✅ own branch only (session authority) | ❌ never (R-TA6) |
| Read daily timetable (scoped derivation) | ✅ all + filter | ✅ own branch | 🟡 own rows only |
| Export CSV / print (scoped rows) | ✅ filtered view | ✅ filtered view | 🟡 own rows only |
| Server rule | bypass | `trainer.php:41-48` + `masterWrite` version/branch checks; nested `cabangId` match if sent (`entities.php:176-194`); new triple checked against school `jadwalList` vocabulary | `authorize.php:191-212` (write path 403) |

## 10. Deferred with owners

| Item | Owner / venue | Why deferred |
|---|---|---|
| Slot-scoped attendance gating (form offers only scoped slots) | Business sign-off (TA.C.2b analog) + `TrainerAttendanceForm.jsx` thread | Would change R-TA8; display-only in this chain (taste #13: document, don't patch blind) |
| Slot-scoped honor weighting (e.g. different tariff per slot) | Finance chain + explicit business rule | Would change D-TA14; needs tariff source, not inferred from labels |
| Interval-overlap matching (e.g. 14:00–16:00 covers 14:15–15:15) | Future plan amendment | YAGNI: exemplar times are exact; exact equality is falsifiable now |
| Cross-school slot picker (one assignment spanning schools) | Future plan amendment | Breaks host-payload model (D-PS1); needs new entity |

## 11. Write-back contract (taste #32/#43, on PS.B close)

Record `Verified:` lines per microtask in `PENUGASAN_SLOT_MILESTONES.md`; mark Gates PS.A–PS.B; append one closure row to `SCOPE_EXPANSION_MILESTONES.md` (no renumbering of the existing chain — this pair is the temporary gate doc per taste #40); note the `R-PG4` lift scope (PG stays barred, PS governs the triple) in `PENUGASAN_PLAN.md` §10 without rewriting PG history.

## 12. Cross-references

- `docs/UNIVERSAL.md`, `docs/IMPLEMENTATION_PLAN.md` (Part 2 contract, Part 5 design table + file map, Part 6 R1–R8, Part 7 validation rows), `docs/SCOPE_EXPANSION_PLAN.md`, `docs/SCOPE_EXPANSION_PRIVILEGES.md`, `docs/TRAINER_ATTENDANCE_PLAN.md`, `docs/TRAINER_ATTENDANCE_MILESTONES.md`, `docs/PENUGASAN_PLAN.md`, `docs/PENUGASAN_MILESTONES.md`, `docs/MULTI_ACCOUNT_SYNC.md`
- `docs/exemplar/JADWAL EKSTRAKULIKULER CODING___.xlsx`, `docs/exemplar/Jadwal Ngajar & Invoice.xlsx`
- `src/lib/penugasan.js`, `src/features/penugasan/PenugasanManager.jsx`, `src/features/penugasan/PenugasanTimetable.jsx`, `src/features/schools/SchoolList.jsx`, `src/lib/constants.js`, `src/lib/store.js`, `src/lib/format.js`, `src/lib/csv.js`, `src/components/Modal.jsx`, `src/components/AlertDialog.jsx`, `src/App.jsx`
- `server/validation/entities.php`, `server/api/trainer.php`, `server/api/_master.php`, `server/api/read.php`, `server/auth/authorize.php`
