# Exemplar Migration — Ground-Truth Run Log (G0+G1)

**Source:** `docs/exemplar/` as ground truth. **Flow:** Superadmin → 1 Cabang + Admin Cabang → Sekolah+Siswa → Trainer → Scheduling → Trainer Attendance → SPP/Honor hit-or-miss.
**Authority order:** `UNIVERSAL.md` (first foremost) → `SCOPE_EXPANSION_PLAN.md` + `SCOPE_EXPANSION_PRIVILEGES.md` → `IMPLEMENTATION_PLAN.md` → `SPP_BILLING_PLAN.md`. No credentials in git (taste #41).

## Decisions (D#) — locked from user 2026-09-25

- D1: Single cabang, all exemplar schools. Concrete pick: `Cabang Bandung / BDG / cbg-BDG-bandung`.
- D2 (revised 2026-09-25 clarification): Honor is per-session role, not per-person fixed. Inti Senior 100k (`Iqbaludin, Paris Jundi, M Davin Putra Arisandi, Widia Astuti, Ditha Triyani`), Inti Newbie 75k (rest, e.g. `Luthfi Adliansyah Firdaus, M Rafly Fatchurrohman`), Asisten 50k — whoever fills the asisten slot that session. The same person can be Inti in one session and Asisten in another.
- D3 (revised 2026-09-25 clarification): exemplar `(I)/(A)` = session role for that cell, NOT a direct write to `trainer.tipePengajar`. Short→full name mapping still accepted.
- D7 (2026-09-25): `admin.bandung` keeps the system-generated initial password + `mustChangePassword=1` (USER_PROVISIONING D4). Password shown once in session only, never in git. Automation uses the superadmin session; the admin changes password on first login.
- D4: `LIBUR/BERES/empty = 0` sessions; `EXPO = Hadir + keterangan EXPO`, counts full honor.
- D5: SPP hit/miss uses per-meeting formula (`billingForSekolah`: `tarifPerPertemuan × pertemuan_aktual`, `basis siswa` × active non-Trial students). A miss counts as a recorded problem.
- D6 (deviation, user-directed): direct shared-DB seed (`afterschola_t3_test`) instead of testing-taste disposable browser-only simulation. Mitigation: idempotent upserts by natural key, backup first, destructive steps last. Server RBAC stays authoritative (taste #61).

## Findings (F#) — inconsistencies vs codebase (recorded, not patched here)

- F1 (corrected 2026-09-25 — my R1–R20 window missed R21, not an exemplar gap): full sheet `A1:C21` verified; `R21 = SD Al-Irhaam Global Islamic School — Rp250.000 / Siswa / Bulan (4 kali)` → `tarifPerPertemuan 62500, basis siswa, trigger per_bulan`.
- F2: `SMPN 18: Rp250k/Bulan` flat (not per-siswa) has no clean `basis/tarifPerPertemuan` mapping.
- F3 (revised 2026-09-25 — not a data error under D2-revised): `Vazira` dual `(I)/(A)` is the flexible-role rule in action. Tension vs codebase (unplanned, flagged for G3/G5, not patched here): R-TA14 (`trainerAttendance.js`: label follows current `tipePengajar`) + `finance.js pengajarHonorStats` (honor = per-person `trainer.honor`) cannot represent per-session role honor.
- F4: `MA Al-Mashduqi` has tariff but no attendance; Invoice sheet carries send/follow-up dates only, no nominals for SPP comparison.
- F5: `SD Tridaya 700k/semester` vs `SMP Tridaya 850k/semester` are distinct entities — must not be merged.
- F6 (re-sweep 2026-09-25 — school name variants across files, migration dedup needed): Biaya `SD Al-Irhaam Global Islamic School` vs Siswa sheet `SD Al-Irhaam` vs Trainer-Sep `SD Al-Irham` vs Jadwal `SD Al-Irhaam`; `SD Sains Al-Biruni` vs Invoice `SD & SMP Sains Al-Biruni` vs Jadwal `SMP Sains Al-BIruni`; `SD Daarut Tauhid` vs Siswa `SD Daarut Tauhiid`; `SMPIT Annimah` vs `SMPIT Anni'mah`; `SDIT Annimah` vs `SDIT Anni'mah`; `SMPN 18 Bandung` vs `SMPN 18 Kota Bandung`; `SD Tridaya` vs `SD Tridaya Tunas Bangsa`; `SMA Al-Irsyad` vs Jadwal/Invoice `SMAIT Al-Irsyad`. Triage: already-planned handling — IMPLEMENTATION_PLAN D2 (names display-only, joins by ID), so G2 picks one canonical name per school. No app fix.
- F7 (re-sweep 2026-09-25 — per-meeting billing is invoice-path only): `billingForSekolah` is standalone and NOT called from `financialData()` (`src/lib/finance.js:200-206` + `finance-regression.test.js` guard); `FinanceReport.jsx:99`, `OverviewCards.jsx:42`, `PaymentTable.jsx:52` all render the flat `targetSpp`. Triage: already-planned — SPP_BILLING_PLAN F-SB1/D-SB7/D-SB10 (canonical path = `server/lib/invoiceGenerator.php`). G5 hit/miss compares invoice totals, not FinanceReport Potensi; a FinanceReport miss is expected and recorded, not patched here.
- F8 (re-sweep 2026-09-25 — no student WA in exemplar): Siswa sheets carry only `NO/NAMA/KELAS` + booleans (verified `SD Istiqamah/SDN 037/SMPN 18` max_col headers). Triage: already-tolerated — M1 validation allows empty WA; tunggakan WA buttons will render without numbers for migrated students. Migration limitation, not app defect.
- F9 (re-sweep 2026-09-25 — up to 2 asisten per session): max 3 names per trainer cell verified (e.g. `Iqbaludin (I) + Asyifa (A) + Afrizal (A)`); `AttendanceForm.jsx:18,110-111` holds a single `asistenId`, and `newAbsensiPengajar` (`constants.js:348-366`) has no asisten field at all. Triage: partially specified — SCOPE_EXPANSION_PLAN A2 specifies a singular assistant dropdown. Flagged for G3/G5 microtask, not patched here.
- F10 (re-sweep 2026-09-25 — unmappable schedule markers): `Fleksibel`, `TEGANTUNG PJ`, `(BUTUH 1/2)` in Jadwal have no `jadwalList` slot; `penugasan.js:52-98 validateRowDates` requires hari/jam from the school's vocabulary. Triage: `Fleksibel` → null/unscoped assignment (PS.A.1 allows null = all slots); `TEGANTUNG PJ` → deferred, no slot created in G2. Recorded, not patched.
- F11 (re-sweep 2026-09-25 — partial WA + name noise in trainer cells): JADWAL covers 7 trainer + 7 asisten WA; absensi-only names `Akhriman, Rifadz, Afrizal` have no WA; typos `Iqbludin`, `M Rafliy F`/`M rafly F`, `i ra`, and variants `M Rafly` vs `M Rafly F`, `Rahmat` vs `Rahmat Pratama`, `A Rafli R` vs `Ahmad Rafli` verified across all 9 monthly sheets. Triage: migration hygiene (taste #66 reactive cleanup, not architecture) — canonicalize typos, empty WA where absent. No app fix.
- F12 (re-sweep 2026-09-25 — invoice penerima/follow-up has no home): exemplar Invoice tracks `penerima + WA + tanggal kirim + follow-up + keterangan`; codebase invoices carry `nomor/items/grandTotal/periode/status` (`invoices.js:161-166,321-322`), and only `SlipHonor.jsx:57` renders a `Penerima` label. Triage: unplanned — flagged for a future microtask if beneficial, not patched here.

## Gate G0 — Freeze evidence (DONE)

```text
MICROTASK: Freeze G0 evidence
  EDIT:    this document's evidence table only
  RULES:   UNIVERSAL.md checklist-first; no credentials in git
  DEPENDS: required first-reads complete (UNIVERSAL, SCOPE_EXPANSION_PLAN, SCOPE_EXPANSION_PRIVILEGES, IMPLEMENTATION_PLAN, SPP_BILLING_PLAN)
  OUTCOME: commit, tree state, runtimes, DB prereqs, scripts, and baseline checks are recorded
  VERIFY:  git status/log, node/php/mysql probes, db:reset, build
  DONE-IF: evidence recorded; no source files changed
```

Evidence:

- `Verified: git branch --show-current -> test-stage`
- `Verified: git log --oneline -5 -> 63c8b99 (HEAD) Add automated tests for assignment creation, deletion, and schedule updates`
- `Verified: git status --porcelain=v1 -> clean (empty); git diff --stat -> empty`
- `Verified: node --version -> v24.16.0; npm --version -> 11.13.0`
- `Verified: php --version -> PHP 8.2.12 (D:\Games and Apps\xampp\php\php.exe)`
- `Verified: mysql --version -> 10.4.32-MariaDB`
- `Verified: server/config.php defaults -> mysql:host=127.0.0.1;dbname=afterschola_t3_test (test DB, refuses non-test per LOCAL_SETUP D2); server/config.example.php present, no credentials in file`
- `Verified: node scripts/run-db-reset.cjs -> db:reset OK in 1.42s; users 4 (*.test.local), cabang 1 (cbg-test-pusat/PST), all other tables 0`
- `Verified: npm run build -> built in 5.03s, 93 modules, only pre-existing store.js dynamic-import warning`
- `Verified: git check-ignore -v dist/index.html -> .gitignore:2:dist (build artifacts ignored)`

## Gate G1 — Cabang BDG + Admin Cabang (DONE, data-only via API)

```text
MICROTASK: Create single exemplar cabang + admin
  EDIT:    none in src/ (data via POST /api/cabang.php + POST /api/users.php as superadmin, per USER_PROVISIONING D2)
  RULES:   SCOPE_EXPANSION_PRIVILEGES manage_branch + users.php create; smallest slice; verify immediately
  DEPENDS: G0
  OUTCOME: Cabang Bandung (BDG) exists with a login-capable Admin Cabang
  VERIFY:  DB row kode=BDG exists; login as new admin returns 200 with mustChangePassword=true; build still green; git tree still clean
  DONE-IF: verify passes; initial password shown once to user, never written to git
```

Evidence:

- `Verified: POST /api/cabang.php {action:create,id:cbg-BDG-bandung,kode:BDG,nama:Cabang Bandung} -> 201 ok`
- `Verified: POST /api/users.php {action:create,role:admin_cabang,username:admin.bandung,displayName:Admin Bandung,cabangId:cbg-BDG-bandung} -> 201 ok, mustChangePassword=true`
- `Verified: mysql SELECT cabang -> (cbg-BDG-bandung/BDG/Cabang Bandung) + (cbg-test-pusat/PST/Cabang Pusat); SELECT users admin.bandung -> role admin_cabang, cabang cbg-BDG-bandung, must_change_password=1`
- `Verified: POST /api/auth/login.php admin.bandung -> 200, mustChangePassword=true (USER_PROVISIONING D4: must change on first login via MustChangePasswordPage)`
- `Verified: npm run build -> built in 5.03s (same pre-existing warning only)`
- `Verified: git status --porcelain=v1 -> clean; git diff --stat -> empty`
- Initial password: delivered once in session output only, NOT recorded here per no-credentials-in-git rule. If lost, superadmin runs `reset_password` via `users.php`.

## Gate G2 — Canonical school map (D8, decided before seeding)

- D8 (2026-09-25): 20 Biaya rows = 20 school records in BDG. Canonical name = Biaya name. Semester → `trigger per_siklus_minggu jumlahMinggu=12`; monthly → `per_bulan`; per-meeting/trainer → `per_pertemuan`. `spp` legacy = monthly face value where per-Bulan, semester/6 rounded where per-Semester, tarif×4 where per-Pertemuan, 0 where basis trainer; SMPN 18 keeps `metode=null` (F2). Sains SD+SMP stay one record (two `jadwalList` slots); aliases map all variants to it. `SD & SMP Sains Al-Biruni` (invoice) and `SMAIT Al-Irsyad` are aliases, not separate schools.

| id | canonical | tarif/meeting | basis/trigger | spp legacy | aliases |
|---|---|---|---|---|---|
| skl-BDG-smp-tridaya | SMP Tridaya | 850000/12=70833.33 | siswa/siklus12 | 141667 | SMP Tridaya Tunas Bangsa |
| skl-BDG-smpit-alirsyad | SMPIT Al-Irsyad | 62500 | siswa/bulan | 250000 | — |
| skl-BDG-sd-sains-albiruni | SD Sains Al-Biruni | 62500 | siswa/siklus12 | 125000 | SD & SMP Sains Al-Biruni; SMP Sains Al-Biruni/BIruni (same record, 2 slots) |
| skl-BDG-sd-istiqamah | SD Istiqamah | 62500 | siswa/bulan | 250000 | — (G2a pilot) |
| skl-BDG-sd-daarut-tauhid | SD Daarut Tauhid | 62500 | siswa/bulan, ortu | 250000 | SD Daarut Tauhiid |
| skl-BDG-sd-tridaya | SD Tridaya | 700000/12=58333.33 | siswa/siklus12 | 116667 | SD Tridaya Tunas Bangsa |
| skl-BDG-smp-istiqamah | SMP Istiqamah | 50000 | siswa/pertemuan | 200000 | — |
| skl-BDG-smp-bintang-madani | SMP Bintang Madani | 50000 | siswa/bulan | 200000 | — |
| skl-BDG-sdm3 | SDM 3 Bandung | 50000 | siswa/bulan | 200000 | — |
| skl-BDG-sd-alazhar-cairo | SD Al-Azhar Cairo Bandung | 50000 | siswa/bulan | 200000 | SD Al-Azhar Cairo |
| skl-BDG-smpit-annimah | SMPIT Ann'imah | 37500 | siswa/bulan | 150000 | SMPIT Annimah |
| skl-BDG-sdm7 | SDM 7 Bandung | 37500 | siswa/pertemuan | 150000 | — |
| skl-BDG-sdit-annimah | SDIT Anni'mah | 37500 | siswa/bulan | 150000 | SDIT Annimah |
| skl-BDG-sdn-sabang | SDN 037 Sabang | 13750 | siswa/bulan | 55000 | — |
| skl-BDG-smpn18 | SMPN 18 Bandung | — (F2) | metode=null | 250000 | SMPN 18 Kota Bandung |
| skl-BDG-smp-salman | SMP Salman Al-Farisi | 165000 | trainer/pertemuan | 0 | — |
| skl-BDG-sma-alirsyad | SMA Al-Irsyad | 130000 | trainer/pertemuan | 0 | SMAIT Al-Irsyad |
| skl-BDG-sd-darul-hikam2 | SD Darul Hikam 2 | 125000 | trainer/pertemuan | 0 | — |
| skl-BDG-ma-almashduqi | MA Al-Mashduqi Garut | 200000 | trainer/pertemuan | 0 | — (tariff only, no attendance) |
| skl-BDG-sd-alirhaam | SD Al-Irhaam Global Islamic School | 62500 | siswa/bulan | 250000 | SD Al-Irhaam; SD Al-Irham |

## Gate G2a — Pilot school (DONE)

```text
MICROTASK: Seed one canonical school end-to-end
  EDIT:    none in src/ (data via POST /api/sekolah.php as superadmin)
  RULES:   smallest slice; verify immediately; idempotent deterministic id
  DEPENDS: D8 map
  OUTCOME: skl-BDG-sd-istiqamah exists in BDG with canonical billing config
  VERIFY:  read-back shows id/cabangId/spp/metode; re-create returns 409 (no dupe)
  DONE-IF: verify passes; no src changes
```

- `Verified: POST /api/sekolah.php create skl-BDG-sd-istiqamah -> 201`
- `Verified: read sekolah filtered BDG -> 1 row, spp 250000, metode {siswa,62500,per_bulan,sekolah}`
- `Verified: re-create same id -> 409 ID sudah tersimpan`

## Gate G2b — Bulk 19 remaining schools (DONE)

```text
MICROTASK: Seed remaining canonical schools (create-or-update)
  EDIT:    none in src/ (same verified endpoint/shape as G2a)
  RULES:   idempotent (409->update converge); reference-preserving; temp seed script removed after run
  DEPENDS: G2a
  OUTCOME: 20/20 canonical schools exist in BDG, zero duplicates
  VERIFY:  COUNT cabang_id=BDG is 20; id list matches D8; re-run still 20; build green
  DONE-IF: verify passes; no src changes
```

- `Verified: bulk create 19 -> all 201`
- `Verified: mysql COUNT bdg_sekolah -> 20; id list matches D8 table`
- `Verified: re-run script -> 19x 409->update 200; COUNT still 20`
- `Verified: npm run build -> 5.67s, same pre-existing warning only`
- `Verified: git status -> only ?? docs/EXEMPLAR_MIGRATION.md`

## Gate G2-Siswa — 397 students (DONE)

```text
MICROTASK: Seed all exemplar students (pilot 25 + bulk 372)
  EDIT:    none in src/ (data via POST /api/siswa.php as superadmin; NO cabangId key — server derives from sekolahId, rejects if sent)
  RULES:   smallest slice (pilot SD Istiqamah first); idempotent create-or-skip by deterministic id sw-BDG-{slug}-{nn}; temp script removed after run
  DEPENDS: G2b (schools exist)
  OUTCOME: 397/397 exemplar students exist across 18 BDG schools (MA + SDM3 have no sheets, stay 0)
  VERIFY:  pilot 25/25 then re-run 0 new; bulk 372/372 zero failures; re-run 0 new; JOIN COUNT BDG = 397; per-school counts match exemplar; build green
  DONE-IF: verify passes; no src changes
```

- `Verified: pilot SD Istiqamah -> created=25; re-run -> 0 new (25 pre-existing)`
- `Verified: bulk 17 sheets -> created=372, failures=0 (10+37+5+12+21+49+11+21+21+19+12+22+77+1+22+16+16)`
- `Verified: re-run bulk -> 0 new, 372 pre-existing; JOIN COUNT BDG = 397`
- `Verified: per-school distribution == exemplar sheet counts; MA Al-Mashduqi + SDM 3 = 0 (no sheets, F4)`
- Correction: pilot is 25 students (full-sheet parse), not 18 as first estimated from the R1–R20 window (taste #14 — same truncation class as F1).
- Contract note: `siswa.php:27-29` rejects client `cabangId` (422); `siswa.php` blind update without `version` also 409s — so idempotency is create-or-skip, not create-or-update (unlike `sekolah.php`, which converges via update). Hypothesis recorded before the fix; one hypothesis, one edit.
- Payload: `wa:''` (F8 — exemplar has no student WA), `status Aktif`, `sppLunas {}`, `kelas` verbatim (incl. `9,8`-style strings).
- `Verified: npm run build -> 5.40s, same pre-existing warning only`

## Gate G3 — Trainer roster (DONE)

```text
MICROTASK: Seed 18 trainer records as Admin Cabang (pilot 1 + bulk 17)
  EDIT:    none in src/ (data via POST /api/trainer.php as admin.bandung — superadmin create is 403 per trainer.php:30-32 / USER_PROVISIONING D1)
  RULES:   privilege boundaries explicit (taste #33 — no role broadening); smallest slice; idempotent create-or-skip; temp script removed
  DEPENDS: G1 (admin exists; first-login password rotated, mustChangePassword=false)
  OUTCOME: 18/18 roster records in BDG with honor tiers (5×100k Senior, 4×75k Newbie Inti incl. Vazira+Rahmat, 9×50k Asisten)
  VERIFY:  pilot 1/1 then re-run 0 new; bulk 17/17; re-run 0 new; COUNT BDG=18; tier mix matches; superadmin-create 403; build green
  DONE-IF: verify passes; no src changes; no passwords in git
```

- `Verified: pilot trn-BDG-paris-jundi -> 201; re-run -> 0 new`
- `Verified: bulk -> 17 created + 1 pre-existing; re-run -> 0 new, 18 pre-existing; mysql COUNT BDG = 18`
- `Verified: read as admin -> 18 rows; tiers {(100000,instruktur):5,(75000,instruktur):4,(50000,asisten):9}`
- `Verified: superadmin POST trainer create -> 403 Superadmin tidak dapat membuat trainer baru (D1 holds server-side)`
- Roster: 8 Inti-capable (honor = Inti rate; Vazira+Rahmat instruktur per observed (I)) + 7 WA-listed asisten + 3 absensi-only (Akhriman/Rifadz/Afrizal, wa='') ; `sekolahIds:[]` (G4 assigns); canonicalized `Ira O851→0851`, `A Rafli R→Ahmad Rafli`, `Raihan→Raihan Fajar`, `M Rafly/M Davin/Luthfi/Vazira` full names (F11).
- `admin.bandung` password rotated via change-password API (initial shown once in G1 session only); new password in session only, never in git. Automation uses superadmin session unless the faithful admin path is required (as here, per D1).
- `Verified: npm run build -> 5.97s, same pre-existing warning only`
- Open for G4: trainer login accounts. `users.php` create is record+account atomic (D9) with no add-login-to-existing-record path — so G4 trainer-login simulation needs a decision (create accounts for the Sept-active subset then, vs simulate writes via admin). Recorded, not decided here.

## Gate G4a — jadwalList slots (DONE)

```text
MICROTASK: Write Jadwal-sheet slots into 17 schools
  EDIT:    none in src/ (data via read-modify-update POST /api/sekolah.php as superadmin)
  RULES:   smallest slice (slots only, no penugasan/attendance yet); full-payload update must preserve spp/metode (verified by read-back)
  DEPENDS: G2b
  OUTCOME: 17 schools carry 23 slots matching the Jadwal sheet; 3 slot-less schools stay []
  VERIFY:  17/17 update 200; read-back 23 slots; empty == {MA, Al-Azhar, SDM3}; spp/metode intact on samples; build green
  DONE-IF: verify passes; no src changes
```

- `Verified: update 17/17 -> 200`
- `Verified: read-back total slots = 23; empty == MA Al-Mashduqi, SD Al-Azhar Cairo Bandung, SDM 3 Bandung (no Jadwal rows — recorded, not a gap)`
- `Verified: spp/metode preserved (Istiqamah 250000/siswa-62500-bulan; Salman trainer-165000; SMP Tridaya 141667/float-tarif intact)`
- Normalizations: dots→colons for TIME_RE; `Jum'at`→Jumat; SDM7 14:15 slot shared by 2 trainers (split in G4b penugasan); Sains SD+SMP = 3 slots on one record (D8).
- `Verified: npm run build -> 5.24s, same pre-existing warning only`

## Gate G4b — Penugasan (DONE)

```text
MICROTASK: Write 25 slot-scoped assignment rows + inverse links
  EDIT:    none in src/ (phase 1: trainer.php update as admin.bandung; phase 2: sekolah.php inverse merge as superadmin)
  RULES:   smallest slice (assignments only); slot triple must match G4a vocabulary (validateRowDates/entities.php:222-229); full-replace converges on re-run
  DEPENDS: G3 (trainers), G4a (slots)
  OUTCOME: 8 trainers carry 25 active rows from 2026-07-01; 17 schools list their trainers
  VERIFY:  8/8 update 200; re-run same 25 (no auto-added extras); vocabulary+inverse mismatches 0; build green
  DONE-IF: verify passes; no src changes
```

- `Verified: phase 1 8/8 -> 200, rows written=25; re-run rows=25 (no missingAssignmentLinks extras)`
- `Verified: phase 2 inverse merged 17 schools; re-run wrote 0 (already converged)`
- `Verified: vocabulary+forward+inverse check -> mismatches 0`
- Coverage: Widia 4, Paris 2, Iqbaludin 4 (SDIT row carries Zahra), Ditha 3, Davin 2, Luthfi 5 (Sains ×2 slots on one record), Rafly 3, Vazira 2. Rahmat + 9 pure asisten intentionally 0 rows (no Jadwal rows; Rahmat's Sept cover session is a G4c question, not patched here).
- Friday SDN Sabang slot shared by Ditha + Luthfi (exemplar alternates/EXPO) — both rows active; timetable shows both. Recorded, not resolved.
- `Verified: npm run build -> 5.04s, same pre-existing warning only`

## Gate G4c-1 — Trainer login accounts (DONE)

```text
MICROTASK: Give the 9 Sept-active trainers login accounts via users.php
  EDIT:    none in src/ (delete G3 record + users.php create + penugasan restore, all as admin.bandung)
  RULES:   D3 one-flow (record+account atomic); D9; smallest slice; passwords session-only, never git
  DEPENDS: G3, G4b
  OUTCOME: 9 trainers have logins (mustChangePassword=1); roster still 18, rows still 25, zero stale refs
  VERIFY:  9/9 del 200 + 9/9 mk 201 + rows restored; COUNT trainers 18; rows 25; stale-id/regex sweep 0; trainer login 200; build green
  DONE-IF: verify passes; no src changes
```

- Constraint (surfaced per taste #60, user chose recreate): `users.php` create always inserts a NEW trainer row — no link-login-to-existing path. Recreate chosen over direct-SQL insert and over admin-only writes.
- `Verified: del 9/9 -> 200; mk 9/9 -> 201 (server-minted trn-BDG-<time>-<rand> ids); rows 8×restore + rahmat 0`
- `Verified: COUNT BDG trainers = 18; total penugasan rows = 25 (no auto-row leftovers — full replace overwrote ensureAssignment unscoped rows)`
- `Verified: stale G3-id + payload-regex sweep -> 0 refs; 9 users rows role=trainer must_change_password=1`
- `Verified: login paris.jundi -> 200, role trainer, cabang BDG, trainerId linked, mustChange true`
- `Verified: npm run build -> 5.49s, same pre-existing warning only`
- Initial passwords: session transcript only (used for G4c-2 first-login rotation, never in git).

## Gate G4c-2 — Sept trainer attendance (DONE)

```text
MICROTASK: 9 trainers rotate passwords, write own Sept cells, probe cross-write
  EDIT:    none in src/ (POST /api/absensiPengajar.php write as each trainer; correct as superadmin for the periode fix)
  RULES:   smallest slice per trainer; one hypothesis per repair; ledger append-only (no rewrites)
  DEPENDS: G4c-1 (accounts), G4b (assignments gate writes)
  OUTCOME: 69 latest Sept Hadir rows (6 EXPO); 3 cover-cells 403 as F13; cross-write 403
  VERIFY:  69×201 + correction 69/69; re-runs all-409; latest-wins count 69 with exact per-trainer split; build green
  DONE-IF: verify passes; no src changes; passwords session-only
```

- `Verified: rotation 9/9 (mustChange now false); cross-write paris→widia -> 403`
- `Verified: own-writes 63×201 first pass + paris 6/6 on clean session = 69`
- Lesson (taste #12-class): the 403 probe consumed/rotated the probe session's CSRF token — all 6 later writes on that session failed `Token keamanan tidak valid`. Hypothesis confirmed by 6/6 on fresh session. Rule: destructive probes run LAST on a session (probe evidence kept: cross-write 403 valid).
- Bug caught by verification (hypothesis→fix, one each): hand-assembled payloads omitted `periode` (Part 2 R3 factories-only violation) → 69 rows invisible to `pengajarHonorStats`/`buildTrainerMatrix` (both filter `periode`). Fixed via 69 ledger corrections (`action:correct` as superadmin, deterministic `-c1` ids) adding `periode:2026-09` — no rewrites, per append-only rule.
- `Verified: corrections 69/69; re-run 0 new/69 dup; latest-wins Sept Hadir = 69 (Luthfi 15, Widia 12, Iqbaludin 10, Rafly 10, Ditha 8, Paris 6 incl. 3 double-slot days, Vazira 6, Davin 2), EXPO 6`
- `Verified: 3 expected-403s = F13 cover-without-assignment (Luthfi SMP-Tridaya 09-01, Rahmat SMP-Tridaya 09-08, Rahmat SD-Istiqamah-(A) 09-11). Transcription deliberately did NOT add covering assignments (taste #27: expose, don't pave).`
- Skipped (no accounts, F9): 13 asisten-only cells (Asyifa 3, Afrizal 2, Alifah 3, Ira 3, Zahra 1, Raihan 1). (A)-role rows by account-holders (Iqbaludin SDM7 09-09, Vazira cells, Luthfi SD-Istiqamah 09-04 dual-role deduped to one Hadir) written as plain Hadir — role unrepresentable in entity, G5 joins source cells.
- F13 (new): cover/substitute sessions (Rahmat→M Davin, Luthfi→SMP Tridaya) have no assignment path — static assignments vs flexible covering reality. Unplanned; flagged for microtask, not patched.
- `Verified: npm run build -> 5.12s, same pre-existing warning only`

## Gate G4d-pilot — 2 Istiqamah absensi (DONE)

```text
MICROTASK: Write 2 Sept class sessions as the assigned Inti
  EDIT:    none in src/ (POST /api/absensi.php write as luthfi.adliansyah; assignment gate not applied to legacy absensi — authorize.php:128-130)
  RULES:   per-trainer-session shape (user-confirmed); True->Hadir / False->Tidak Hadir (AttendanceForm.jsx:107 idiom)
  DEPENDS: G2-Siswa (roster), G4b (Luthfi assigned)
  OUTCOME: 2 records with full 25-rosters; read-back Hadir 21 + 22 matches source recount
  VERIFY:  2×201; name resolution 25/25 zero missing; read-back counts match; build green (below)
  DONE-IF: verify passes; no src changes
```

- `Verified: POST 2026-09-04 + 2026-09-11 _skl-BDG-sd-istiqamah_luthfi -> 201×2`
- `Verified: roster resolution 25/25, missing []; Hadir 21/25 + 22/25 source-side and read-back identical`
- Limitation recorded: 09-11 `asistenId` null — trainer-scoped reads can't resolve other trainers' ids in-session (Rahmat unresolvable as luthfi). Bulk script resolves all ids via superadmin upfront. No functional impact (billing/stats never read asistenId).
- Shape rules locked for bulk: (1) one record per (school,date,Inti), co-Inti gets `[]`; (2) split-level blocks follow slots (Irhaam a/b, Sains, SDM7); (3) EXPO-only trainers write no absensi; (4) Paris a/b distinct ids via `_2` + sesiKe 2 (insertLedger 409s on dup id — no silent overwrite); (5) Rahmat-A 09-11 skipped (no assignment path + unresolvable in-session; F13).

## Gate G4d — Sept siswa attendance (DONE)

```text
MICROTASK: Transcribe all Sept siswa-sheet columns as per-trainer-session records
  EDIT:    none in src/ (POST /api/absensi.php write as each session's Inti; legacy absensi has no assignment gate — authorize.php:128-130)
  RULES:   user-locked shape (one record per trainer-session, own account); True->Hadir/False->Tidak Hadir; full roster on first-listed Inti, [] on co-Inti/split-empty; slot blocks follow sheet blocks
  DEPENDS: G2-Siswa, G4c-2 (writers), F13/F9/F14 as transcribed
  OUTCOME: 70 Sept records (2 pilot + 68 bulk) with exemplar rosters; JUMLAH-exact on every checkable school-date
  VERIFY:  68×201 zero bad/zero unresolved; re-run all-409; COUNT Sept=70; JUMLAH reconciliation exact (samples below); build green
  DONE-IF: verify passes; no src changes
```

- `Verified: bulk 68×201, unresolved names 0; re-run 0 new/68 dup; COUNT Sept absensi = 70`
- `Verified JUMLAH-exact: SDM7 27/28/28/26 (Beg+Int sums); Sains Wed 6/6/12/11; Darul Hikam 14/15/13/8; Tauhid 15/11/15; Salman 9/10/10; SMP-Tridaya 9/10/8 (incl. both cover-written dates); SMP-Istiqamah 7/5; BM 11/11/12/10; Alirsyad 5; Irhaam unions 20/21/18 (L13 5/6/4 + L46 15/15/14 — slot-split validated)`
- Allocation record: SDM7 Ditha←Beginner / Iqbaludin←Intermediate (slot1) + [] (slot2); SDN shared Thu → first-listed full (Widia), Vazira []; Sains Thu Luthfi ← L46a+L46b union, SMP-slot ← [] (F14: SMP Sains has sessions but zero exemplar students); Paris a/b ← L13/L46; EXPO-only trainers → no absensi record; second asisten dropped (single asistenId: Tridaya→Vazira, SDIT→Asyifa).
- F13 refined: legacy `absensi` write checks ownership only (no assignment gate), so cover sessions (Luthfi/Rahmat SMP-Tridaya, Rafly Annimah-Thu) write 200 here while their `absensiPengajar` rows 403 — same business event, opposite verdicts across the two entities. Genuinely inconsistent authorization posture; flagged, not patched.
- F14 (new): SMP Sains Al-Biruni runs 3 Sept sessions (invoiced combined with SD) but contributes 0 exemplar students — basis-siswa billing sees meetings without pupils.
- `Verified: npm run build -> 8.43s, same pre-existing warning only`

## Gate G5 — Sept money hit/miss (DONE)

```text
MICROTASK: Run real finance.js on migrated DB vs exemplar-derived expectations
  EDIT:    none in src/ or DB (read-only: API dump + node import of finance.js + xlsx expected)
  RULES:   real code under test (no reimplementation); audit test assumptions first (taste #14); temp scripts removed
  DEPENDS: G2b, G3, G4c-2, G4d
  OUTCOME: SPP 19/19 HIT + Trial-probe HIT; Honor 7 HIT with -875k fully decomposed (F9 650k + F13 225k)
  VERIFY:  table below recomputed from DB; zero UNPARSED cells; build green
  DONE-IF: verify passes; verdicts recorded with owners
```

### SPP per-meeting (`billingForSekolah`, real code) — 19/19 HIT

All 19 configured schools HIT to the rupiah (formula + D8 tariffs + Hadir-only counting + Trial exclusion all hold). SMPN 18 stays FLAT legacy (F2, `basis flat_legacy`, flat target 4.750.000). Trial probe: 1 meeting × (1 Aktif + 1 Trial) @10000 → 10000 HIT (M5.4.3 holds). Largest tagihan: SDM7 22.050.000 (12×49×37.500), Sains 13.750.000 (10×22×62.500), Sabang 9.528.750 (9×77×13.750).

### Honor session-role (matrix-expected vs `financialData`) — 7 HIT, -875.000 decomposed

HIT (7): Ditha 800k, Iqbaludin 1M, M Davin 200k, Rafly 750k, Paris 600k (double-slot days count 2 ✓), Vazira 450k (all-Sept-(I) → Newbie rate ✓), Widia 1.2M (incl. 09-01 bare-name EXPO).
MISS total exp 6.975.000 vs app 6.125.000, delta -850.000 = F9 650.000 (Afrizal 100k + Alifah 150k + Asyifa 150k + Ira 150k + Raihan 50k + Zahra 50k: asisten sessions unrepresentable — no accounts/rows) + F13 200.000 (Rahmat 125k: Tridaya-(I) cover 75k + Istiqamah-(A) 50k role-aware, no assignment; Luthfi 75k: SMP-Tridaya 09-01 cover). No per-person-rate error anywhere the app could see a row: every recorded row honors D2 tiers exactly, and no single session exceeds Senior 100k (150k rows are multi-session sums, e.g. Rahmat 75+50, Asyifa 3×50, Ira 3×50).
Cash check: labaRugi 0 with empty ledgers (D1 ✓ — migration tests tagihan/beban level by design; no payments recorded).

### F15 (new, cosmetic): fractional `spp` legacy

Semester/6 monthly normalization yields non-integer rupiah (SMP-Tridaya 141666.67, SD-Tridaya 116666.67) → flat `targetSpp` fractions (2.450.007, 1.700.004; Potensi total 53.535.011). Per-meeting path unaffected (uses tarif directly). Flagged for rounding rule, not patched.

### Expected-side repairs (taste #14 — test audited before verdict)

Dropped `for nm` header (silent single-count per cell, caught by Paris 3-vs-6) → restored; bare-name EXPO (`Widia\n(EXPO)`) → pending-name rule; junk rows (`SABTU`, `Kelas online`) → school-set guard; FULL-map gaps (asisten short names) → completed. Zero UNPARSED at verdict.

- `Verified: npm run build -> 6.62s, same pre-existing warning only`

## Reconciliation plan + confusion list for the team (2026-09-25, user-requested)

Context: flat Potensi (53,5M) vs per-meeting tagihan (73,5M) disagree; some schools bill frozen (SMPN 18 pattern) rather than per-session tariffs.

### Plan (no code yet — decisions first, smallest slice second)

- P1: Name the existing mechanism instead of building a new one. `metodePembayaran null` = **SPP Flat / Frozen (Beku)**; set = **SPP Tarif per Pertemuan**. The SchoolForm opt-in toggle (`SchoolList.jsx:668`) becomes the category switch with these labels + an effective-bill preview. No schema change.
- P2: Kill the two-answers problem at the view layer. Potensi per school = invoice-path figure when Tarif-configured, `spp × pupils` when Frozen; totals sum per school. History untouched (R-SB3: null-method schools byte-identical). Canonical totals stay in the server invoice generator (D-SB10).
- P3: Frozen membership is an explicit dated roster decision (Q1 below), not auto-detection. Default: only SMPN 18; adding a school never rewrites past invoices (frozen at Terbit, D-SB11).
- P4: Cover-session billing asymmetry (found in G5 data): SMP-Tridaya Sept bills 3 meetings (incl. 2 covers) while honor pays 1 (covers have `absensi` rows — no assignment gate — but no `absensiPengajar` rows). School billed, trainer unpaid by system. Team ruling needed (Q6).

### Confusion list (for the other team — one concrete pick each to confirm/reject)

- Q1: Besides SMPN 18, which schools are Frozen? Pick: none for now (all 19 others stay Tarif). Rejecting = name them with monthly flat figures.
- Q2: Semester schools (SMP Tridaya 850k, SD Sains 750k, SD Tridaya 700k): fixed cycle total regardless of meetings held (frozen-flavored), or `tarif × actual` (sensitive, current)? Pick: sensitive per D-SB5 (LIBUR reduces bill).
- Q3: Trainer-basis schools (Salman 165k, SMA 130k, Hikam2 125k, MA 200k): keep `tarif × sessions`? Pick: yes.
- Q4 (F14): SMP Sains meetings bill × SD roster (current single-record behavior)? Pick: yes, unless team registers SMP pupils separately.
- Q5: EXPO sessions — billed or not? Current: excluded from billing (no `absensi` rows), included in honor. Pick: keep excluded.
- Q6: Cover sessions — billable to schools? Currently YES billed (legacy `absensi` has no assignment gate) while honor pays 0. Pick needed: bill + pay (add assignment path, F13 fix) / bill + don't pay (margin, state explicitly) / don't bill.
- Q7: Collection flow (installments, carry-over, Lunas-derivation, honor payouts) has zero exemplar coverage — ledgers empty by design. Team to supply payment samples or accept Unverified.

## Remaining (explicitly Unverified)

- Full E2E suite green + unrelated-failure triage — Unverified (only remaining; narrowest checks all green, full suite deferred per taste).
