# Afterschola Admin Dashboard — Implementation Plan

**This document is the working roadmap.** It consolidates and supersedes `PLANNING.md`, which remains in the repo as the audit/decision record. If the two disagree, this file wins.

**Workload is divided into 5 assignable tracks (Person 1–5).** See Part 5 for assignments and file ownership.

---

## Part 1 — Product Snapshot & Locked Decisions

Single-page React app for managing an after-school program business: partner schools, students, trainers, daily attendance, trainer honor payments, and monthly finance. UI in Bahasa Indonesia. Currently one 2,174-line Canvas export (`Projects.tsx`) with no build tooling.

| #   | Decision         | Locked resolution                                                                                                                                                                                                                                                                                                                                                |
| --- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Accounting basis | **Cash basis.** Laba/Rugi = SPP lunas (cash in) − Honor Dibayar (cash out). Accrual figures (Beban Honor, Sisa Kewajiban) displayed as clearly-labeled _memo_ rows, never mixed into profit.                                                                                                                                                                     |
| D2  | Trainer ↔ School | Many-to-many, both directions, **by ID**: `sekolah.trainerIds[]` (fixed set per school), `trainer.sekolahIds[]` (flexible). Attendance form picks the session's trainer from the school's fixed list.                                                                                                                                                            |
| D3  | Payment storage  | Append-only ledger `honorPayments[]: { id, trainerId, periode, nominal, tanggalBayar }`. Per-period "Dibayar" is a derived sum. No `honorDibayarBulan` on trainer objects.                                                                                                                                                                                       |
| D4  | Period model     | **Academic year**: Jul→Jun. UI = two dropdowns (Year `2026/2027`, Month name). Internal keys: `"YYYY-MM"`. Year label `${A}/${A+1}` where calendar year = `monthNum >= 7 ? A : A+1` (Juli–Desember → A; Januari–Juni → A+1). Periode key derived from any date by `tanggal.slice(0, 7)` — no month-name parsing anywhere; `monthToNum`/`numToMonth` are deleted. |
| D5  | Deployment       | Hostinger later, **with login later**. No auth work now. Note: Hostinger shared hosting is typically PHP/MySQL — backend tech is a Phase-2 decision, do not assume Node.                                                                                                                                                                                         |
| D6  | Data             | **Fresh start.** No migration code. `seedDefaultData` deleted (it is dead code today — defined, never wired). Initial state = empty arrays.                                                                                                                                                                                                                      |
| D7  | Storage now      | **LocalStorage only.** All Firebase code (init, auth, `onSnapshot`, every `firebaseEnabled`/`local-admin` branch, the sync badge) is deleted (~300 lines). Keys bump `afterschola_v3_*` → `afterschola_v4_*`.                                                                                                                                                    |
| D8  | Storage later    | Cloud eventually. The Phase-1 JSON backup format **is** the future import format — backup/restore is a hard requirement, not optional.                                                                                                                                                                                                                           |
| D9  | Scale            | Hundreds of students. Monthly maps must be year-keyed (`"YYYY-MM"`). No virtualization needed.                                                                                                                                                                                                                                                                   |

---

## Part 2 — Target Data Model (the contract every track writes against)

IDs: `` `${prefix}-${Date.now()}` ``. **Names are display-only. All joins by ID. `normalizeKey` is deleted everywhere.**

```js
sekolah:  { id, nama, alamat, foto, jadwal, spp, trainerIds: string[] }
trainer:  { id, nama, wa, jadwal, sekolahIds: string[], honor }
siswa:    { id, nama, wa, kelas, sekolahId, sekolahNama /* display cache */, foto,
            sppLunas: { "2026-07": true /* SPARSE — see conventions */ } }
absensi:  { id: `${tanggal}_${sekolahId}_${trainerId}`,
            tanggal,                       // "YYYY-MM-DD"
            periode,                       // "YYYY-MM" = tanggal.slice(0,7)
            sekolahId, trainerId,
            trainerNama /* display cache */,
            trainerStatus: 'Hadir'|'Izin'|'Alpa',
            siswaList: [{ siswaId, nama, status }] }
honorPayments: [{ id, trainerId, periode, nominal, tanggalBayar }]
settings: { logoUrl, title }
```

**Removed fields:** `sekolah.trainer` (string), `trainer.sekolah` (string), `trainer.honorDibayarBulan`. Names shown in UI derive from ID joins.

### Executor conventions (binding rules)

1. **A form may only write the fields it renders.** Trainer form never touches payments; siswa form owns `sppLunas`; payment modal is the only writer of `honorPayments`; school form owns `trainerIds`, trainer form owns `sekolahIds` — each save re-derives the inverse array on the other entity **in the same write**.
2. **Sparse monthly maps.** Store only paid months in `sppLunas`; missing key = unpaid. Year rollover requires zero writes; new students start paid for nothing.
3. **Ledger principle.** Money aggregates derive from `honorPayments` + `absensi` records, never from current entity state. Deleting a trainer/school must NOT rewrite financial history — records keep cached display names and continue aggregating.
4. **Deletion semantics.** School with assigned siswa → delete blocked, offer bulk-reassign picker. Trainer delete → removed from both ID arrays; absensi/payments retained and still counted. School rename → refresh `siswa.sekolahNama` caches in the same save.
5. **Copy cleanup.** All "disinkronkan ke server/cloud" strings are reworded — they become lies once Firebase is removed.
6. **Design preservation (binding).** All existing JSX className strings, colors, and visual patterns are carried over verbatim during the M0 split and all subsequent milestones. Moving markup between files is a cut-paste, never a restyle. New UI must be composed from the existing design system, below — no new colors, fonts, or card/table/modal idioms without client approval.

---

## Part 3 — Milestones (roadmap; each has an entry and exit gate)

### M0 — Scaffold & Split _(Person 1 only — gate for everyone)_

The repo currently cannot compile. This milestone creates the runnable base **and** splits the monolith — the split is what makes 5 parallel workers possible instead of 5 people merging one file.

- Minimal Vite + React + Tailwind scaffold. `Projects.tsx` contains zero TypeScript syntax — it drops in as plain `.jsx` unchanged.
- `.gitignore`: `node_modules/`, `dist/`, `.env` (the `dev-setup` branch committed `node_modules/` to history; never again).
- Split into modules per the **file map in Part 5**. Person 1 publishes two frozen contracts before M1: the `store.js` API and the `PeriodContext` (selected year/month + key helpers per D4). Other tracks code against these signatures.
- Delete while moving: all Firebase code, `seedDefaultData`, `loading` state, sync badge, `normalizeKey` call sites leave their bodies behind only where a contract stub replaces them.
- **Exit gate:** app boots locally; existing 7 tabs render; CRUD + absensi + payment roundtrip to `afterschola_v4_*` localStorage; no console errors; `git status` clean of node_modules.

**No other work starts until M0 passes.**

### M1 — Data Model & Academic Year _(Persons 2 + 5 lead; 1 supports)_

- Person 1: academic-year engine in `constants.js` (year label generation, month list Jul→Jun, `calYear(monthNum)`, `periodeFromDate`, default "today's period").
- Person 2: all entity CRUD rewritten to the Part 2 schema — ID arrays both directions with inverse-array maintenance, sparse `sppLunas` checkbox set (rendered from the selected academic year's 12 months), deletion semantics + rename cache refresh, legacy field removal, copy cleanup.
- Person 5: Year + Month dropdowns in the shell, wired to `PeriodContext`.
- Person 2 also owns **input validation**: WA digits-only normalized to `62…` on save; `min={0}` on all money inputs.
- **Exit gate (run in the app):**
  - Assign one trainer to two schools via each direction (edit school; edit trainer) → both entities' arrays consistent after every save.
  - Rename trainer → historical absensi honor unchanged. Delete trainer → arrays clean, payment/absensi records retained.
  - Delete school that has siswa → blocked with reassign path; orphan school (no siswa) → deletes cleanly.
  - New siswa unpaid for all months with zero map entries (sparse check).
  - Switch to Year `2027/2028`, Month Januari → every tab shows empty-but-correct; no Juli fallback; CSV filename reads `..._2028-01.csv`.

### M2 — Money Correctness _(Person 3 leads; Person 4 joins for exports)_

- Absensi entry: session trainer picker (choices = school's `trainerIds`); record key `${tanggal}_${sekolahId}_${trainerId}` — two sessions same school/day/different trainers both persist.
- `honorPayments` ledger: payment modal appends entries; per-trainer expandable payment history on the Pembayaran tab; every entry individually deletable (that is the correction path).
- **"Lunaskan" settle button** per trainer row: confirm dialog shows the math ("Bayar sisa Rp X kepada Y untuk {bulan} {tahun}?") → appends exactly `sisa = beban − dibayar`. Overpay warning when manual nominal > remaining.
- Finance engine (`finance.js`) on cash basis (D1): `labaRugi = Σ SPP lunas(periode) − Σ honorPayments(periode)`. Memo block: Potensi SPP, SPP Belum Tertagih = Potensi − Pemasukan, Beban Honor = Σ sessions × honor (from absensi), Sisa Kewajiban = Beban − Dibayar. Display order on Overview/Keuangan: `Potensi → Pemasukan → Belum Tertagih → Beban → Dibayar → Sisa Kewajiban → Laba/Rugi`, with cash rows visually distinct from memo rows.
- **Riwayat Absensi** (new nav item): list of attendance records filtered by school + period; **"load into form to correct"** re-opens the entry form pre-filled targeting the same record ID — this closes today's silent-overwrite hazard.
- Person 4: CSV pack — all 6 exports regenerated from the new model: year+month keys in filenames, stats keyed by `trainerId` (kills the old raw-name/`normalizeKey` mismatch), absensi export filters by the `periode` field (not date-string prefix — the two filters can no longer disagree).
- **Exit gate:**
  - Partial pay 50k → Lunaskan → Sisa = 0 and ledger holds exactly 2 entries → delete one entry → Sisa restores.
  - Trainer with 2 unpaid sessions → Laba/Rugi unaffected, Beban/Sisa visible only in memo rows.
  - Two same-day sessions recorded → both in Riwayat → correct one → single updated record, honor recomputed.
  - Pay honor → delete that trainer → Keuangan totals unchanged (ledger principle).

### M3 — Safety & Operator Value _(Person 4 leads)_

- **JSON backup/restore** in Settings modal: Backup = one file `{ version: 2, exportedAt, data: { sekolah, trainer, siswa, absensi, honorPayments, settings } }`; Restore = file picker → shape validation → confirm overwrite. This is the D8 cloud-import format.
- **Tunggakan view**: siswa-tab filter "Hanya yang menunggak" = unpaid in any elapsed month of the selected academic year up to the selected month; each row gets a `wa.me/{wa}?text={template}` button ("Tagihan SPP bulan {bulan} untuk Ananda {nama}: Rp {spp}").
- Rupiah-formatted number inputs (display `150.000`, store `150000`).
- Print-friendly Keuangan report (`window.print()` + print CSS).
- **Exit gate:** Backup → wipe localStorage → Restore → all tabs byte-identical. Tunggakan list matches manual spot-check of 5 students. WA link opens with prefilled rupiah amount.

### M4 — Presentation _(Person 5 leads; everyone fixes their own track's integration bugs)_

- Sidebar (desktop fixed `w-64`: logo+title, Year/Month selectors, 8 nav items, backup shortcut; mobile: hamburger drawer). State-based routing unchanged.
- Overview graphs, pure SVG/CSS, no new dependencies: (1) monthly trend bars across the academic year — Pemasukan vs Dibayar (cash pair) vs Beban (memo style); (2) donut for SPP collection rate; (3) keep per-school bars + cash-position line.
- Persisted UI state: `activeTab`, selected year/month, sidebar state in localStorage.
- Empty-state polish everywhere ("Belum ada siswa…" rather than blank tables).
- **Exit gate:** full regression of every gate row from M0–M3 plus the complete validation table (Part 6). Numbers charted are numbers already proven.

---

## Part 4 — Retired Issue Registry (what each old problem became)

| Old issue (PLANNING.md)                                                | Disposition                                                                                                |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| CSV raw-name vs `normalizeKey` mismatch                                | Deleted with `normalizeKey`; all keys are `trainerId`.                                                     |
| Absensi trainer name snapshot fragile                                  | Absensi stores `trainerId` + display cache.                                                                |
| Mixed accrual/cash Laba-Rugi                                           | Cash-basis profit + labeled memo rows (D1).                                                                |
| No cascade/rename handling                                             | Part 2 convention rule 4.                                                                                  |
| One absensi per school per day                                         | Key `${tanggal}_${sekolahId}_${trainerId}` + picker (D2).                                                  |
| Hardcoded Jul–Des 2026, silent Juli fallback                           | Academic-year engine (D4).                                                                                 |
| Payment overwrite, no history/rollback                                 | Ledger + per-entry delete (D3).                                                                            |
| Seed duplicates on re-run                                              | Function deleted (D6).                                                                                     |
| Honor rate 0 via name-match                                            | ID joins — impossible state.                                                                               |
| Absensi fuzzy student match                                            | `sekolahId` equality only.                                                                                 |
| Absensi write-only, silent overwrite                                   | Riwayat + load-to-correct (M2).                                                                            |
| Public Firestore, anonymous auth, child PII                            | Deferred to Hostinger phase (login). LocalStorage note: data is per-browser — mitigated by backup/restore. |
| No input validation                                                    | M1 (WA normalize, `min=0`) + M2 (overpay warn).                                                            |
| No backup/restore                                                      | M3.                                                                                                        |
| Hard delete, no undo                                                   | Skipped: confirm dialogs + backups suffice at this scale.                                                  |
| File can't compile standalone                                          | M0 scaffold.                                                                                               |
| Forms overwriting unrendered fields                                    | Part 2 convention rule 1.                                                                                  |
| Demo data auto-loaded on first run                                     | Empty initial state (D6).                                                                                  |
| Dead `loading` state                                                   | Deleted in M0.                                                                                             |
| `node_modules` in git history; Express vs Hostinger PHP/MySQL mismatch | `.gitignore` in M0; defer `dev-setup` merge decision; backend tech decided at backend phase.               |

---

## Part 5 — The 5-Person Split

### File ownership map (created in M0 by Person 1)

```
src/
  main.jsx, App.jsx              — shell, tab registry, modal root      → Person 5
  lib/constants.js               — months, academic-year engine, ids    → Person 1
  lib/store.js                   — v4 localStorage CRUD + PeriodContext → Person 1
  lib/format.js                  — formatRupiah, WA normalize           → Person 1
  lib/finance.js                 — attendanceStats, financialData       → Person 3
  features/schools/  students/  trainers/   (lists + forms)             → Person 2
  features/attendance/           (entry form + Riwayat)                 → Person 3
  features/payments/             (table, modal, history, Lunaskan)      → Person 3
  features/reports/              (keuangan view + print, exports UI)    → Person 4
  lib/csv.js, lib/backup.js                                             → Person 4
  features/overview/             (cards, graphs)                        → Person 5
  components/                    (confirm/alert/toast primitives)       → Person 1 builds, everyone consumes
```

**Rule: you may only edit files you own.** Cross-track needs go through the contracts (`store.js`, `PeriodContext`, `finance.js` function signatures) or through Person 1 as integrator. `App.jsx` exposes a single tab-registry block so each track registers its screen without touching each other's code.

### Assignment table

| Person | Track                | Owns                                                                              | Milestones         |
| ------ | -------------------- | --------------------------------------------------------------------------------- | ------------------ | -------------------------------------------------- | ------------------------------------- |
| **1**  | Platform & Contracts | Scaffold, split, `lib/constants                                                   | store              | format`, primitive components, integration reviews | M0 solo → M1 engine → float/integrate |
| **2**  | Entities & Integrity | schools/students/trainers CRUD, schema, validation, deletion rules                | M1                 |
| **3**  | Money & Attendance   | absensi entry + Riwayat, payments ledger + Lunaskan, `finance.js`                 | M2                 |
| **4**  | Reporting & Safety   | CSV pack, backup/restore, tunggakan + WA, rupiah inputs, print                    | M2 (CSV), M3       |
| **5**  | Shell & Presentation | App shell, sidebar, period dropdowns, overview graphs, persisted UI, empty states | M1 (dropdowns), M4 |

**Sequencing constraints (read before starting):**

1. M0 alone → gate → then 1 freezes `store.js` + `PeriodContext` signatures.
2. Person 2 defines entity **factory functions** (`newSekolah()`, `newSiswa()`…) codifying Part 2; Persons 3–4 consume them — never hand-assemble records outside factories.
3. Person 3 may stub against factories before M1 exits, but M2 gate requires real M1 data.
4. Person 4's backup/restore can start right after M0 (operates on raw stores); CSV items wait for M1/M2 data shapes.
5. Person 5 works on shell/overview from M1 onward; sidebar nav includes Riwayat only when M2 ships it — register the placeholder early with a guard.

---

### Existing design system (what "preserve the styling" concretely means)

| Element         | Pattern (as it exists in `Projects.tsx`)                                                                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Brand palette   | Blue `blue-900` header / `blue-950` footer, **yellow `yellow-400`/300 accent**, slate-50 background, slate-800 text. Success `emerald`, danger `rose`, info `blue`.                               |
| Cards/tables    | `rounded-2xl shadow-sm border border-slate-100` white cards; `rounded-xl` inner panels; tables use `bg-slate-50` header rows with `[11px] font-extrabold uppercase tracking-wider text-slate-400` |
| Buttons         | `rounded-xl` (primary `bg-blue-600`, export `bg-emerald-600`, danger `bg-rose-600`, accent `bg-yellow-400 text-slate-900`)                                                                        |
| Modals          | `fixed inset-0 bg-slate-900/60 backdrop-blur-sm` overlay → `rounded-2xl shadow-2xl animate-scaleIn` white card, `bg-blue-900` header bar with `text-yellow-300` title                             |
| Feedback        | `showToast` top-right pill; border-t-4 `yellow-400` confirm dialog / `emerald-500` alert dialog                                                                                                   |
| Typography/logo | `font-sans`; graduation-cap SVG in `rounded-full` yellow-bordered circle; sync badge becomes the persisted-storage indicator (restyled, not deleted — see M1)                                     |

New additions (Riwayat Absensi rows, tunggakan filter chips, lunaskan checkmark, sidebar, graph cards) must reuse these exact idioms — e.g., Lunaskan uses the emerald success style, Riwayat uses the standard table pattern, graphs live in standard white cards.

---

## Part 6 — Executor Operating Rules (hard rules; violation = stop and correct before continuing)

**R1. One concern per edit.** A single change touches exactly one of: behavior, styling, data shape, or file location. Never restyle while fixing logic; never reshape data while splitting files. If you notice a second problem mid-edit, write it down and finish the current edit first.

**R2. Contract or nothing.** All data access goes through `store.js` (`read`, `write`, `upsert`) and `PeriodContext` (`selectedYear`, `selectedMonth`, `periodeKey()`, `periodeFromDate()`). Direct `localStorage` reads/writes or ad-hoc date-string parsing outside `lib/` are defects. If a needed operation doesn't exist, add it to the contract — don't work around it.

**R3. Factories only.** Records are created exclusively by the Part 2 factory functions (`newSekolah()`, `newSiswa()`, …). Never hand-assemble an object literal and push it into a store. The factory sets SPARSE maps, IDs, and caches — bypassing it is how the old schema sneaks back.

**R4. Ledger trust.** Payment and attendance aggregates derive from `honorPayments` + `absensi` — never from current entity state. UI never computes "expected honor" by multiplying sessions by a rate at read time _except_ inside `finance.js` where it's defined once.

**R5. Style-frozen.** className strings move verbatim; new UI reuses the Part-5 design table idioms. If you need a new visual element, copy the nearest existing one (e.g., Lunaskan = emerald success button) and change only the label/handler.

**R6. Checkpoint discipline.** After every edit: run the narrowest pass/fail check available (the app loads without console errors + the single behavior you just changed). Do not stack a second edit until the first checks out. A GREEN edit followed by a RED one isolates the break.

**R7. Ownership boundaries.** Only your Part-5 files. Cross-track changes go through a contract (R2/R3) or through Person 1. Touching another track's file is a defect, even to "just fix a small thing."

**R8. Schema = Part 2, verbatim.** No new fields, no renamed fields, no extra nesting beyond the contract. If the schema is wrong for your task, raise it — don't silently extend it.

### Foolproof task-breakdown technique (how each milestone gets subdivided)

Every milestone is implemented as a chain of **microtasks**, each shaped exactly like this:

```
MICROTASK: <one verb + one noun>
  EDIT:    <file(s) you own>
  RULES:   <R-codes that apply>
  VERIFY:  app boots, zero console errors, AND <one observable behavior: click X → see Y>
  DONE-IF: verify passes; nothing else changed (git diff shows only intended lines)
```

A microtask is complete only when VERIFY passes. If VERIFY fails, the fix is the **next microtask's own EDIT** — never "I'll just tweak this other place too."

### Trap list (observed in the original code — a weak executor will reintroduce these)

- ❌ Hand-assembling an `sppLunas` literal of 6 month-name keys → use factories + sparse maps ("YYYY-MM").
- ❌ `monthToNum` / month-name string parsing → `periodeFromDate()` only; months are labels.
- ❌ Writing payments as fields on the trainer object → `honorPayments` ledger only.
- ❌ `normalizeKey` / name comparison to join records → join by `id`; names are display caches.
- ❌ Logic in render (`(t) => ...monthlyCount[t.nama]... * t.honor` inline) → compute in `finance.js`, render the number.
- ❌ A "quick visual fix" without the design table → R5.
- ❌ localStorage key drift (`afterschola_v3_*`) → only `afterschola_v4_*` via `store.js`.
- ❌ Reintroducing `seedDefaultData`, `loading`, sync badge, or Firebase imports "temporarily" → deleted means deleted.

---

## Part 7 — Master Validation Table (final acceptance, run top-to-bottom)

| #   | Check             | Pass condition                                                                                                                                                                                                                    |
| --- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Boot              | App starts; zero console errors; only `afterschola_v4_*` keys touched                                                                                                                                                             |
| 2   | Roundtrip         | Add school + trainer + siswa → refresh → all persist                                                                                                                                                                              |
| 3   | Inverse arrays    | Trainer↔school assignment from both directions stays consistent; delete propagates correctly                                                                                                                                      |
| 4   | Rename integrity  | Rename trainer → old absensi honor unchanged, UI shows new name                                                                                                                                                                   |
| 5   | Same-day sessions | Two sessions, one school, one day, two trainers → both persist in Riwayat                                                                                                                                                         |
| 6   | Load-to-correct   | Resubmit corrected absensi → one updated record, honor recomputed                                                                                                                                                                 |
| 7   | Ledger            | Partial → Lunaskan → delete entry → Sisa restores; entries listed in history                                                                                                                                                      |
| 8   | Basis             | Unpaid sessions move memo rows only, never Laba/Rugi                                                                                                                                                                              |
| 9   | Ledger principle  | Delete trainer after payments → Keuangan totals unchanged                                                                                                                                                                         |
| 10  | Sparse maps       | New siswa unpaid everywhere with zero `sppLunas` entries                                                                                                                                                                          |
| 11  | Year boundary     | 2027/2028 + Januari → empty-but-correct; date `2028-01-10` → periode `2028-01`; never Juli fallback                                                                                                                               |
| 12  | Backup            | Export → wipe → restore → identical; corrupt file → refusal with message                                                                                                                                                          |
| 13  | Tunggakan         | List matches spot-check; WA link prefilled correctly                                                                                                                                                                              |
| 14  | Exports           | 6 CSVs open in Excel; filenames carry year+month keys; honor figures match UI                                                                                                                                                     |
| 15  | Persisted UI      | Refresh mid-tab → same tab/period/sidebar state                                                                                                                                                                                   |
| 16  | Regression        | Every M0–M3 gate row still green                                                                                                                                                                                                  |
| 17  | **Visual parity** | Side-by-side screenshot pass against the original Canvas render for Overview/Sekolah/Siswa/Trainer/Absensi/Pembayaran/Keuangan: same palette, spacing, radius, typography. Any diff beyond new features is a defect, not a choice |

---

---

## Part 8 — Ready-Made Microtask Chains (hand these verbatim to each track)

Facade of the workload: each milestone decomposes into a **strictly-ordered chain of microtasks** conforming to Part 6. The sequence _is_ the contract — do not start microtask N+1 until N's VERIFY passes. (Person assignments in parentheses refer to Part 5.)

**M0 – Person 1**

- M0.1 `EDIT: root` create Vite+React+Tailwind scaffold + `.gitignore` (node_modules, dist, .env) → VERIFY: `npm run dev` serves blank page. ✅✅✅
- M0.2 `EDIT: lib/constants.js` hard-code months Jul→Jun + id factory → VERIFY: import works in App.
- M0.3 `EDIT: lib/store.js` v4 CRUD (read/write/upsert) → VERIFY: write→refresh→read back a dummy.
- M0.4 `EDIT: lib/format.js` formatRupiah, waNormalize → VERIFY: `waNormalize("0812 3") === "628123"`.
- M0.5 `EDIT: App.jsx` render one white card with copy from original → VERIFY: looks correct (start of design-parity habit).
- M0.6 `EDIT: features/schools` cut-paste school list markup only, read from store → VERIFY: renders empty state.
- M0.7 `EDIT: remaining features one at a time` repeat cut-paste per tab → VERIFY: each tab renders.
- → M0 exit gate (Part 3).

**M1 – Persons 2 & 5**

- M1.1 (P1) `EDIT: lib/store.js + constants` academic-year engine (`calYear`, `periodeFromDate`, defaults) → VERIFY: month=Januari year=2026/2027 → `periodeFromDate("2027-01-10") === "2027-01"`.
- M1.2 (P2) `EDIT: features/schools` trainers multi-select + inverse-array maintenance → VERIFY: assign trainer via school form → trainer.sekolahIds updates.
- M1.3 (P2) `EDIT: features/students` siswa CRUD on sparse sppLunas → VERIFY: new siswa, zero spp entries, shows Belum Bayar.
- M1.4 (P2) `EDIT: features/trainers` trainer CRUD, no payment fields → VERIFY: rule-1 compliance (form writes only rendered fields).
- M1.5 (P2) `EDIT: same files` WA normalize + `min={0}` + delete semantics → VERIFY: block school-with-siswa delete.
- M1.6 (P5) `EDIT: App.jsx` year+month dropdowns wired to PeriodContext → VERIFY: switching persists after refresh.

**M2 – Persons 3 & 4** (each VERIFY here is a named Part-7 row)

- M2.1 (P3) absensi entry + trainer picker + composite key → row #5.
- M2.2 (P3) Riwayat list + load-to-correct → row #6.
- M2.3 (P3) honorPayments ledger + history + Lunaskan → row #7.
- M2.4 (P3) finance.js cash basis + memo → row #8.
- M2.5 (P3/pairs P2) delete-trainer → ledger intact → row #9.
- M2.6 (P4) six CSV exports from new model → row #14.

**M3 – Person 4**

- M3.1 backup.js export → shape-validates → roundtrips (row #12).
- M3.2 tunggakan filter + WA template (row #13).
- M3.3 rupiah inputs (display-only formatting, store raw).
- M3.4 print CSS + window.print.

**M4 – Person 5**

- M4.1 sidebar shell + tab registry → all tabs reachable.
- M4.2 overview graphs (pure SVG) on proven finance data.
- M4.3 persisted UI state (row #15).
- M4.4 empty-state polish → then row #16/#17 full regression + visual parity pass.

Total: ~28 microtasks, each independently falsifiable. If the implementer is one model instead of five people, the ownership columns just become work-session boundaries (finish Person-1 M0 chain, then pick up the next chain).

---

## Part 9 — Deferred (explicitly out of scope here)

Login/auth & access control (arrives with Hostinger) · backend tech choice (PHP/MySQL vs Node — confirm Hostinger plan first) · `dev-setup` merge decision · soft-delete/trash · multi-operator concurrency. The M3 backup format is the bridge to all of these.
