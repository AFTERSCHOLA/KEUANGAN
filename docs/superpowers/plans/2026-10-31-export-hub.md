# Export Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace fragile live-page printing with a backend-owned export pipeline, proven first on trainer attendance.

**Architecture:** New `server/lib/exportShell.php` (shared A4 shell, new renderers only — `invoiceDoc.php` stays byte-identical) + `server/lib/exportMatrix.php` (attendance matrix renderer porting `buildTrainerMatrix`/`formatMatrixCell` verbatim) + `POST /api/export-doc.php` (D-IP3 gate order, DB-direct reads under caller scope) + client `requestExportDoc()` (mirrors `openInvoiceDoc` blob flow); CSV matrix + `sep=;` built client-side from the scoped cache; Rekap month-grid copied from the Penugasan calendar.

**Tech Stack:** PHP (no new deps), React/Vite, Playwright E2E, server contract scripts (`invoice-doc.check.php` pattern), `npm run build:deploy` as the only deploy mirror.

**Spec:** `docs/superpowers/specs/2026-10-31-export-hub-design.md` — the plan argues from the spec, so the spec travels with it; executors read both.

**Scope note:** one plan, three sequential tasks (hub+doc → CSV → calendar). Each task ends green on its own deliverable; later tasks never reopen earlier ones.

## Global Constraints

- Zero new dependencies (composer/npm installs forbidden for these slices; R4 holds).
- Privilege unchanged: server enforces existing read scopes per record; no `authorize.php` edits.
- Read-only projections: export never writes; numbers equal the on-screen view for the same filters.
- Indonesian copy pinned (`Unduh Dokumen`, `Unduh CSV`, `Rekap Absensi Pengajar`, existing error strings).
- TEMP verification specs removed after passing; full-suite green stays `Unverified` (hygiene owns it).
- Verification language `Verified: <command> -> <result>` / `Unverified:`; E2E hygiene (Sim-marked seeds, reverse-order cleanup, zero pageerror, fresh builds).

## Review Focus

- 31-day month + long school names overflowing one landscape page — a reasonable person expects either one fitted page or clean multi-page with repeated headers, never cut columns → Task 1 PDF-proof pins both a full month and a wide-names fixture.
- Admin cabang requesting another branch's matrix — a reasonable person expects 403 with zero bytes → Task 1 protection leg.
- Matrix CSV double-clicked on comma-locale Excel — a reasonable person expects split columns with no wizard → Task 2 asserts `sep=;` opener + BOM.
- Same attendance record exported twice (exemplar Paris Jundi dupes) — a reasonable person expects one row per record → Task 2 dedupe test pins record-id uniqueness.
- Calendar opened on a month with zero records — a reasonable person expects an empty grid, no crash → Task 3 empty-month test.

---
### Task 1: Export hub + attendance matrix document

**Files:**
- Create: `server/lib/exportShell.php`
- Create: `server/lib/exportMatrix.php`
- Create: `server/api/export-doc.php`
- Create: `server/tests/export-doc.check.php`
- Create: `src/lib/exportDoc.js`
- Modify: `src/features/attendance/TrainerAttendanceRecap.jsx` (one `Unduh Dokumen` button + error slot only; existing Cetak/CSV untouched)
- Test: `server/tests/export-doc.check.php`, `tests/export-doc.spec.js` (new, persisted)

**Interfaces:**
- Consumes: `absensi_pengajar`/`sekolah`/`trainer` rows via `database()` under caller scope; `settings` body snapshot (D-IP2 allowlist, display-only); gate order of `server/api/invoices-doc.php:19-70` (405→401→403 CSRF→422→404→403 scope→bytes).
- Produces: `POST /api/export-doc.php {type:'rekap-pengajar', periode:'YYYY-MM', sekolahId?, settings?} -> text/html` (filename `Rekap_Pengajar_<periode>.html`); `requestExportDoc(type, filters)` in `src/lib/exportDoc.js` (fetch POST+CSRF, blob → `window.open`, Indonesian error throw — mirrors `openInvoiceDoc` at `src/lib/invoices.js:396-423`); `renderExportMatrix(matrix, opts)` with `{periode, dates, rows}` shaped exactly like `buildTrainerMatrix` output.

- [ ] **Step 1: Write the failing contract test**

```php
// server/tests/export-doc.check.php — renderer leg, zero prerequisites
$html = renderExportMatrix($fixtureMatrix, []);
assert(strpos($html, 'NAMA SEKOLAH') !== false);
assert(substr_count($html, 'Widia (I)') === 1);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `php server/tests/export-doc.check.php --no-http`
Expected: FAIL with "undefined function renderExportMatrix" (files not yet created).

- [ ] **Step 3: Implement `renderExportShell()` in `server/lib/exportShell.php` + `renderExportMatrix()` in `server/lib/exportMatrix.php`**

Landscape A4 shell + plain table styles shared by future types; matrix renderer ports `formatMatrixCell`/`buildTrainerMatrix` (`src/lib/trainerAttendance.js:42-104`) rule-for-rule (all calendar days as columns, correctionOf latest-wins, peran→I/A fallback, name sort); two-row header (Indonesian weekday + date number, Monday-first like the Penugasan grid).

- [ ] **Step 4: Implement `server/api/export-doc.php` + `requestExportDoc()` + Rekap button**

Mirror `invoices-doc.php:19-70` gate order with `authorize('read','absensiPengajar',…)` per school scope; client helper mirrors `openInvoiceDoc`; Rekap toolbar gains `Unduh Dokumen` next to `Unduh CSV` with a local error line (existing buttons untouched).

- [ ] **Step 5: Run tests to verify they pass**

Run: `php server/tests/export-doc.check.php` (both legs need MySQL + PHP :8000; `--no-http` alone is not enough to claim the gate)
Expected: ALL PASSED (renderer slots + 401/422/404/403/200 protection).
Run: `npx playwright test tests/export-doc.spec.js --project=default --workers=1`
Expected: PASS — button opens server doc with matrix nomor; `page.pdf()` of the opened doc is 1 page for a full 31-day seeded month AND for long-name schools; pageErrors 0.

- [ ] **Step 6: Commit**

```bash
git add server/lib/exportShell.php server/lib/exportMatrix.php server/api/export-doc.php server/tests/export-doc.check.php src/lib/exportDoc.js src/features/attendance/TrainerAttendanceRecap.jsx tests/export-doc.spec.js
git commit -m "feat: backend export hub with attendance matrix doc" -m "DB-direct reads, D-IP3 gates, zero new deps"
```

### Task 2: CSV matrix + open-correctly + dupe chase

**Files:**
- Modify: `src/lib/csv.js` (`sep=;` opener in `downloadCSV`; new `exportRekapMatrixCSV(matrix, periode)`)
- Modify: `src/features/attendance/TrainerAttendanceRecap.jsx` (second CSV button `Unduh CSV Matriks` only; existing flat export untouched)
- Test: `tests/rekap-csv-matrix.spec.js` (new, persisted)

**Interfaces:**
- Consumes: cached `buildTrainerMatrix` output (same `matrix` memo the table renders — never more rows than visible).
- Produces: `exportRekapMatrixCSV(matrix, periode)` downloading `Rekap_Matriks_<periode>.csv` whose first line is `sep=;`, second line the two-row-flattened header (weekday row + date row), then one row per school with cell texts byte-equal to `formatMatrixCell`.

- [ ] **Step 1: Write the failing test**

```js
// tests/rekap-csv-matrix.spec.js — parse the downloaded file, no Excel needed
const lines = content.split('\r\n' || '\n')
expect(lines[0]).toBe('sep=;')
expect(lines[1].split(';').slice(0, 3)).toEqual(['NO', 'NAMA SEKOLAH', expect.any(String)])
const ids = rows.map(r => r.id); expect(new Set(ids).size).toBe(ids.length)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/rekap-csv-matrix.spec.js --project=default --workers=1`
Expected: FAIL with `exportRekapMatrixCSV is not a function` (download event never fires).

- [ ] **Step 3: Chase the exemplar duplicates first (one hypothesis, stated in the commit body)**

Hypothesis to prove: the Paris Jundi double rows come from the flatten emitting one row per *entry* while the same record joins twice (vs two stored records). Check: fetch the fixture school's rows via `/api/read.php?entity=absensiPengajar`, compare record ids of the dupe pair. If same id twice → dedupe in `displayRows`/matrix builder by record id; if two stored records → leave data alone and dedupe only identical display lines, flagging the double-recording in the report. Implement whichever the evidence shows — exactly one of the two.

- [ ] **Step 4: Implement `sep=;` + `exportRekapMatrixCSV()` + second button**

`downloadCSV` prepends `sep=;\r\n` (after BOM) for every export (existing files keep working — Excel honors and hides it); matrix builder flattens the cached matrix; button added beside existing `Unduh CSV` (flat export retained untouched per design).

- [ ] **Step 5: Run test to verify it passes**

Run: `npx playwright test tests/rekap-csv-matrix.spec.js --project=default --workers=1`
Expected: PASS — opener line exact, header shape matches xlsx columns, no duplicate record ids, pageErrors 0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/csv.js src/features/attendance/TrainerAttendanceRecap.jsx tests/rekap-csv-matrix.spec.js
git commit -m "fix: matrix CSV with sep opener and dupe chase" -m "<one line: what the dupes were>"
```

### Task 3: Rekap month-grid calendar navigation

**Files:**
- Modify: `src/features/attendance/TrainerAttendanceRecap.jsx` (local `bulan` state + month grid UI only)
- Test: `tests/rekap-calendar.spec.js` (new, persisted)

**Interfaces:**
- Consumes: `usePeriod().periodeKey()` as the *default* month only; `buildTrainerMatrix` called with the selected `bulan` (same shape, different month).
- Produces: local `bulan` (`YYYY-MM`) state; month grid (7-col, Monday-first leading blanks, day cells showing record dots/counts, click sets a date filter chip for the Daftar view contract — exact drill behavior pinned in Step 1); prev/next month buttons; empty months render the grid with zero dots and the existing empty-table message.

- [ ] **Step 1: Write the failing test**

```js
// tests/rekap-calendar.spec.js
await page.getByRole('button', { name: 'Rekap Matriks' }).click()
await expect(page.getByTestId('rekap-calendar')).toBeVisible()
// navigate to a seeded past month: matrix header shows its days
await page.getByRole('button', { name: 'Bulan lalu' }).click()
await expect(page.getByRole('columnheader', { name: '15', exact: true }).first()).toBeVisible()
// empty month: no crash, empty message intact
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/rekap-calendar.spec.js --project=default --workers=1`
Expected: FAIL with `rekap-calendar` testid not found (no grid yet).

- [ ] **Step 3: Implement the month grid in `TrainerAttendanceRecap.jsx`**

Copy the `PenugasanTimetable.jsx:374-409` grid structure (leading-blank math, `min-h-20` day cells, `+N lagi` overflow, selected-day highlight); cells show per-day record counts from the cached rows; month state initialized from `periodeKey()` and independent after; global periode context untouched.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx playwright test tests/rekap-calendar.spec.js --project=default --workers=1`
Expected: PASS — past-month navigation shows seeded records, empty month clean, pageErrors 0.

- [ ] **Step 5: Commit**

```bash
git add src/features/attendance/TrainerAttendanceRecap.jsx tests/rekap-calendar.spec.js
git commit -m "feat: rekap month-grid calendar navigation" -m "Mimics PenugasanTimetable kalender idiom"
```
