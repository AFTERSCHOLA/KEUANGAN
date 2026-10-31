# Export Hub design (backend-owned documents)

**Status:** DRAFT 2026-10-31 — awaiting owner approval. Conversation: teammate
export breakage (attendance PDF cut, CSV one-column open) + owner direction
"raw data in, clean document out, template to paste into".
**Order agreed:** 1) attendance print parity → 2) CSV matrix → 3) Rekap
calendar nav, export hub laid as foundation under (1).

## Intent and the why

Every Export button that prints the live page (`window.print()` over app DOM)
breaks the moment its content outgrows A4: the attendance month-matrix (32
columns / 2056px in a 974px scroller, measured live 2026-10-30) prints as one
page with everything past day ~9 sliced off (`TrainerAttendanceRecap.jsx:80-137`,
`overflow-x-auto` + `sticky` + `whitespace-nowrap`, no print rules). Patching
each button repeats the invoice/raport saga per surface. So: one generic
pipeline where the frontend only *requests* an export (type + filters) and the
backend builds a standalone, print-safe document from database rows. The client
wants readable results, not styling — plain correct tables win over pixel
parity. (Evidence: `docs/exemplar/laporan1.pdf` + `RAPOT2.pdf` are content-empty
2-pagers — breakage reproducible only from the app; `Rekap_Pengajar_2026-09.csv`
is valid `;`-delimited bytes that open as one column on comma-locale Excel.)

## Goals

1. One request helper on the frontend (mirrors `openInvoiceDoc`): posts
   `{type, filters}` and opens the returned document — same trigger idiom on
   every Export button.
2. One renderer registry on the server: a shared shell (page size/orientation,
   header block, plain table rules, zero dependencies) + one small template
   per document type that pastes queried rows into columns.
3. Attendance matrix document first: landscape schools×dates table mirroring
   `docs/exemplar/ABSENSI TRAINER-new.xlsx` (NO + NAMA SEKOLAH, two-row
   weekday/date header, `Nama (I)/(A)` cells, LIBUR/BERES tokens), fitting one
   landscape page set or paginating cleanly with repeated headers.
4. CSV that opens correctly on double-click in Indonesian Excel: `sep=;`
   opener line (invisible, honored regardless of locale), plus a matrix-shape
   variant matching the same columns as the document.
5. Rekap month-grid calendar copied from `PenugasanTimetable.jsx:374-409`
   (Monday-first blanks, day buttons, drill-down) for navigating past
   attendance months.
6. Every export proven by script, not eyeball: print-to-PDF page assertions
   and CSV open-shape checks in the executable plan (owner explicitly asked
   for produce-and-verify loops).

## Non-goals

- Real `.xlsx` bytes from the server (PhpSpreadsheet / SheetJS). Owner call:
  read-only is enough; revisit only if editing-in-Excel is ever required.
- Pixel parity with the xlsx (fonts, colors, column widths, logos). Readable
  tables only — owner call.
- Changing invoice/raport print paths. They keep working untouched.
- A server settings store. Display-only settings keep traveling in the
  request body (D-IP2 precedent).

## Anti-goals (failure even if it technically works)

- Any export that depends on the live page's CSS, scroll containers, sticky
  positioning, or zoom hacks to look right.
- Frontend-sent row data (stale, heavy, bypasses branch scoping).
- A new dependency for the first slices (composer/npm installs, cPanel
  pipeline changes) without measured need.
- Another per-button fix that the next wide table re-breaks.

## Constraints

- Zero new dependencies (CLIENT_ROUND R4 holds; taste #71 deploy parity —
  `npm run build:deploy` stays the only mirror path).
- Privilege unchanged (taste #33): server enforces existing read scopes
  (`authorize('read', …)`); branch isolation identical to the on-screen view.
- Numbers are read-only projections of stored records; export never writes.
- Indonesian UI copy pinned; existing button idiom (`Unduh CSV`, `Cetak…`)
  kept.
- TEMP verification specs removed after passing; full-suite green stays with
  hygiene.

## The how (decided)

- **Data source: database-direct.** The request carries filters only
  (`periode`, `sekolahId`, view params); the server queries MySQL under the
  caller's scope. Owner agreed (their "raw data" idea, sharpened).
- **Document format: standalone HTML docs** (extends the proven
  `server/lib/invoiceDoc.php` pattern: inline CSS, dataURL images, zero JS,
  opened via blob exactly like Dokumen Resmi, saved via browser). Owner call:
  template = renderer + shared shell; the xlsx is a layout reference, never
  an injection target.
- **CSV: keep client-side**, add `sep=;\r\n` first line (my call — standard
  Excel behavior, invisible everywhere else), add matrix-shape variant, chase
  the duplicate Paris Jundi rows (flatten dupe vs double record — Phase 1 of
  the plan proves which).
- **Calendar: pure client UI** in the Rekap view, copying the Penugasan
  month-grid positions and drill-down (my call — smallest nav diff, no tab
  changes).
- **Scope order: attendance doc → CSV → calendar** (owner call).

## Builder-check answers (2026-10-31, all five reviewer questions grounded — no
open questions left for the owner)

1. **Tables/scope:** query `absensi_pengajar` (+ name joins to sekolah/trainer
   tables) through the same gates as the screen: `read.php` entity allowlist
   (`server/api/read.php:20`) + `authorize('read','absensiPengajar',…)` per
   record (`server/auth/authorize.php:180`), mirroring the `invoices-doc.php`
   D-IP3 gate order (401→422→404→403→bytes). Branch isolation is therefore
   identical to `readCached('absensiPengajar')` by construction, not by trust.
2. **Shell placement (my call):** new `server/lib/exportShell.php` used ONLY
   by new renderers; `server/lib/invoiceDoc.php` stays byte-identical
   (the "untouched" non-goal holds literally, no regression proof needed).
3. **Cell rules (authoritative, port verbatim):** `formatMatrixCell` +
   `buildTrainerMatrix` (`src/lib/trainerAttendance.js:42-104`, unit-pinned):
   every calendar day is a column; correction chains collapse via
   `correctionOf` latest-wins; `peran`→I/A with `tipePengajar` fallback;
   non-Hadir details join after the dash; rows sorted by name (`id` locale).
   LIBUR/BERES are stored `keterangan` enum values, never computed — there
   is no holiday source to replicate. Weekday header row derives from the
   date (Indonesian day names, Monday-first like the Penugasan grid).
4. **CSV split (my call):** RETAIN the existing flat export untouched, ADD a
   matrix-shape variant; both built client-side from the already
   branch-scoped cache. Anti-goal clarification: it bans *sending* rows to
   the server, which CSV never does (local download only) — no waiver needed.
5. **Harness (settled):** Playwright TEMP specs + `page.pdf()` page counting
   (proven in the raport R2.2 loop) for documents; new server contract script
   on the `invoice-doc.check.php` pattern for gates/slots; CSV assertions
   parse `;` columns and pin the `sep=;` opener, BOM, and CRLF endings.

## Left to the builder

- Exact endpoint/registry naming and file layout (one `export-doc.php` with a
  type switch vs one file per type; registry array vs classes).
- Landscape pagination rule for very wide months (fit-to-width zoom floor vs
  repeated-header multi-page) with measured numbers.
- Calendar drill behavior detail (in-place date filter vs periode jump) and
  empty-month states.
- CSV matrix column order for correction-note columns (keep BUG6 columns or
  fold into cell text).
- Error/empty-result document shape (one friendly row vs message page).
