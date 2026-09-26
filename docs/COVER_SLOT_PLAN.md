# Cover Slot Plan — Explicit Slot-Pick Auto-Create + Cover Path + Per-Session Role

**Status:** DRAFT 2026-09-26 — Gates CS.A–CS.C open (no Verified lines yet; see `docs/COVER_SLOT_MILESTONES.md`).
**Position:** Temporary scope-expansion chain per taste #40. It does **not** replace `IMPLEMENTATION_PLAN.md`, `SCOPE_EXPANSION_PLAN.md`, `SCOPE_EXPANSION_PRIVILEGES.md`, `TRAINER_ATTENDANCE_PLAN.md` / `TRAINER_ATTENDANCE_MILESTONES.md`, `PENUGASAN_PLAN.md` / `PENUGASAN_MILESTONES.md`, `PENUGASAN_SLOT_PLAN.md` / `PENUGASAN_SLOT_MILESTONES.md`, `AUTO_PENUGASAN_PLAN.md` / `AUTO_PENUGASAN_MILESTONES.md`, or `SPP_BILLING_PLAN.md` / `SPP_BILLING_MILESTONES.md`. It explicitly revises `AUTO_PENUGASAN_PLAN.md` D-AP1/D-AP2 (whole-school auto-copy) via re-plan, not a silent change. When Gate CS.C closes, §11 records completion back on the source docs.
**Contract order:** `docs/UNIVERSAL.md` (primary contract, read first) → `docs/IMPLEMENTATION_PLAN.md` Part 2 → `docs/SCOPE_EXPANSION_PLAN.md` + `docs/SCOPE_EXPANSION_PRIVILEGES.md` (scope-expansion first-reads) → `docs/TRAINER_ATTENDANCE_PLAN.md` §5.2/§8 + `docs/TRAINER_ATTENDANCE_MILESTONES.md` → `docs/PENUGASAN_PLAN.md` §2/§4/§5 + `docs/PENUGASAN_MILESTONES.md` → `docs/PENUGASAN_SLOT_PLAN.md` §2/§4/§5 + `docs/PENUGASAN_SLOT_MILESTONES.md` → `docs/AUTO_PENUGASAN_PLAN.md` §4 (D-AP1/D-AP2) → `docs/SPP_BILLING_PLAN.md` §4 (D-SB10 canonical invoice path) → this file.
**Locked inputs (not re-decided here):** Q1(a) bill school + pay substitute (`docs/EVALUATION_LOG.md` Final Policy Confirmation; `docs/EXEMPLAR_MIGRATION.md` G4c-2/F13, G5); Q2 dashboard follows the invoice pipeline (`EXEMPLAR_MIGRATION.md` P1–P2); D2 honor tiers Inti Senior 100k / Inti Newbie 75k / Asisten 50k whoever fills the slot (`EXEMPLAR_MIGRATION.md` D2).

---

## 1. Context and inputs

- Exemplar ground truth (G4c-2/G4d/G5): cover sessions (Rahmat→M Davin, Luthfi→SMP Tridaya) bill the school through legacy `absensi` (ownership-only gate, `server/auth/authorize.php:203-204`) but 403 on `absensiPengajar` (ownership + assignment gate, `authorize.php:205-215` via `trainerHasActiveAssignment()` `:57-94`). DB holds 70 Sept legacy rows vs 69 latest-wins pengajar rows; the 3 cover cells have no assignment path (F13). Per-trainer split `Luthfi 15, Widia 12, Iqbaludin 10, Rafly 10, Ditha 8, Paris 6, Vazira 6, Davin 2` with 6 EXPO recomputes exactly; app honor 6,125,000 vs expected 6,975,000 (delta -850k = F9 650k + F13 200k).
- Auto-create (AUTO_PENUGASAN D-AP1/D-AP2) appends one active row per new school↔trainer link with `periodeMulai` = creation date, `periodeSelesai` = null, `asistenId` = null, and derives day/time live from `sekolah.jadwalList` (no snapshot). The slot model (PENUGASAN_SLOT D-PS2/D-PS3/D-PS4) scopes each row with a nullable triple (`hari`/`jamMulai`/`jamSelesai`), offers only the school's slot vocabulary, and filters the timetable by exact triple match. Whole-school copy and explicit slot-pick cannot both be true for a 3-slot school.
- Role gap: the same person is Inti in one session and Asisten in another (Vazira case, D2-revised), but the label follows live `tipePengajar` (`src/lib/trainerAttendance.js:66`), honor reads per-person `trainer.honor` (`src/lib/finance.js:111-114`), the assignment carries a single `asistenId` (`src/features/penugasan/PenugasanManager.jsx:23`), the legacy form carries a single `asistenId` (`src/features/attendance/AttendanceForm.jsx:18`), and `newAbsensiPengajar` carries no asisten field at all (`src/lib/constants.js:345-366`). Up to 2 asisten per session (F9) and external assistants without logins have no write path.
- Ordering trap: dashboard Potensi is flat `siswaBilling.length × sch.spp` (`src/lib/finance.js:89-94`, DB total 53,535,011) while per-meeting billing is tariff-based (`billingForSekolah`, tariff-only ≈73.45M). The server `invoiceGenerator.php:106-135` still groups by flat `spp`, so switching the dashboard first only moves the two-answers problem (P1/P2 lesson: Dashboard last).
- Existing idioms to reuse, not invent: slot triple + vocabulary + exact-match predicate (D-PS2–D-PS4); `Modal`/`AlertDialog`/`type=time` manager controls (D-PS6/D-PG8); append-only corrections via `correctionOf` + latest-wins (`trainerAttendance.js:14-19`, `absensiPengajar.php:21-68`); Indonesian pinned copy (§7).

## 2. Goals and non-goals

**Goals**

1. Assigning a school to a trainer offers an explicit slot pick (nullable triple); wholesale whole-school copy is removed, while unscoped (`null`) rows keep today's behavior byte-identically.
2. Cover/substitute sessions get an explicit assignment path so Q1(a) holds end-to-end: the school bills and the substitute is paid.
3. The session role (I/A) is stored per session/attendance record, never on live `tipePengajar`; honor reads role-first.
4. Up to 2 asisten per session are representable, and external assistants without logins are writable with a mandatory recorder audit.
5. Privilege boundaries stay explicit; no role is broadened as a shortcut (taste #33). Dashboard switches source only after the invoice-generator upgrade lands (sequencing guard).

**Non-goals (stay out of this chain)**

- The invoice-generator per-meeting upgrade itself — owned by the SPP_BILLING chain (SB.B/SB.C); this chain only guards the order (D-CS7).
- Invoice-level payments, carry-over/credit economics, SPP ledger shape — SPP_BILLING chain (D-SB8/R-SB6).
- Honor payment scheduling/cash-flow deferral rules — finance chain after Payable exists (EVALUATION_LOG Stages 5–6).
- Audit-log viewer UI — server trail only (per AUTO_PENUGASAN §1 caveat).
- Slot-scoped honor weighting beyond role-first (e.g. different tariff per slot) — needs an explicit tariff source, not inferred.

## 3. Findings registry (F-CS)

| ID | Finding | Evidence |
|---|---|---|
| F-CS1 | **Auto-create whole-school copy conflicts with the slot model.** A 3-slot school cannot both auto-copy all slots and require an explicit slot pick. | `AUTO_PENUGASAN_PLAN.md` D-AP1/D-AP2 vs `PENUGASAN_SLOT_PLAN.md` D-PS2/D-PS3/D-PS4; exemplar per-slot staffing (`SDM 7` Rabu ×3, `SDN 037 Sabang` Kamis ×2) |
| F-CS2 | **Cover sessions bill but never pay (Q1(a) violated in code).** Same business event: 200 on legacy `absensi`, 403 on `absensiPengajar`; 3 Sept cells have no assignment path. | `authorize.php:203-215`; `EXEMPLAR_MIGRATION.md` G4c-2/F13, G4d/F13-refined, G5 (-850k = F9 650k + F13 200k); DB 70 vs 69 rows |
| F-CS3 | **Single-`asistenId` cap blocks real sessions.** Assignment, legacy form, and pengajar factory each carry at most one assistant; exemplar needs two. | `PenugasanManager.jsx:23`; `AttendanceForm.jsx:18,110-111`; `constants.js:345-366` (no asisten field); `EXEMPLAR_MIGRATION.md` F9 |
| F-CS4 | **Per-person honor/role cannot express per-session I/A.** Label follows live type; honor follows the person; the Vazira dual-role case is unrepresentable. | `trainerAttendance.js:66`; `finance.js:111-114`; `EXEMPLAR_MIGRATION.md` D2-revised, D3, F3 |
| F-CS5 | **External assistants have no write path and no recorder audit.** No login, no entity, no attendance attribution; a trainer-claimed `Present` would mint 50k without a trail. | `constants.js:345-366`; `EVALUATION_LOG.md` assistant-external analysis + recorder risk note |
| F-CS6 | **Dashboard-first is a trap while the generator is still flat.** Potensi 53,535,011 vs tariff-only ≈73.45M; the canonical generator still bills flat. | `finance.js:89-94` vs `billingForSekolah`; `invoiceGenerator.php:106-135`; `EXEMPLAR_MIGRATION.md` P1–P2, F7; `SPP_BILLING_PLAN.md` D-SB10 |

## 4. Decision set (D-CS)

| # | Decision | Status |
|---|---|---|
| D-CS1 | **Slot-pick auto-create (concrete pick, revises D-AP1/D-AP2).** When an admin link-add finds no overlapping active assignment, the server does **not** copy the whole school schedule. It creates rows only for admin-picked slots from the school's `jadwalList` vocabulary (nullable triple per D-PS2; `Semua slot` = unscoped `null` allowed). No pick, no row — the trainer form keeps its pinned "no active assignment" guidance (`TrainerAttendanceForm.jsx:133-135`). Overlap check stays idempotent (overlapping active row ⇒ skip); cover rows never conflict with their origin (D-CS2). | Locked |
| D-CS2 | **Cover path (concrete pick, implements Q1(a)).** A cover assignment is an explicit row on the substitute's payload with `coverOf` = origin assignment id + same `sekolahId`/slot/date scope. The school bills through the cover's legacy session row; the substitute's `absensiPengajar` row passes the assignment gate through the cover link. No cover link, no pay — the 403 stays for genuinely unassigned writes. | Locked |
| D-CS3 | **Per-session role (concrete pick).** `absensiPengajar` rows carry `peran: 'I' \| 'A'` for that session. Matrix labels and honor read this field; live `tipePengajar` is display fallback only and never overwrites history (D-TA16 analog). The same person is I in one row and A in another with no type change. | Locked |
| D-CS4 | **Multi-assistant (concrete pick, additive).** Assignment rows gain `asistenIds: null \| [id]` (max 2) alongside legacy `asistenId`; reads use the union (legacy counts as position 0); writes prefer the new key. Attendance stays per-person rows (one row per present person, each with `peran`), so 1 I + 2 A is 3 rows. No renames, no deletions. | Locked |
| D-CS5 | **External assistants (concrete pick, minimal + audited).** New minimal person record `{ nama, kontak, sekolahId, cabangId }`, no login account, created by admin_cabang (own branch) or superadmin only. Attendance for an external is recorded by an authorized admin/trainer in-scope for that school+date and **must** carry `dicatatOleh` = recorder user id (who claimed the 50k). Missing recorder fails hard; trainer creation of externals is deferred (reference-only for trainers). | Locked |
| D-CS6 | **Role-first honor (concrete pick).** `peran 'A'` → flat 50k per D2 (whoever fills the slot, incl. externals); `peran 'I'` → the row owner's `trainer.honor` per R-TA3 (Senior/Newbie tiers, no hardcode). No `peran` on legacy rows → legacy path unchanged (R-SB3 analog: history byte-identical). | Locked |
| D-CS7 | **Dashboard-last sequencing (guard, not build).** The dashboard keeps the flat Potensi source until the SPP_BILLING chain ships the per-meeting generator upgrade (SB.B/SB.C, D-SB10). This chain adds a regression guard pinning both figures (Potensi 53,535,011 + tariff-only ≈73.45M on the exemplar fixture) so a premature source switch fails loudly. Generator work itself is deferred with owner (§10), never duplicated here. | Locked |

## 5. Data model (extensions, additive only)

```text
penugasanPengajar[] on trainer.payload (host = substitute for cover rows):
{ id, sekolahId, trainerId (= host id), asistenId (legacy, read as union),
  asistenIds: null | [id] (max 2, new),
  coverOf: null | assignmentId (new, D-CS2),
  hari/jamMulai/jamSelesai (nullable triple, D-PS2, picked per D-CS1),
  cabangId, periodeMulai: "YYYY-MM-DD", periodeSelesai: null | "YYYY-MM-DD",
  aktif: true | false }

absensiPengajar payload additions (all nullable, legacy rows valid without them):
{ peran: null | 'I' | 'A' (D-CS3),
  dicatatOleh: null | userId (required when the row's person is external, D-CS5) }

external assistant person (new minimal record, no login):
{ id, nama, kontak, sekolahId, cabangId }
```

Invariants: `coverOf` must reference an existing assignment for the same `sekolahId` + overlapping scope; cover rows are excluded from the auto-create overlap check against their origin; `asistenIds` length ≤ 2 and every id must be a known trainer/external in-branch; `peran 'A'` on a row owned by anyone (incl. external) bills 50k; `dicatatOleh` is immutable once written (append-only correction creates a new row).

## 6. Rules (R-CS)

- **R-CS1** One concern per edit (IMPLEMENTATION R1): slot-pick, cover link, role field, externals, honor read, guard are separate microtasks; never restyle while fixing logic; classNames move verbatim.
- **R-CS2** Mirror, don't invent (taste #11): compose the D-PS2 vocabulary picker, D-PS4 exact-match predicate, `Modal`/`AlertDialog`/`type=time` idioms, and `correctionOf` latest-wins; Style source D-PG8.
- **R-CS3** Indonesian copy pinned (§7); tests select buttons by these exact names.
- **R-CS4** Schema additive only: no renames, no deletions, no new tables beyond the minimal external record; missing keys read as legacy behavior; silently writing unvalidated scope/role/recorder is a defect.
- **R-CS5** Server is authoritative (taste #33/#61): every cover/role/external/recorder write is gated in `authorize.php` + `entities.php`; UI mirrors, never guards alone; trainer assignment-write stays 403.
- **R-CS6** Verification language `Verified: <command> -> <result>` / `Unverified:` (UNIVERSAL); every microtask has one OUTCOME + one falsifiable VERIFY (taste #2); narrowest check runs immediately after the first edit (taste #4); source hygiene gate: no `console.log` in `src/`, no build artifacts in `git status` (taste #20); `deploy/` only via `npm run build:deploy` (taste #71, HARD parity gate #72).

## 7. UI concept (pinned copy)

Slot-pick step inside the existing assignment flow (after `Asisten`): `Slot` select defaulting to `Semua slot`, else `Hari` + `Jam Mulai`/`Jam Selesai` (`type=time`, vocabulary-only); errors `Hari, jam mulai, dan jam selesai harus merujuk pada jadwal sekolah yang dipilih.` and `Jam selesai harus setelah jam mulai.` Cover creation: `Buat penugasan pengganti` with `Pengganti untuk` (origin, read-only) + `Slot` + `Tanggal`; confirm `Buat penugasan pengganti untuk sesi ini? Sekolah ditagih, pengajar pengganti dibayar (Q1a).` Role control on the trainer form: `Peran sesi ini: Instruktur / Asisten`; external picker: `Asisten: [Pilih trainer] atau [Tambah asisten eksternal (tanpa login)]` (creation itself is admin-only; trainers see reference-only); recorder line on external rows: `Dicatat oleh: <nama> (<waktu>)`; empty states unchanged (`Belum ada penugasan.`). Trainer blocked copy stays: `Tidak ada penugasan aktif untuk tanggal ini. Minta Admin Cabang membuat penugasan.`

## 8. Alignment table — verify-the-verification gate (taste #68)

| Finding | Confirmed by docs (file/section) | Not documented / implied | Disposition in this chain |
|---|---|---|---|
| F-CS1 auto-create vs slot-pick | `AUTO_PENUGASAN_PLAN.md` D-AP1/D-AP2 (whole copy, live derivation); `PENUGASAN_SLOT_PLAN.md` D-PS2/D-PS3/D-PS4 (triple, vocabulary, exact predicate) | Conflict itself never resolved — each doc assumes the other bends | New decision D-CS1 (slot-pick wins; D-AP1/D-AP2 revised, D-PS* unchanged) |
| F-CS2 cover bills-not-pays | `EXEMPLAR_MIGRATION.md` G4c-2/F13, G4d/F13, G5; `EVALUATION_LOG.md` Q1(a) | Assignment path for covers never specified anywhere | New build D-CS2 (coverOf link) |
| F-CS3 single-assistant cap | `PenugasanManager.jsx:23`; `AttendanceForm.jsx:18`; `constants.js:345-366`; `EXEMPLAR_MIGRATION.md` F9; `SCOPE_EXPANSION_PLAN.md` A2 (singular dropdown) | Multi-assistant shape never decided | New decision D-CS4 (additive array + per-person rows) |
| F-CS4 per-person role/honor | `trainerAttendance.js:66`; `finance.js:111-114`; `EXEMPLAR_MIGRATION.md` D2-revised/D3/F3; `TRAINER_ATTENDANCE_PLAN.md` R-TA14/D-TA16 | Per-session role storage never specified | New decisions D-CS3 + D-CS6 (row-level `peran`, role-first honor) |
| F-CS5 externals + recorder | `EVALUATION_LOG.md` external-assistant analysis (no account, admin/trainer records attendance) | Entity shape + recorder audit never specified | New decision D-CS5 (minimal record, `dicatatOleh` required, trainer reference-only) |
| F-CS6 dashboard-before-generator | `finance.js:89-94` vs `billingForSekolah`; `invoiceGenerator.php:106-135` (still flat); `EXEMPLAR_MIGRATION.md` P1–P2/F7; `SPP_BILLING_PLAN.md` D-SB10 | Generator upgrade timing vs dashboard switch never sequenced | Guard D-CS7 here; build deferred to SPP_BILLING (§10) |

## 9. Access model (explicit, no broadening)

| Action | Superadmin | Admin Cabang | Trainer |
|---|---|---|---|
| Pick slots on auto-create / create scoped assignment | ✅ all branches | ✅ own branch only (session authority) | ❌ never (R-TA6; `authorize.php` write path 403) |
| Create cover link (`coverOf`) | ✅ all | ✅ own branch only | ❌ never (reference-only; cannot mint pay-eligibility for self/others) |
| Create external assistant person | ✅ all | ✅ own branch only | ❌ never (reference-only; deferred inline creation) |
| Record attendance incl. external (`dicatatOleh` = self) | ✅ all | ✅ own branch (write + correct) | 🟡 own school+date scope only; external rows allowed with `dicatatOleh` = self |
| Read timetable / matrix / honor | ✅ all + filter | ✅ own branch | 🟡 own rows only |
| Server rule | bypass | `recordOwnsBranch` + `entities.php` vocabulary/cover/recorder gates; nested `cabangId` match | `authorize.php` trainer lane: ownership + active-assignment-or-cover-link; no `correct` path (TA.B.4) |

## 10. Deferred with owners

| Item | Owner / venue | Why deferred |
|---|---|---|
| Invoice-generator per-meeting upgrade (generator reads `billingForSekolah` semantics) | SPP_BILLING chain SB.B/SB.C (D-SB10) | Canonical-path build; duplicating it here repeats F-SB6 |
| Invoice-level payments / carry-over / credit rollover | SPP_BILLING chain (D-SB8/R-SB6, SB.B.4) | Ledger economics, needs finance sign-off |
| Honor payment scheduling + cash-flow deferral (Payable vs Payment) | Finance chain after Payable exists (EVALUATION_LOG Stages 5–6) | Payable must exist first (Stages 2–3 here) |
| Dashboard source switch to invoice pipeline | After generator upgrade lands (Q2/P2); guarded by D-CS7 here | P1/P2 lesson: Dashboard last |
| Trainer inline creation of externals | Future plan amendment + abuse review | Broadens trainer write; reference-only is falsifiable now |
| Audit-log viewer UI | AUDIT chain | Trail verified server-side; no UI requested |
| Slot-scoped honor weighting beyond role-first | Finance chain + explicit tariff source | Would change D-TA14 beyond D-CS6; not inferred |

## 11. Write-back contract (taste #32/#43, on CS.C close)

Record `Verified:` lines per microtask in `COVER_SLOT_MILESTONES.md`; mark Gates CS.A–CS.C; append one closure row to `SCOPE_EXPANSION_MILESTONES.md` (no renumbering of the existing chain — this pair is the temporary gate doc per taste #40/#74); note the D-AP1/D-AP2 revision scope (AP stays otherwise intact) in `AUTO_PENUGASAN_PLAN.md` §10 without rewriting AP history; link Q1(a) closed and Q2 guarded in `EVALUATION_LOG.md`/`EXEMPLAR_MIGRATION.md` addendum without expanding the long-term plan.

## 12. Cross-references

- `docs/UNIVERSAL.md`, `docs/IMPLEMENTATION_PLAN.md` (Part 2 contract, Part 5 file map), `docs/SCOPE_EXPANSION_PLAN.md`, `docs/SCOPE_EXPANSION_PRIVILEGES.md`, `docs/TRAINER_ATTENDANCE_PLAN.md`, `docs/PENUGASAN_PLAN.md`, `docs/PENUGASAN_SLOT_PLAN.md`, `docs/AUTO_PENUGASAN_PLAN.md`, `docs/SPP_BILLING_PLAN.md`, `docs/EVALUATION_LOG.md`, `docs/EXEMPLAR_MIGRATION.md`, `docs/EXEMPLAR_F6_CONFIRM.md`
- `docs/exemplar/JADWAL EKSTRAKULIKULER CODING___.xlsx`, `docs/exemplar/Jadwal Ngajar & Invoice.xlsx`
- `src/lib/penugasan.js`, `src/features/penugasan/PenugasanManager.jsx`, `src/features/penugasan/PenugasanTimetable.jsx`, `src/features/attendance/TrainerAttendanceForm.jsx`, `src/features/attendance/AttendanceForm.jsx`, `src/lib/trainerAttendance.js`, `src/lib/finance.js`, `src/lib/constants.js`, `src/lib/store.js`
- `server/lib/assignments.php`, `server/validation/entities.php`, `server/auth/authorize.php`, `server/api/absensiPengajar.php`, `server/api/trainer.php`, `server/api/_master.php`, `server/api/read.php`, `server/lib/invoiceGenerator.php`
