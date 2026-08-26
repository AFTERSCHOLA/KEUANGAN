# Afterschola Admin Dashboard — Bug-Fix & Refinement Plan

**Scope:** Single-file React app `D:\Games and Apps\Coding\AdminDashboard\Projects.tsx` (2,174 lines, Gemini Canvas export).
**Status of codebase:** Structurally complete (balanced braces/parens/brackets, clean component termination). No `package.json`, build tooling, or Firebase config files — the file depends on Canvas-injected globals (`__firebase_config`, `__app_id`, `__initial_auth_token`) and assumes Tailwind CSS is loaded. Data layer: Firestore with localStorage fallback.

---

## Part 1 — Client Issue #1: Trainer ↔ School Deadlock (Root Cause Found)

Client suspects "SQL" — incorrect. Backend is Firestore (NoSQL) + localStorage. The real defect is **data modeling**:

- `trainer.sekolah` stores a **single school name string** (form select at ~line 2039, `value={s.nama}`), not an ID and not an array.
- `sekolah.trainer` stores a **single trainer name string** (~line 1913).
- The schema structurally **cannot** express "one trainer, many schools" — assigning a trainer to a second school overwrites the first. That forces the client to create duplicate schools to work around it. **This is the deadlock.**

Compounding fragility — all cross-entity matching is by fuzzy name comparison (~lines 807–810):

```js
trainer.find(
  (t) =>
    normalizeKey(t.sekolah) === normalizeKey(sch.nama) ||
    normalizeKey(t.nama) === normalizeKey(sch.trainer),
);
```

- `.find()` returns only the **first** match — a second matching trainer is silently dropped.
- The `OR` fallback matches a trainer by name against a school's trainer field even when `sekolah` points elsewhere → honor can be applied to the wrong school.

**Planned fix:**

- `trainer.sekolah` → `trainer.sekolahIds: string[]` (multi-select of school IDs).
- `sekolah.trainer` → `sekolah.trainerIds: string[]`.
- All attendance + finance matching switches from `normalizeKey(name)` to ID lookup.
- One-time migration: on load, convert legacy string assignments into ID arrays (match by name, fall back to unassigned).

---

## Part 2 — Full Backend / Logic Issue Audit

| #   | Severity | Issue                                                                                                                                                                                                                                                                                                                             | Location                       |
| --- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| 1   | Critical | **Inconsistent attendance key in Trainer CSV export** — uses raw `t.nama` while everywhere else uses `normalizeKey(t.nama)` → CSV silently reports 0 sessions / wrong honor for names with case/spacing differences                                                                                                               | ~line 912 vs 850               |
| 2   | Critical | **Attendance keyed by trainer name snapshot** — `handleSaveAbsensi` stores `trainer: school.trainer` (string). Renaming a trainer or reassigning a school breaks all historical honor calculations retroactively                                                                                                                  | ~line 752                      |
| 3   | High     | **Mixed accounting basis in Laba/Rugi** — `labaRugi = SPP (accrual, lunas-flagged) − Honor (cash, paid)`, yet `totalBebanHonor` (accrual) is displayed beside it. Two bases on one report = misleading profit. Must pick cash or accrual                                                                                          | ~line 836                      |
| 4   | High     | **No cascade on delete/rename** — deleting a school orphans `siswa.sekolahId`, `trainer.sekolah`, and `absensi` records, despite confirm dialog promising "Semua data terkait akan disesuaikan." Deleting a trainer dangles `sekolah.trainer`; renaming a school stales `siswa.sekolahNama`                                       | ~lines 494–667                 |
| 5   | High     | **One attendance record per school per day** — `docId = ${tanggal}_${schoolId}`; a second session same day **overwrites** the first. Must become `${date}_${schoolId}_${trainerId}` (or session slot) after fixing the relationship model                                                                                         | ~line 757                      |
| 6   | Medium   | **Hardcoded calendar Jul–Des 2026 only** — `monthToNum`, `getPeriodeFromDate`, default maps, CSV filenames all pinned to 2026. Any out-of-range date (e.g., Jan 2027) silently maps to 'Juli'. Also: `handleExportAbsensiCSV` filters by date-string prefix while stats filter by `periode` field — two filters that can disagree | lines 40–65, 209–251, 413, 931 |
| 7   | Medium   | **Honor payment overwrites; no rollback** — `[periode]: nominal` written as an absolute value; partial payments require admin mental math; no payment history/audit trail. Optimistic update has no revert if the Firestore write fails (error toast only; local state stays wrong until reload)                                  | ~lines 669–702                 |
| 8   | Medium   | **`seedDefaultData` duplicates on re-run in cloud mode** — pure `addDoc` loop, no existence check; clicking twice duplicates every seed record. Also seeds nothing for `absensi`/`settings`                                                                                                                                       | ~lines 420–451                 |
| 9   | Low      | **School honor rate via fragile name-match** — when no trainer matches, `honorRate = 0` but `trainerKehadiran` still counts sessions → "N sessions, Rp 0 expense" inconsistencies                                                                                                                                                 | ~lines 807–816                 |
| 10  | Low      | **Students-in-absensi fuzzy match** — `sekolahId OR fuzzy school name`; two schools with the same normalized name (e.g., after rename) show each other's students in the attendance sheet                                                                                                                                         | ~lines 355–364                 |

### Additional Gaps Found (not in the original audit)

| #   | Severity | Gap                                                                                                                                                                                                                                                                                                                                            |
| --- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | High     | **No attendance history viewer** — the Absensi tab is write-only. No way to view, audit, or correct a past record in-UI; only route is blind re-submit (silent overwrite) or DB surgery. Add: searchable attendance log (filter by school/periode) with "load into form to correct." Pairs naturally with the sidebar (R5) as an 8th nav item. |
| B   | High     | **Zero security boundary** — data under `public/data` in Firestore, anonymous auth; app assumes full read/write for any visitor. This is child PII (names, photos, parent WA numbers) with no access control. Minimum: move to a non-public collection path + Firestore rules, even with anonymous auth. Client must be told explicitly.       |
| C   | Medium   | **No input validation** — WA accepts any string (`wa.me/` breaks on spaces/non-digits); SPP/honor accept negatives; payment nominal can exceed debt → silent honor _overpayment_ shown as negative red "Sisa Kewajiban". Fix: digits-only WA normalization with `62` prefix, `min={0}` on money fields, warn-on-overpay confirmation.          |
| D   | Medium   | **No full backup/restore** — CSVs are per-entity, per-periode, read-optimized, not re-importable. One bad delete (gap #4) or botched seed (#8) is unrecoverable. Add: one-click full JSON export + import in the Settings modal (~30 lines). This is the real safety net and a prerequisite for safe migrations.                               |
| E   | Low      | **Hard delete with no undo** — consider soft-delete (`deleted: true`) with trash/restore affordance. Optional; at minimum fix the cascade (#4).                                                                                                                                                                                                |

---

## Part 3 — Client Refinements (R3–R6) + Suggestions

### R3. Graph Overview

Pure SVG/CSS charts (no new dependency — keeps the file self-contained and Canvas-runnable):

1. Monthly trend bar chart (Juli→Des): Pemasukan SPP vs Beban Honor vs Honor Dibayar per periode — one pass over existing data, `financialData` logic parameterized by month.
2. Donut chart: SPP collection rate (lunas vs belum) with center total.
3. Keep existing per-school horizontal bars; add cash-position summary line.

### R4. Payment: "Checkmark to zero-out Sisa Kewajiban"

- **"Lunaskan" (settle) checkmark button** per trainer row → adds `sisaHonor` of selected periode to `honorDibayarBulan[periode]` → paid == accrued, sisa = 0. Confirm dialog shows the math ("Bayar sisa Rp X kepada Y?").
- Restructure payments to **additive with history**: `honorPayments[]: {periode, nominal, tanggal}`; `honorDibayarBulan` becomes a derived per-period sum. Fixes issue #7 and gives an audit trail. Manual-input modal stays for partial payments; checkmark pre-fills remaining amount.

### R5. Navbar → Sidebar

- Desktop: fixed left sidebar `w-64` (logo+title top, periode selector, nav items incl. new "Riwayat Absensi", sync status bottom); content in `md:ml-64`; header reduced to slim top bar.
- Mobile: sidebar collapses to hamburger drawer (or bottom tab bar).
- Routing stays state-based — pure JSX/className restructure, no logic change.

### R6. "Potensi" Aggregation in Keuangan/Overview

- **Potensi SPP Total** = Σ (siswa per school × SPP) — already computed per-school as `targetSpp`, never totaled.
- **Outstanding SPP** (belum tertagih) = Potensi − Realisasi.
- **Sisa Kewajiban Honor Total** = Beban − Dibayar (exists per-row; total it).
- Display order: `Potensi SPP → Pemasukan SPP → SPP Belum Tertagih → Beban Honor → Honor Dibayar → Sisa Kewajiban → Laba/Rugi`, 4+3 grid. **Depends on decision #1 (accounting basis).**

### Additional Suggestions (client-facing polish, optional)

1. **WA click-to-chat templates** — pre-filled `wa.me` messages ("Tagihan SPP bulan Agustus untuk Ananda X: Rp 150.000"). High perceived value, low effort.
2. **Print-friendly Keuangan report** — `window.print()` + print CSS; more presentable to partners/yayasan than CSV.
3. **Rupiah-formatted number inputs** — display `150.000`, store `150000`; prevents misread zeros.
4. **Persist UI state** — `activeTab`, `selectedPeriode`, sidebar collapsed state in localStorage so refresh doesn't reset to Overview/Juli.
5. **File split** into `components/` — only if the project leaves Gemini Canvas; otherwise keep single-file (see Uncertainty #1).

---

## Execution Sequencing (recommended)

- **Phase 1 — Correctness:** issues #1, #2, #3, #4, #6, gap A (attendance viewer). These corrupt or misreport money; everything else is cosmetic by comparison.
- **Phase 2 — Workflow:** R4 checkmark-settle + payments history (#7), gap C validation, gap D backup/restore, #5 absensi keying, #8 seed guard, #9/#10 ID-based matching cleanup.
- **Phase 3 — Presentation:** R5 sidebar, R3 graphs, R6 potensi aggregation, suggestions 1–4. After numbers are known-correct, so charts chart true data.

**Validation per change:** narrowest check immediately after each edit (lint/typecheck if tooling exists; otherwise targeted manual scenario in the running app — e.g., assign one trainer to two schools → verify both schools' honor rows; settle payment → verify Sisa = 0 and history entry; rename trainer → verify historical honor intact).

---

## Open Decisions & Uncertainties (must resolve before implementation)

1. **Accounting basis** (blocks #3, R4, R6): Laba/Rugi cash-based (realisasi SPP − honor dibayar) or accrual (realisasi SPP − beban honor)? **Recommended: accrual**, cash shown separately.
2. **Multi-trainer scope** (blocks #1, #5): can one _school_ have multiple rotating trainers, or only one trainer serving many schools? Decides whether attendance needs a per-session trainer picker.
3. **Payment history restructure** (blocks #7, R4): OK to migrate `honorDibayarBulan` into a `honorPayments[]` array? Changes stored data shape; requires one-time migration.
4. **Year scope** (blocks #6): stay locked to Jul–Des 2026, or make periode/year dynamic (e.g., academic-year "2026/2027")?
5. **Where does this code live going forward?** (blocks all structural decisions) — continue in Gemini Canvas (keep single self-contained file, no deps, no build) vs. standalone deployment (needs Vite + Tailwind + `package.json` + env-based Firebase config scaffold). **Recommended: decide before any edit.**
6. **Operators: single admin or multiple staff?** Multi-operator raises severity of gap B (anonymous shared write) and #5 (overwrite keying) from tolerable to dangerous.
7. **Is real data already in use?** If yes: obtain full JSON export (gap D) of live Firestore before migrations for #1/#5/#7, and test migrations against actual data.
8. **Is the client actually running Firestore or silently in localStorage mode?** Header badge shows "Cloud Aktif" vs "Offline / Lokal" — confirm with client; local-only mode means data dies with a browser cache clear.
9. **Scale expectations** — fine at dozens of students; hundreds across years would require rethinking `sppLunasBulan` maps and whole-collection `onSnapshot` subscriptions. Affects whether the periode system (decision 4) is designed fixed-2026 or year-general.
