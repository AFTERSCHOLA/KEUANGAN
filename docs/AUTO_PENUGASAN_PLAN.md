# Auto Penugasan Plan — Assignment Auto-Creation + Manager Completion

**Status:** DRAFT 2026-09-25 — written from simulation Sim-166991 evidence, awaiting build.
**Position:** Follow-up chain per taste #40 (temporary gate doc, like the PG pair). It does **not** replace `IMPLEMENTATION_PLAN.md`, `SCOPE_EXPANSION_PLAN.md`, `SCOPE_EXPANSION_PRIVILEGES.md`, `TRAINER_ATTENDANCE_PLAN.md` / `TRAINER_ATTENDANCE_MILESTONES.md`, or `PENUGASAN_PLAN.md` / `PENUGASAN_MILESTONES.md`. It **explicitly supersedes** `PENUGASAN_PLAN.md` D-PG2 (see D-AP1) on client authority (decision summary 2026-09-25 answering the Sim-166991 question list).
**Contract order:** `docs/UNIVERSAL.md` (primary, read first) → `docs/IMPLEMENTATION_PLAN.md` Part 2 → `docs/SCOPE_EXPANSION_PLAN.md` + `docs/SCOPE_EXPANSION_PRIVILEGES.md` → `docs/TRAINER_ATTENDANCE_PLAN.md` §5.2/§8 + `docs/TRAINER_ATTENDANCE_MILESTONES.md` → `docs/PENUGASAN_PLAN.md` / `docs/PENUGASAN_MILESTONES.md` → this file.

---

## 1. Context and inputs

- Sim-166991 (Playwright `tests/sim-full-flow.spec.js`, HEAD `8bbbb49`, 2026-09-24): a fresh cabang → sekolah → 5 siswa → trainer+account → trainer legacy-absensi flow ends with `PaymentTable` showing `0 Pertemuan / Beban Rp 0` and school finance `0 Sesi / Beban Rp 0`, because `PaymentTable.jsx:37,52`, `FinanceReport.jsx:91,99`, `TrainerDashboard.jsx:25,29`, `OverviewCards.jsx:30` all pass `absensiPengajar[]` and `financialData()` takes the Gate C source (`finance.js:83`, D-TA14). The Sim trainer's `Absensi Saya` is hard-blocked with `TrainerAttendanceForm.jsx:116` "Tidak ada penugasan aktif untuk tanggal ini…" — no step of the natural onboarding creates a `penugasanPengajar` row.
- `PENUGASAN_PLAN.md:11` + F-PG1 already document that `TrainerList.jsx:449-482` writes only `sekolahIds[]` (0 refs to `penugasanPengajar`); PG.A built the manual manager instead. Locked D-PG2 explicitly **rejected** auto-backfill (Option B: "invents date semantics + drift risk").
- Client decision summary 2026-09-25 reverses D-PG2 on authority of the simulation evidence: assigning a school to a trainer MUST auto-create the assignment (start = creation date, end = ongoing, day/time live from `sekolah.jadwalList`, asisten empty), while keeping manual Tambah. Same summary decides: legacy attendance kept + labeled (no honor effect), per-meeting billing (option b), matrix status format + full-detail exports, admin_cabang honor-write grant pending audit confirmation, next-sim scope (izin/alpa + koreksi), Sim-166991 deletion (done), Rekap Saya honor-summary-only.
- Audit confirmation (verified 2026-09-25 against HEAD, answering the decision-6 question): `insertLedger()` emits `auditEvent($entity.'_recorded', …)` (`server/bootstrap.php:241`) with actor + cabang (`server/auth/session.php:147-163`); payment "delete" is an append-only correction (`PaymentTable.jsx:116-133` → `correctLedgerEntry('honorPayments', …)` in `store.js:419-429` → `honorPayments.php:13-27` → same `insertLedger`), so deletes are trailed too. `admin_cabang` can read own-branch `audit_log` (`server/tests/authorize.policy.php:73`; trainer cannot at all). Caveat: no viewer UI exists for `audit_log` (no tab in `App.jsx:36-62`) — the trail is server-side only.

## 2. Goals and non-goals

**Goals**

1. Assigning a school to a trainer auto-creates one active assignment with safe defaults; the trainer's `Absensi Saya` unblocks without visiting Penugasan Manager (closes the Sim-166991 dead end).
2. Day/time stays a live derivation from `sekolah.jadwalList` (no snapshot); a jadwal edit propagates with zero penugasan edits (regression-proves the old out-of-sync bug class dead).
3. The manager list gains Edit + dynamic actions (Aktif → Edit + Nonaktifkan; Nonaktif → Edit + Aktifkan + Hapus); delete is row-only soft removal preserving `absensi_pengajar` history and honor math.
4. Legacy attendance is labeled "tidak memengaruhi honor"; matrix cells use the client format; exports carry full details.
5. `admin_cabang` gains own-branch honor-write; cross-branch and trainer writes stay denied.

**Non-goals (stay out of this chain)**

- Per-meeting billing build (decision option b). Direction authorized, but it touches D1 cash basis + R4 ledger trust (see §4 D-AP6 tension) — it gets a decision checkpoint, not build microtasks, in this chain (taste #25).
- Per-assignment time overrides (still owned by the School form; `PENUGASAN_PLAN.md` §2 non-goal stands).
- Audit-log viewer UI (not requested; trail stays server-side).
- Assistant dropdown, photo slots, catatan, SPP→invoice, aging (client-deferred to later sims).

## 3. Findings registry (F-AP)

| ID | Finding | Evidence |
|---|---|---|
| F-AP1 | **Assignment never auto-created; contradicts locked D-PG2.** Both assignment write paths (`TrainerList` school checkboxes, `SchoolList` trainer multi-select per Part 2 rule 1) write ID arrays only. | Sim-166991 probe cells (`0 Pertemuan / Beban Rp 0` with 1 legacy Hadir row); `TrainerAttendanceForm.jsx:35-50,116`; `PENUGASAN_PLAN.md` D-PG2 (Locked, rejects auto-backfill) |
| F-AP2 | **Deactivated rows are dead ends (verified, not assumed).** `Tindakan` renders `Nonaktifkan` only when `aktif === true`; inactive rows render nothing — no Edit, no re-activate, no delete. | `src/features/penugasan/PenugasanManager.jsx:236-246` |
| F-AP3 | **Legacy form implies honor effect.** Nothing on the form states it no longer feeds honor. | `src/features/attendance/AttendanceForm.jsx:159-267` (no memo label) |
| F-AP4 | **Matrix status premise corrected.** Status IS rendered for non-Hadir (`Nama (I) — KET (Status)`); Hadir renders bare `Nama (I/A)` — which already matches the exemplar default. The real delta is only: status position (`— Status` form) and zero export on the Rekap page. | `src/features/attendance/TrainerAttendanceRecap.jsx:42-47`; `docs/exemplar/ABSENSI TRAINER.xlsx` (`Nama (I)/(A)` cells) |
| F-AP5 | **Jadwal exports carry plan, not actuals.** `exportJadwalPenugasanCSV` writes `Sekolah\|Trainer\|Asisten\|Waktu\|Tanggal` slot rows; no status/keterangan exists at that layer. Full-detail export is unplanned new work, and exemplar-faithful actuals belong on the Rekap page, not the Jadwal page. | `src/lib/csv.js:130-136`; `src/features/penugasan/PenugasanTimetable.jsx:82-95` |
| F-AP6 | **Honor RBAC split-brain (known).** UI offers `Bayar Manual`/delete to admin_cabang; server denies `write_honor_payment/settle_honor` to non-superadmin. Audit covers the grant (see §1), so the grant is unblocked. | `server/auth/authorize.php:157-159,175-177`; `PaymentTable.jsx:222-230`; `server/bootstrap.php:241` |
| F-AP7 | **Server-enriched writes are invisible to the writer.** `writeRemote` merges the SENT record over cache (`store.js:376-380`) while the update response carries no payload — so rows the server injects (AP.A.1) are deleted by the next stale full-array re-save (proven: AP.A.1 re-save leg dropped 2 rows to 1 with links intact). Fix: echo the canonical array in the response (additive), not a client rewrite. | AP.A.1 VERIFY failure 2026-09-25 + leftover `trn-PST-…-0e85088` (links [A,B], rows [A]) |
| F-AP8 | **Checkbox interaction vs background re-render (observation, needs repro).** In AP.B.1, toggling the `Berlaku terus` checkbox (DOM state changed, Playwright action succeeded) twice rendered no date field within 60s — consistent with the change event landing on a node replaced mid-action by a background store re-render (crossScopeNames lookup effect). Worked around in VERIFY via the asisten-edit path (no conditional fields). No microtask: needs a minimal repro before any build. | AP.B.1 runs 2026-09-25 (2×) |

## 4. Decision set (D-AP)

| # | Decision | Status |
|---|---|---|
| D-AP1 | **Supersede D-PG2: auto-create on assignment (server-side).** When an admin's trainer-update or school-update write adds a school↔trainer link with no overlapping active assignment, the server appends one `penugasanPengajar` row: `periodeMulai` = creation date (local), `periodeSelesai` = null (ongoing), `asistenId` = null, shared helper (no dual client logic). Idempotent: overlapping active row ⇒ skip. Manual Tambah retained. | Locked (client 2026-09-25) |
| D-AP2 | **Live schedule reference (no snapshot).** `penugasanPengajar` stores no day/time (model unchanged, `PENUGASAN_PLAN.md` §5); all Waktu text derives from `sekolah.jadwalList` at read. Guard test pins it. | Locked |
| D-AP3 | **Manager actions dynamic + soft delete.** Aktif → Edit + Nonaktifkan; Nonaktif → Edit + Aktifkan + Hapus. Hapus removes the array entry only; `absensi_pengajar` rows and honor math untouched (separate table, latest-wins R-TA4). | Locked |
| D-AP4 | **Legacy duality labeled.** Attendance form + Riwayat carry memo text "tidak memengaruhi honor" (Indonesian copy §7). Intentional duality, not a bug. | Locked |
| D-AP5 | **Matrix format + Rekap export.** Cell: Hadir bare (`Nama (I)`); Hadir+ket → `Nama (I) — KET`; Izin/Alpa → `Nama (I) — Izin/Alpa` (+ `, KET` when both). Full-detail export lives on the **Rekap** page (actuals mirror visible cells); Jadwal export stays plan-only. | Locked (format + page confirmed 2026-09-25) |
| D-AP6 | **Per-meeting billing: direction authorized, checkpoint before build.** Semester string (e.g. `Rp850.000 … (12 kali)`) ⇒ rate/meeting; BUT computing `realisasiSpp` from sessions would break D1 cash basis (`labaRugi = cash in − cash out`, `finance.js:169-170`) and R4 ledger trust (`realisasiSpp` = `sppPayments` sum, `finance.js:95-97`). Proposed split (checkpoint, TA.C.2b-style): cash `Pemasukan` untouched; new **memo** billable figure (rate × sessions held) + new rate field supplementing `sekolah.spp`. No build until checkpoint signed. | Checkpoint required |
| D-AP7 | **Grant admin_cabang own-branch honor-write.** `authorize.php` admin lane allows `honorPayments` create/update/delete/write + verify/correct iff `recordOwnsBranch`; cross-branch and trainer writes stay 403. Audit confirmed (§1) — grant proceeds. | Locked |
| D-AP8 | **Rekap Saya stays honor-summary-only.** No session counts, no payment history for trainers. | Locked (no build) |

## 5. Data model (restatement; AP-A–AP-D change nothing)

`penugasanPengajar[]` on `trainer.payload` keeps the `PENUGASAN_PLAN.md` §5 shape (`{id, sekolahId, trainerId, asistenId, cabangId?, periodeMulai, periodeSelesai|null, aktif}`). D-AP6's rate field is **not** added in this chain (checkpoint only).

## 6. Rules (R-AP)

- **R-AP1** One concern per edit (R1); classNames move verbatim (R5); factories/ledger trust untouched (R3/R4).
- **R-AP2** Server is authoritative for D-AP1/D-AP7 (taste #61); UI mirrors, never guards alone.
- **R-AP3** Indonesian copy pinned (§7); role locators `getByRole`, Sim-marked probe data, `clearOverlays` nets (testing taste #30/#31).
- **R-AP4** Destructive probes last; reactive cleanup (`_cleanup_sim_data.php --pattern=<suffix>` + users/cabang tail SQL), never caps (taste #55/#66).
- **R-AP5** `Verified: <command> -> <result>` per microtask; `deploy/` only via `npm run build:deploy` (taste #71/#72); no `console.log` in `src/`.

## 7. UI concept (pinned copy)

Auto-create: no new UI (silent row + toast `Penugasan otomatis dibuat`). Manager Tindakan: `Edit`, `Nonaktifkan`, `Aktifkan`, `Hapus`; confirms `Nonaktifkan penugasan ini?`, `Aktifkan kembali penugasan ini?`, `Hapus penugasan ini? Riwayat absensi tidak ikut terhapus.`; empty still `Belum ada penugasan.` Legacy memo: `Catatan: absensi ini tidak memengaruhi honor.` Matrix: `Nama (I)` / `Nama (I) — EXPO` / `Nama (I) — Izin`.

## 8. Alignment table (taste #68)

| Finding | Confirmed by docs | Not documented / implied | Disposition |
|---|---|---|---|
| F-AP1 auto-create missing | F-PG1 mechanics; D-PG2 rejects it (Locked) | Client reversal 2026-09-25 | Supersede D-PG2 via D-AP1; build AP-A |
| F-AP2 dead-end actions | Manager built by PG.A.1 (only Nonaktifkan) | Edit/reactivate/delete never specified | Build AP-B |
| F-AP3/F-AP4 label+format | Duality decided 2026-09-25; Recap:42-47 renders status already | `— Status` position; Rekap export page | Build AP-C on Rekap page (confirmed 2026-09-25) |
| F-AP5 export actuals | csv.js plan-only; no Rekap export | Full-detail actuals export | Build AP-C on Rekap page (confirmed 2026-09-25) |
| F-AP6 RBAC | Matrix superadmin-only; authorize.php deny-list | admin grant + audit proof | Build AP-D (audit verified §1) |
| Billing option b | `Biaya Ekskul.xlsx` semester strings; D1 cash; finance.js:95-97,169-170 | rate field + memo split | Checkpoint only, no build |

## 9. Access model (explicit, D-AP7)

| Action | Superadmin | Admin Cabang | Trainer |
|---|---|---|---|
| Auto-created assignment read | ✅ all | ✅ own branch | 🟡 own rows (dropdown source) |
| Penugasan Edit/Nonaktif/Aktif/Hapus | ✅ all | ✅ own branch (session authority) | ❌ never (R-TA6) |
| Honor write/verify/correct | ✅ all | ✅ own branch only (`recordOwnsBranch`) | ❌ never |
| Legacy absensi write | ✅ | ✅ own branch | ✅ own sessions (labeled memo) |

## 10. Deferred with owners

| Item | Owner / venue | Why deferred |
|---|---|---|
| D-AP6 billing build (rate field + memo split + invoice feed) | Finance track, TA.C.2b-style checkpoint | Touches D1/R4; checkpoint must sign before any EDIT |
| D-AP5 Rekap-vs-Jadwal export page | Decided 2026-09-25: Rekap page (actuals mirror) | — |
| Audit-log viewer UI | Unrequested | Trail verified server-side; no UI asked |
| Assistant/photo/catatan/SPP→invoice/aging sims | Later sim passes (client order: izin/alpa + koreksi first) | Explicitly sequenced 2026-09-25 |
| F-AP8 checkbox-vs-rerender repro | Future hardening (needs minimal repro: checkbox change lost across background store update) | Observed 2× in AP.B.1 VERIFY; worked around via asisten path; no build without repro (taste #13) |

## 11. Write-back contract (on AP close)

Record `Verified:` lines in `AUTO_PENUGASAN_MILESTONES.md`; append closure row to `SCOPE_EXPANSION_MILESTONES.md` (no renumbering — temporary gate doc, taste #40/#74); Sim probe data cleaned with `--pattern` + tail SQL (R-AP4).
