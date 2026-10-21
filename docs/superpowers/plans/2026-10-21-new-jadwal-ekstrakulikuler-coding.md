# NEW Jadwal Ekstrakulikuler Coding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate `docs/exemplar/NEW_JADWAL EKSTRAKULIKULER CODING___.xlsx` (Sheet1, 2026/2027) into the dashboard's schedule source-of-truth (`sekolah.jadwalList` slots + `trainer.penugasanPengajar` rows) with zero app-code drift unless validation blocks.

**Architecture:** Data-only migration via the same verified API paths as EXEMPLAR_MIGRATION G4a (read-modify-update `POST /api/sekolah.php` as superadmin) + G4b (full-array replace `POST /api/trainer.php` as `admin.bandung`); NEW Excel is ground truth, diffed cell-by-cell against `JADWAL EKSTRAKULIKULER CODING___.xlsx`; any unmappable cell is recorded as a finding, never silently patched.

**Tech Stack:** Python `openpyxl` (read-only parse, temp scripts removed after run), PHP API (`sekolah.php`, `trainer.php`, `users.php`), MySQL `afterschola_t3_test`, Playwright (targeted temp spec), `npm run build`.

**Spec:** `docs/exemplar/NEW_JADWAL EKSTRAKULIKULER CODING___.xlsx` Sheet1 rows 01–38 (SENIN/KAMIS paired block, SELASA, RABU, JUMAT dedicated block). Fallback ground-truth doc: `docs/EXEMPLAR_MIGRATION.md` (G4a/G4b gates, D8 canonical map, F6/F10/F11 triage). Prior reads (FIRST FOREMOST per taste): `docs/UNIVERSAL.md` → `docs/SCOPE_EXPANSION_PLAN.md` + `docs/SCOPE_EXPANSION_PRIVILEGES.md` → `docs/IMPLEMENTATION_PLAN.md` → `docs/SPP_BILLING_PLAN.md`.

## Global Constraints

- UNIVERSAL.md checklist-first; one sentence outcome + one falsifiable check per task; smallest slice end-to-end; verify immediately after first edit.
- No credentials in git; passwords session-only, never recorded (EXEMPLAR_MIGRATION D7/G1 rule).
- Migrations idempotent, collision-safe, reference-preserving; completion only after transformed data validates (taste #35).
- Temp seed/parse scripts removed after run (G2/G3 precedent); `deploy/` only via `npm run build:deploy`, never hand-edited.
- Indonesian UI copy pinned; mirror existing idioms (`formatJadwalList`, `newPenugasanRow`, `validateRowDates`, `buildDailyTimetable`), do not invent (taste #11).
- If a fix requires changing plan architecture/interfaces, stop and re-plan instead of patching (taste drift prevention).
- Destructive steps last; backup first (`docs/exemplar/afterschola_t3_test.sql` restore point pattern).
- Verification language: `Verified: <command> -> <result>` / `Unverified:` / `Remaining:`.
- Source hygiene gate: no `console.log` in `src/`, `git status` clean of artifacts before done.

## Review Focus

- `10.35 - selesai` (JUMAT SDN Sabang) has no end time — reasonable expectation: stored as open-ended slot (`endTime` null → UI renders `+60min` fallback) or team pins a real end time; silent invention of `11.45` from the older `Jadwal Ngajar & Invoice.xlsx` would be wrong without confirmation.
- `SDIT Anni'mah` Rahmat Pratama row (empty SEKOLAH cell + `Kelas Baru`) — reasonable expectation: second class under the same school/same clock slot, not a new school; creating a phantom school would corrupt billing joins.
- `Luthfi Adli` (JUMAT SDN Sabang asisten) vs canonical `Luthfi Adliansyah Firdaus` — reasonable expectation: alias to the same trainer id, not a 19th roster record.
- `Afrizal` / `Ahmad Rafli` / `Ira Dian` / `Zahra Fadilla` / `Alifah Maharan` as asisten-only names — reasonable expectation: they resolve to existing G3 roster ids (F11 canonicalization), and rows needing a login-less asisten stay plain-Hadir with single-`asistenId` (F9 limitation), not blocked.
- `13.00 - 14. 00 WIB` stray space + dot separators (`14.15`) — reasonable expectation: normalized to `HH:MM` colons before `TIME_RE` validation; a parse that drops the row would silently lose Friday SD Istiqamah.

---

### Task 1: Freeze evidence + deterministic NEW-vs-OLD diff (read-only)

**Files:**
- Create: `C:\Users\barak\AppData\Local\Temp\opencode\parse-new-jadwal.tmp.py` (temp, removed after run)
- Modify: none in `src/` or `server/`
- Test: none (read-only artifact: printed table)

**Interfaces:**
- Consumes: nothing (first task)
- Produces: `NEW_DIFF_TABLE` — exact row list below, consumed by Tasks 2–4 as the only in-scope delta

- [x] **Step 1: Write the temp parse script**

```python
# parse both workbooks, paired-day aware (SENIN-left/KAMIS-right),
# strip, print (day, sekolah, trainer, asisten, jam, keterangan) per non-empty row
```

- [x] **Step 2: Run it and verify output matches this pinned table**

Run: `python C:\Users\barak\AppData\Local\Temp\opencode\parse-new-jadwal.tmp.py`
Expected: PASS when output equals (24 NEW rows; 22 OLD rows):

```text
KEPT 15x identical (SENIN 3x SD-Tridaya/SMPIT-Al-Irsyad/SMAIT-Al-Irsyad,
 KAMIS 6x SDN-Sabang-x2/Al-Irham-x2/Sains-SD/SMP, SELASA 3x, JUMAT-carry 3x Tauhid/Istiqamah-SMP/Salman same trainer+time)
CHANGED 4x asisten-only:
 SD-Tridaya Senin Vazira Putri -> Alifah Maharan (time unchanged 14.15-15.15)
 SDN-Sabang Kamis 09.00 Vazira/- -> Ira Dian + Zahra Fadilla
 SD-Sains RABU Widia - -> + Alifah Maharan
 SDM7 Iqbaludin RABU - -> + Ira Dian
RESOLVED 5x placeholder->concrete (previously F10):
 SDN-Sabang TEGANTUNG PJ -> JUMAT 10.35-selesai Ditha + Luthfi Adli
 SDIT Annimah (BUTUH 2) -> Iqbaludin + Ahmad Rafli + Kelas Lanjutan (+ Rahmat Pratama Kelas Baru row)
 SD-Istiqamah (BUTUH 1) -> Luthfi + Afrizal
 SMP-Istiqamah + SMP-Salman moved into clean JUMAT block (same trainer+time)
ZERO unparsed cells after repair (dots->colons, stray-space fix)
```

- [x] **Step 3: Record G0-style freeze evidence in the migration log (no src changes)**

Run: `git branch --show-current; git log --oneline -3; git status --porcelain=v1; node scripts/run-db-reset.cjs --help 2>&1 | Select-Object -First 3`
Expected: PASS when branch/log/status captured; tree clean or only this plan file untracked

- [x] **Step 4: Delete the temp script if it will not be reused by Task 2**

Run: `Remove-Item -LiteralPath C:\Users\barak\AppData\Local\Temp\opencode\parse-new-jadwal.tmp.py`
Expected: PASS when file gone (recreate per-task if needed; never commit temp scripts)

- [x] **Step 5: Commit**

```bash
git add docs/superpowers/plans/2026-10-21-new-jadwal-ekstrakulikuler-coding.md
git commit -m "docs: plan NEW jadwal ekstrakulikuler migration" -m "24 NEW rows vs 22 OLD; 4 asisten swaps + 5 placeholder resolutions"
```

### Task 2: Canonicalize names + times (decision table, no writes)

**Files:**
- Modify: this plan file §Decision table only (if a decision changes)
- Test: `src/lib/__tests__/penugasan-slot.test.js` (existing, read-only run to pin TIME_RE behavior)

**Interfaces:**
- Consumes: `NEW_DIFF_TABLE` from Task 1
- Produces: `CANON_MAP` — exact (excel string → db id / HH:MM) pairs consumed by Tasks 3–4

- [ ] **Step 1: Write the failing check — list every NEW string with no exact DB match**

```js
// temp node -e: load sekolah (20 D8 ids) + trainer (18 G3 ids) names,
// assert each NEW cell resolves; collect UNRESOLVED[]
// expect UNRESOLVED = [Luthfi Adli, Rahmat-Baru-row, 'selesai', '14. 00']
```

- [ ] **Step 2: Run to verify it fails (unresolved non-empty)**

Run: `npm test -- src/lib/__tests__/penugasan-slot.test.js 2>&1 | Select-Object -Last 5`
Expected: existing suite PASS (pins TIME_RE `^([01]\d|2[0-3]):[0-5]\d$` — `selesai`/dotted times rejected), while the temp unresolved-list is non-empty (proves mapping work remains)

- [ ] **Step 3: Implement `CANON_MAP` decisions (concrete picks, ask owner where flagged)**

| Excel string | Canonical pick | Owner |
|---|---|---|
| `SMAIT Al-Irsyad` | `skl-BDG-sma-alirsyad` (D8 alias, F6) | locked |
| `SD Al-Irham` | `skl-BDG-sd-alirhaam` (F6 highest-risk alias) | locked per D8 until F6 sign-off says otherwise |
| `SD & SMP Sains` shared | single `skl-BDG-sd-sains-albiruni`, 2 slots | locked D8 |
| `M Rafly F` | existing Rafly id (F11 typo canonicalization) | locked |
| `Luthfi Adli` | alias of `Luthfi Adliansyah Firdaus` id, empty WA where absent (F11) | needs owner confirm (Q3) |
| `Ahmad Rafli` | existing `Ahmad Rafli` id (ex `A Rafli R`) | locked |
| `Ira Dian / Zahra Fadilla / Alifah Maharan / Afrizal` | existing G3 roster ids, `wa:''` where absent (F8/F11) | locked |
| `Rahmat Pratama` Kelas Baru (empty school cell) | same `skl-BDG-sdit-annimah`, same `13.30-15.00` slot, split-level block per G4d rule (L13/L46 pattern) | needs owner confirm (Q2) |
| `14.15` dots / `14. 00` space | normalize to `14:15` / `14:00` before validation | locked |
| `10.35 - selesai` | slot `{dayOfWeek:Jumat, time:10:35, endTime:null}` (open-ended; UI `+60min` fallback, no invented end) — OR pinned end if owner answers Q1 | needs owner confirm (Q1) |

- [ ] **Step 4: Re-run the resolving check to verify zero UNRESOLVED**

Run: `node -e "resolve(CANON_MAP, NEW_DIFF_TABLE)"` (temp one-liner, removed after)
Expected: `UNRESOLVED 0`

- [ ] **Step 5: Commit decision table**

```bash
git add docs/superpowers/plans/2026-10-21-new-jadwal-ekstrakulikuler-coding.md
git commit -m "docs: lock NEW jadwal canonical map" -m "aliases per F6/F11; selesai open-ended pending Q1"
```

### Task 3: Update `sekolah.jadwalList` slots (G4a path, data-only)

**Files:**
- Modify: none in `src/`/`server/` (data via `POST /api/sekolah.php` read-modify-update as superadmin)
- Test: read-back slot assertion (temp script, removed after run)

**Interfaces:**
- Consumes: `CANON_MAP` from Task 2
- Produces: `SLOT_STATE` — read-back `jadwalList` per school consumed by Task 4 validation

- [ ] **Step 1: Write the failing read-back check (temp script)**

```js
// for each affected school id, GET /api/sekolah.php, assert jadwalList contains
// the NEW slot triple; expect FAIL on at least: SDN-Sabang Jumat 10:35,
// SDIT-Animah Jumat split, SD-Sains Rabu (asisten does not affect slot -> PASS, proves slot-vs-personnel split)
```

- [ ] **Step 2: Run to verify it fails where slots are actually new**

Run: `python C:\Users\barak\AppData\Local\Temp\opencode\assert-slots.tmp.py`
Expected: FAIL with missing-slot list (proves work remains; unchanged-time schools already PASS)

- [ ] **Step 3: Implement slot writes — smallest slice, one school at a time, full-payload update preserving `spp`/`metode`**

Affected slots (only rows where day/time changed or block moved; pure asisten swaps write ZERO slot changes):
- `skl-BDG-sdn-sabang`: ADD `{Jumat, 10:35, null}` (Q1-pending end); KEEP Kamis `09:00-10:30` + `12:15-13:35` unchanged
- `skl-BDG-sdit-annimah`: KEEP `{Jumat, 13:30, 15:00}` single slot (split is penugasan-level per G4d rule, not two slots); ADD nothing unless Q2 says distinct time
- `skl-BDG-sd-istiqamah`: KEEP `{Jumat, 13:00, 14:00}` (normalized from `14. 00`); no new slot
- All other schools: NO slot write (asisten-only or carry moves with identical triples)

Each write: GET current record → merge `jadwalList` → POST full payload → GET read-back confirms `spp`/`metode` byte-identical (G4a rule).

- [ ] **Step 4: Run read-back to verify `SLOT_STATE`**

Run: `python C:\Users\barak\AppData\Local\Temp\opencode\assert-slots.tmp.py`
Expected: PASS — slot count per school matches plan; `spp`/`metode` intact on samples (Istiqamah 250000/siswa-62500-bulan; Salman trainer-165000)

- [ ] **Step 5: Remove temp script, verify build**

Run: `Remove-Item C:\Users\barak\AppData\Local\Temp\opencode\assert-slots.tmp.py; npm run build 2>&1 | Select-Object -Last 3`
Expected: PASS — built with only pre-existing `store.js` dynamic-import warning

### Task 4: Update `penugasanPengajar` rows (G4b path, data-only)

**Files:**
- Modify: none in `src/`/`server/` (phase 1 `POST /api/trainer.php` update as `admin.bandung`; phase 2 `POST /api/sekolah.php` inverse merge as superadmin)
- Test: vocabulary + inverse + timetable read-back (temp script, removed after run)

**Interfaces:**
- Consumes: `CANON_MAP` (Task 2) + `SLOT_STATE` (Task 3)
- Produces: `ASSIGN_STATE` — 25 + Δ rows verified, timetable rows for picked dates

- [ ] **Step 1: Write the failing check — vocabulary must match `SLOT_STATE` triples**

```js
// build proposed rows with newPenugasanRow({sekolahId, trainerId, asistenId, hari, jamMulai, jamSelesai})
// run validateRowDates({..., sekolahJadwalList: SLOT_STATE[school]}) per row
// expect FAIL on: Rahmat-Baru scoped triple if slot missing, Luthfi-Adli alias if unresolved
```

- [ ] **Step 2: Run to verify it fails before writes**

Run: `npm test -- src/lib/__tests__/penugasan.test.js 2>&1 | Select-Object -Last 5`
Expected: existing suite PASS (validator itself green); temp proposed-rows check FAILs on the new rows (proves gate would reject bad triples)

- [ ] **Step 3: Implement assignment writes (full-array replace, idempotent re-run converges)**

Phase 1 — host updates as `admin.bandung` (superadmin create is 403 per G3; no role broadening):
- Widia host: SD-Tridaya Senin `14:15-15:15` asisten `Vazira→Alifah`; Sains Rabu `14:00-15:00` asisten `null→Alifah`; Istiqamah-SMP Jumat unchanged (carry)
- Ditha host: SDN-Sabang Jumat ADD `{Jumat, 10:35, null}` unscoped-time variant (hari=Jumat, times null if Q1 open-ended — PS.A.1 allows null=all-slots reading, but prefer exact triple once Q1 answered)
- Iqbaludin host: SDM7 `13:15-15:15` asisten `null→Ira`; SDIT Jumat `13:30-15:00` asisten `null→Ahmad Rafli`
- Luthfi host: SD-Istiqamah Jumat `13:00-14:00` asisten `null→Afrizal`; SDN-Sabang Jumat cover second host row if Q3 confirms alias (same slot, `coverOf` link if origin exists, else plain second row per F13 record-not-pave)
- Ira host (if Ira holds own Inti rows elsewhere, unchanged): Kamis SDN-Sabang `09:00-10:30` becomes Inti (was Vazira) + Zahra asisten — transfer host from Vazira to Ira via deactivate-old + create-new (no silent host rewrite; ledger-consistent)
- Rahmat host: SDIT Jumat `13:30-15:00` Kelas Baru row (Q2-pending; if confirmed: plain scoped row, no `coverOf`)
- Vazira host: DEACTIVATE (not delete) superseded rows (`aktif=false`, keep history) where NEW no longer lists her

Phase 2 — inverse merge into `sekolah.trainerIds` display links as superadmin (G4b precedent); verify forward+inverse+vocabulary mismatches = 0.

Double-booking guard: `findOverlappingPair` must return null before every save; server 422 is authoritative.

- [ ] **Step 4: Run verification — re-run converges + timetable spot-checks**

Run: `python C:\Users\barak\AppData\Local\Temp\opencode\assert-assign.tmp.py`
Expected: PASS — re-run writes 0 new (idempotent); `buildDailyTimetable({tanggal: next-Jumat})` contains SDN-Sabang/Ditha, SDIT/Iqbaludin+Rahmat, SD-Istiqamah/Luthfi rows with correct `Waktu`; Friday SDN-Sabang shared slot shows both hosts (alternation recorded, not resolved — G4b Friday precedent)

- [ ] **Step 5: Remove temp script, run narrowest automated checks + build**

Run: `Remove-Item C:\Users\barak\AppData\Local\Temp\opencode\assert-assign.tmp.py; npm test -- src/lib/__tests__/penugasan-timetable.test.js src/lib/__tests__/penugasan-slot.test.js 2>&1 | Select-Object -Last 5; npm run build 2>&1 | Select-Object -Last 3`
Expected: PASS — timetable/slot suites green; build with only pre-existing warning

### Task 5: Targeted E2E + close-out (temp spec, then supplement-on-failure)

**Files:**
- Create: `tests/new-jadwal-verify.tmp.spec.js` (temp, REMOVED after PASS per testing taste one-off rule; persists as `tests/r*-verify.spec.js` only if team wants a milestone regression)
- Modify: none in `src/`/`server/` unless a gate blocks

**Interfaces:**
- Consumes: `ASSIGN_STATE` from Task 4
- Produces: `Verified:` lines for the close-out report

- [ ] **Step 1: Write the failing targeted spec (disposable, self-booting, zero pageerrors)**

```js
// test('NEW jadwal — Jumat timetable shows Ditha/Iqbaludin/Luthfi + SDIT split', async ({ page }) => {
//   seed from clean storage via once-per-page guard; goto timetable with Jumat date;
//   await expect(page.getByRole('cell', { name: 'SDN 037 Sabang' })).toBeVisible();
//   await expect(page.getByRole('cell', { name: 'Ditha Triyani' })).toBeVisible();
//   // localStorage assert: jadwalList + penugasan rows match CANON_MAP
// });
```

- [ ] **Step 2: Run to verify it fails before Task 3–4 or passes after**

Run: `npx playwright test tests/new-jadwal-verify.tmp.spec.js 2>&1 | Select-Object -Last 8`
Expected before migration: FAIL (rows absent); after Tasks 3–4: PASS with zero `pageerror` (allowlisted favicon 404 only)

- [ ] **Step 3: If any step above FAILED to adapt (parse/validation/403): supplement per EXEMPLAR_MIGRATION fallback**

Treat the NEW Excel cell as ground truth; do NOT reshape the sheet to fit the app. Instead: record `F-NEW#` finding in this plan file (inconsistency class per F10/F11/F13 precedent), triage as already-planned / partially-specified / unplanned, and open the minimal microtask (nullable `endTime`, second-asisten union, or cover-assignment path) — app change only via that microtask, never inline.

- [ ] **Step 4: Remove temp spec + temp data, final gates**

Run: `Remove-Item tests/new-jadwal-verify.tmp.spec.js; npm run build 2>&1 | Select-Object -Last 3; git status --porcelain=v1`
Expected: PASS — build green; status shows only intended plan/doc files; no `console.log` in `src/` (`grep -r console.log src/ | Select-Object -First 5` empty)

- [ ] **Step 5: Report in evidence format**

```text
Verified: <command> -> <result> (per task)
Unverified: full E2E suite (deferred per EXEMPLAR_MIGRATION Remaining) / field-owner Q1–Q3 answers
Remaining: Q1 10.35 end / Q2 Rahmat-Baru scope / Q3 Luthfi-Adli alias sign-off
```

## Self-Review

- Spec coverage: every NEW row (24) mapped — 15 kept, 4 asisten swaps, 5 placeholder resolutions — each owned by Task 3 (slots) or Task 4 (personnel); time-normalization owned by Task 2; failure path owned by Task 5-Step 3.
- Step scan: each step writes exactly one reasonable thing (one script, one run, one write batch, one removal, one commit).
- Type consistency: `jadwalList {dayOfWeek,time,endTime}`, `newPenugasanRow` keys, `validateRowDates` triple vocabulary, `buildDailyTimetable` read-join — same names/signatures in every task.
- Review Focus: all five input classes above carry a Task 2 decision + Task 4/5 test pin.
- Proportion: plan is shorter than the migration it describes; bodies appear only where the signature + test leave a choice (Q1–Q3 picks).
