# Afterschola Admin Dashboard — Bug-Fix & Refinement Plan (v2, Client-Decided)

**Scope:** Single-file React app `D:\Games and Apps\Coding\AdminDashboard\Projects.tsx` (2,174 lines, Gemini Canvas export).
**Status of codebase:** Structurally complete (balanced braces/parens/brackets, clean component termination). No `package.json`, build tooling, or Firebase config files — the file depends on Canvas-injected globals (`__firebase_config`, `__app_id`, `__initial_auth_token`) and assumes Tailwind CSS is loaded. Data layer: Firestore with localStorage fallback.
**v2 change:** All 9 open decisions from v1 are now answered by the client. This revision locks those decisions, deletes work they make unnecessary (migrations), and resequences the plan around the client's actual target: **local-first now, Hostinger + login later**.

---

## Part 0 — Client Decisions (LOCKED; every section below derives from these)

| # | Decision | Client answer (verbatim intent) | Consequence for the plan |
|---|----------|--------------------------------|--------------------------|
| D1 | **Accounting basis** | Laba/Rugi = pemasukan − pengeluaran, **cash basis**. "If not yet paid, it isn't expense." | `labaRugi = SPP lunas (cash in) − honor dibayar (cash out)`. Accrual figures (Beban Honor, Sisa Kewajiban) stay visible as clearly-labeled *memo* rows, NOT mixed into the profit number. Fixes v1 issue #3. |
| D2 | **Trainer ↔ School relationship** | One school has **one-or-more fixed trainers** (not interchangeable per session). One trainer may teach at **many schools** (flexible, different schedules). | Many-to-many via ID arrays both sides (`trainer.sekolahIds[]`, `sekolah.trainerIds[]`). Attendance form MUST include a per-session trainer picker (choices = that school's fixed trainerIds). Fixes v1 Part 1 + issue #5. |
| D3 | **Payment history restructure** | `honorDibayarBulan` map → `honorPayments[]` array: **approved** ("okay as long as beneficial"). | `honorPayments: [{ id, trainerId, periode, nominal, tanggalBayar }]`. Per-period "dibayar" becomes a derived sum. Gives audit trail + rollback-ability. No migration needed (see D6). |
| D4 | **Year scope** | **Academic Year.** Two dropdowns: Period/Year (e.g. "2026/2027") + Month. | All hardcoded `2026`/Jul–Des maps are replaced by a generated model: academic year runs **Juli → Juni** (12 months). Internal periode keys become `"YYYY-MM"` strings (e.g. `"2026-07"`); Indonesian month names are display-only. Every monthly-keyed map (`sppLunas`, payment filtering, CSV filters, absensi date init) uses these keys. Fixes v1 issue #6. |
| D5 | **Deployment target** | Hostinger site, **login section later**. | Auth is deferred to the backend phase. No login work now. Note for the executor: Hostinger's standard shared hosting is **PHP + MySQL** — the Express skeleton on the `dev-setup` branch may not be deployable there without a VPS/Node plan. Backend tech choice is deferred but flagged. |
| D6 | **Existing data** | **Fresh new start** — all data entered new. | **All migration code is deleted from the plan.** No legacy string→ID migration (v1 Part 1 last bullet), no `honorDibayarBulan`→`honorPayments[]` migration, no migration testing against real data. `seedDefaultData` demo-data function is deleted outright (it is currently dead code — defined, never wired to any button). |
| D7 | **Cloud vs local (now)** | **Local-only data, exportable to CSV.** Client views cloud as risky at this stage. | Phase 1 architecture: **pure localStorage, no Firebase.** The entire Firebase init/auth/`onSnapshot`/dual-write layer is REMOVED from `Projects.tsx`. The `syncStatus` badge becomes irrelevant → remove. |
| D8 | **Cloud (later)** | Intended eventually, unclear scope. | Phase 2 (separate project stage, not this plan's implementation target): Hostinger-hosted backend with login, importing the Phase-1 JSON backup format. Gap D (full JSON export/import) is therefore a **hard requirement**, not optional — it IS the future migration path. |
| D9 | **Scale** | Hundreds of students expected. "As long as beneficial, accepted." | Acceptable for localStorage (hundreds of small records ≪ 5 MB quota), but: (a) `sppLunas` maps MUST be year-keyed (`"2026-07"`), not month-name-keyed — otherwise they bloat/conflict across years; (b) future backend must paginate attendance/payments by (year, month). Per-entity array iteration in `useMemo` is fine at this scale; no virtualization needed. |

**What D6+D7 remove from v1:** the "one-time migration" in Part 1, decision Q7 (real-data export before migration), decision Q8 (confirm cloud vs local — answered: local), the seed-guard issue #8 (function deleted instead), and gap B's urgency (no cloud = no public-data exposure; access control returns with the Hostinger phase).

---

## Part 1 — Target Data Model (fresh start; this is the schema the executor writes to)

All entities use generated local IDs: `` `${prefix}-${Date.now()}` `` (existing pattern). **Names are display-only; all joins are by ID.** No `normalizeKey` cross-entity matching remains anywhere.

```js
sekolah:  { id, nama, alamat, foto, jadwal, spp, trainerIds: string[] }
trainer:  { id, nama, wa, jadwal, sekolahIds: string[], honor }
siswa:    { id, nama, wa, kelas, sekolahId, sekolahNama /*display cache*/, foto,
            sppLunas: { "2026-07": bool, ... } }   // year-month keyed, NOT month-name keyed
absensi:  { id: `${tanggal}_${sekolahId}_${trainerId}`, tanggal, periode: "YYYY-MM",
            sekolahId, trainerId, trainerNama /*display cache*/,
            trainerStatus, siswaList: [{ siswaId, nama, status }] }
settings: { logoUrl, title }
```

Payments move to their own collection/array (D3):

```js
honorPayments: [{ id, trainerId, periode: "YYYY-MM", nominal, tanggalBayar }]
// Derived: honorDibayar(trainerId, periode) = Σ nominal WHERE trainerId+periode match
```

Attendance stats finance math now keys `trainerMonthlyCount[trainerId]`. Honor lookup for a school = first matching trainer by ID from `sekolah.trainerIds` participating in that session's absensi record (each absensi already stores its own `trainerId`, so accrual is per-record exact — `.find()` heuristics disappear).

**Executor rule (prevents a reintroduction of v1's silent-reset bug):** *a form may only write the fields it renders.* Trainer form never touches payment data; siswa form owns `sppLunas`; payment modal is the only writer of `honorPayments`; school form owns `trainerIds`, trainer form owns `sekolahIds` — and each save re-derives the inverse array on the other entity (school saved with trainerIds → each affected trainer's `sekolahIds` updated in the same write).

---

## Part 2 — Issue Audit (v1 issues mapped to v2 fate)

| # | Sev | Issue (v1) | v2 fate |
|---|-----|------------|---------|
| 1 | Critical | Trainer CSV uses raw `t.nama` where UI uses `normalizeKey` — CSV/UI disagree | **Fixed by design**: all keys become `trainerId`; `normalizeKey` deleted entirely. |
| 2 | Critical | Absensi stores trainer *name* snapshot; rename corrupts history | **Fixed by design**: absensi stores `trainerId` (+ name as display cache only). |
| 3 | High | Laba/Rugi mixed accrual/cash | **Fixed per D1**: cash-basis profit; accrual items become labeled memo rows (see Part 3, R6). |
| 4 | High | No cascade on delete/rename | **Still required.** Implement pragmatic referential integrity: deleting a school → blocked with message if siswa assigned ("pindahkan siswa dulu") OR bulk-reassign picker; deleting a trainer → removed from `sekolah.trainerIds`, historical absensi untouched (ID-based); renames update display caches (`siswa.sekolahNama`) in the same save. |
| 5 | High | One absensi per school per day (`${date}_${schoolId}` overwrites) | **Fixed by design**: key becomes `${date}_${schoolId}_${trainerId}` + trainer picker in the form (D2). |
| 6 | Medium | Hardcoded Jul–Des 2026; out-of-range dates silently map to Juli | **Fixed per D4**: generated academic-year model, `"YYYY-MM"` keys. |
| 7 | Medium | Payment overwrite, no history, no rollback on failed write | **Fixed per D3**: additive `honorPayments[]` with per-payment delete (that IS the rollback/correction path). localStorage-only writes don't have Firestore failure modes; stale `selectedItem` hazard disappears because payments aren't stored on the trainer object. |
| 8 | Medium | `seedDefaultData` duplicates on re-run | **Deleted per D6** (dead code today; fresh start makes it permanently unnecessary). |
| 9 | Low | Honor rate 0 with counted sessions when name-match fails | **Fixed by design** (ID joins). |
| 10 | Low | Absensi sheet fuzzy-matches students by school name | **Fixed by design**: `siswa.sekolahId === absensiSchoolId` only; the `OR name` branch is deleted. |

### Additional Gaps (v1 gaps A–E, re-scored for local-first)

| # | Sev | Gap | v2 fate |
|---|-----|-----|---------|
| A | **High** | Absensi tab is write-only — no way to view/audit/correct past records; blind re-submit silently overwrites | **BUILD: "Riwayat Absensi" view.** List records filtered by school + periode; "load into form to correct" re-opens the entry form pre-filled (radio `defaultChecked` from record) targeting the same doc ID. This is the correction path that makes cash-basis honor trustworthy. |
| B | ~~High~~ → Deferred | Zero security boundary (public Firestore, anonymous auth, child PII) | **Deferred to Hostinger phase (D5):** Phase 1 is local-only — the exposure disappears with Firebase. Reintroduce as: login + server-side auth when the backend lands. Document to client that localStorage data is per-browser: different PC/browser = empty dashboard → mitigated by Gap D backup file. |
| C | Medium | No input validation (WA free-text breaks `wa.me`, negative SPP/honor, overpayment shown as negative debt) | **BUILD (cheap):** digits-only WA normalization to `62…` prefix on save; `min={0}` on all money inputs; payment modal warns if nominal > remaining, and the R4 "Lunaskan" checkmark makes exact-settle the default path anyway. |
| D | **High** | No full backup/restore; CSVs are per-entity and not re-importable | **BUILD (hard requirement per D8).** Settings modal gains: "Backup JSON" (all 6 stores in one file, version field: `{ version: 2, exportedAt, data: {...} }`) and "Restore" (file picker → validate shape → confirm overwrite). ~40 lines. This is both the safety net and the future cloud-import format. |
| E | Low | Hard delete, no undo | **SKIP for now.** Delete-confirm modals + Gap D backups are adequate at this scale. Revisit if client reports accidents. |

### Additional findings merged in (not present in v1)

| # | Sev | Finding | Fate |
|---|-----|---------|------|
| F1 | High | **The file cannot compile standalone** — undeclared globals + no bundler/Tailwind config/`package.json` in repo | Resolve per Part 4 (deployment scaffold decision). |
| F2 | Medium | `handleSaveTrainer` rebuilds the trainer object and only preserves `honorDibayarBulan` via possibly-stale `selectedItem` — pattern risk: forms overwriting fields they don't render | Resolved by D3 (payments leave the trainer object) + the executor rule in Part 1. |
| F3 | Medium | Default demo data (fake schools/students/money) is auto-loaded for every first-run user | Neutralized by D6 (fresh start, empty initial state; `seedDefaultData` deleted). |
| F4 | Low | `loading` state is write-only (only set by the dead seed function) | Deleted with the seed function. |
| F5 | Low | `dev-setup` branch committed `node_modules/` (200k+ lines) to git history; Express skeleton contradicts likely Hostinger PHP/MySQL target | Add `.gitignore` (node_modules, dist, .env) on main before any scaffold work; decide dev-setup's fate at the Hostinger phase — likely keep `frontend/` Vite skeleton, rewrite backend to match host (PHP or confirm Node availability). Do NOT merge dev-setup as-is. |

---

## Part 3 — Refinements R3–R6 (updated) + Suggestions

### R3. Graph Overview

Pure SVG/CSS charts (no new dependency — keeps the file self-contained):

1. Monthly trend bar chart across the selected academic year (Jul→Jun): Pemasukan SPP vs Honor Dibayar (cash pair — matches D1) vs Beban Honor (memo) per month — one pass over existing data, `financialData` logic parameterized by `"YYYY-MM"`.
2. Donut chart: SPP collection rate (lunas vs belum) with center total, for selected year+month.
3. Keep existing per-school horizontal bars; add cash-position summary line.

### R4. Payment: "Lunaskan" settle-checkmark + history

- **"Lunaskan" checkmark button** per trainer row → confirm dialog showing the math ("Bayar sisa Rp X kepada Y untuk {bulan} {tahun}?") → appends `{ trainerId, periode, nominal: sisaHonor, tanggalBayar: today }` to `honorPayments`. Sisa = 0.
- Manual-input modal stays for partial payments (same append, custom nominal). Each payment row is individually deletable (correction path).
- Per-trainer expandable payment history in the Pembayaran tab (trainer's rows for the selected year).

### R5. Navbar → Sidebar

- Desktop: fixed left sidebar `w-64` (logo+title top, **Year + Month selectors (D4)**, nav items incl. new "Riwayat Absensi" (Gap A), backup/restore shortcut bottom); content in `md:ml-64`; header reduced to slim top bar.
- Mobile: sidebar collapses to hamburger drawer.
- Routing stays state-based — pure JSX/className restructure, no logic change.

### R6. Finance/Overview aggregation — **revised for cash basis (D1)**

Display order (4+3 grid) with explicit basis labels:

- **Cash (these define Laba/Rugi):** Pemasukan SPP (lunas, cash in) → Honor Dibayar (cash out) → **Laba/Rugi = Pemasukan − Dibayar**.
- **Memo / position (clearly labeled "belum teralisasi"):** Potensi SPP Total (Σ siswa×SPP) → SPP Belum Tertagih (Potensi − Pemasukan) → Beban Honor (accrual, sesi×tarif) → Sisa Kewajiban Honor (Beban − Dibayar).

This directly answers the client's D1 confusion: unpaid honor is visible as kewajiban but never inflates/deflates profit.

### Additional suggestions (client-facing polish, ordered by value ÷ effort)

1. **Tunggakan (arrears) view + WA click-to-chat templates** — list siswa with ≥1 unpaid month in the selected period ("belong together": siswa tab filter checkbox "Hanya yang menunggak" qualifies), each row with a `wa.me/{wa}?text={template}` button ("Tagihan SPP bulan {bulan} untuk Ananda {nama}: Rp {spp}"). Data already exists; highest operator value per line of code in this plan.
2. **Persist UI state** — `activeTab`, `selectedYear`, `selectedMonth`, sidebar state in localStorage (survives refresh).
3. **Rupiah-formatted inputs** — display `150.000`, store `150000`.
4. **Print-friendly Keuangan report** — `window.print()` + print CSS.
5. **CSV exports updated to the new model** — year+month in filenames, `trainerId`-keyed stats (dead issue #1), absensi filtered by `periode` key (not date-string prefix — the two filters can no longer disagree).

---

## Part 4 — Architecture Direction (from D5 + D7 + D8)

- **Phase 1 (this plan's implementation target):** local-first single-page app. localStorage is the only datastore (`afterschola_v4_*` keys — bump from `v3` since the schema changes; no migration, fresh start). **Firebase imports/init/`onSnapshot`/`signInAnonymously` and every `if (!firebaseEnabled || uid === 'local-admin')` branch are deleted** (~300 lines of dual-write code disappear). CSV export per entity retained; JSON backup/restore added (Gap D).
- **Runnable form:** the file currently only runs in Gemini Canvas (F1). Lowest-friction Phase-1 packaging: keep it single-file and Canvas-runnable for now; scaffold a Vite+Tailwind+`package.json` wrapper (reusing `dev-setup`'s `frontend/` skeleton) only when the client wants to run it outside Canvas or pre-Hostinger. **This choice gatekeeps any file split (`components/`)** — v1 suggestion 5 stands: split only when leaving Canvas.
- **Phase 2 (later, separate plan):** Hostinger deployment with login. PHP+MySQL is the default assumption for Hostinger shared hosting — confirm Node availability before reusing the Express skeleton. The Phase-1 JSON backup format is the import path (D8). Auth, server-side validation, and per-user access control (v1 Gap B) all land here.

---

## Execution Sequencing

- **Phase 1A — Foundation & data model:** delete Firebase + seed + dead code (issue #8, F4); Part 1 schema; D4 academic-year engine (Year+Month selectors, `"YYYY-MM"` keys everywhere); ID-based joins; issue #5 absensi key + trainer picker; issue #4 delete/rename referential integrity.
- **Phase 1B — Money correctness:** D3 `honorPayments[]`; R4 settle-checkmark; D1 cash-basis finance with memo rows (R6); Gap C validation; CSV updates (suggestion 5).
- **Phase 1C — Workflow & safety:** Gap A Riwayat Absensi (incl. load-to-correct); Gap D JSON backup/restore; tunggakan view + WA templates (suggestion 1); persisted UI state (suggestion 2).
- **Phase 1D — Presentation:** R5 sidebar; R3 graphs; suggestions 3–4. Numbers are known-correct before they get charted.
- **Deferred (explicitly NOT in this plan):** login/auth (D5), Hostinger backend (D5/D8), backend tech decision, dev-setup merge decision, soft-delete (E).

**Validation per change (executor protocol):** the narrowest falsifiable check immediately after each edit, in the running app:

| Change | Check |
|--------|-------|
| Trainer↔school ID arrays | Assign one trainer to two schools → both schools' honor rows show correct rates; rename trainer → historical attendance honor unchanged |
| Absensi key #5 | Record two sessions, same school, same day, different trainers → both persist; neither overwrites |
| D3 payments + R4 | Partial pay 50k → Lunaskan → Sisa = 0 and `honorPayments` holds exactly 2 entries; delete one entry → Sisa restores |
| D1 basis | Trainer with 2 sessions unpaid → Laba/Rugi unaffected; Beban/Sisa visible as memo |
| Gap A | Submit absensi → appears in Riwayat → "load to correct" → change a status → resubmit → single record, updated |
| Gap D | Backup → wipe localStorage → restore → all tabs identical |
| D4 | Switch year to 2027/2028, month Januari → all tabs/exports show empty-but-correct; no Juli fallback |

---

## Resolved / Retired v1 Open Decisions

All v1 uncertainties resolved: Q1→D1 (cash), Q2→D2 (many-to-many, fixed per school), Q3→D3 (approved), Q4→D4 (academic year + dual dropdown), Q5→Part 4 (local-first now; Canvas until scaffold is needed), Q6→single operator assumed; multi-operator lands with the Hostinger phase, Q7→D6 (no real data), Q8→D7 (local), Q9→D9 (hundreds; year-keyed maps mandatory).
