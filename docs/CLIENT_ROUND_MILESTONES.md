# Client Round — Microtask Chains (G1–G4)

**Companion to `docs/CLIENT_ROUND_PLAN.md`.** Implements plan sections 5–8 in strictly-ordered gates: **G1 scheme → G2 invoice → G3 approval → G4 detail** (rationale: plan section 9). Each microtask must VERIFY before the next begins. A failing check becomes the next microtask's own EDIT — never a concurrent second edit.

```text
MICROTASK: <one verb + one noun>
  EDIT:    <exact file(s)>
  FINDS:   <F-IDs from the PLAN>
  RULES:   <R-IDs from the PLAN + taste codes>
  DEPENDS: <prior microtask>
  OUTCOME: <one observable sentence>
  VERIFY:  <one falsifiable automated or executable check>
  DONE-IF: verify passes; only intended files changed
```

R-codes quick reference (PLAN section 4): R1 ledger trust · R2 mirror idiom · R3 smallest slice + verify · R4 no new dep · R5 no new PII · R6 idempotent migration. Taste codes: taste #11 mirror idiom · #15 wire-or-delete dead code · #16 Indonesian copy · #18 Rupiah display-vs-storage · #20 no console.log hygiene.

---

## Gate G1 — Billing scheme (D3 + D5; FINDS F4)

**Entry gate:** PLAN sections 3–5 agreed (done 2026-09-11). **Exit gate:** two schemes coexist in one periode with correct potensi; legacy schools default to `perSiswa` with zero writes.

### G1.1 Add skemaTagihan factory field

```text
MICROTASK: Add skemaTagihan field
  EDIT:    src/lib/constants.js (newSekolah only)
  FINDS:   F4
  RULES:   R3, R6, taste #11 (default object literal next to jadwalList pattern)
  DEPENDS: none
  OUTCOME: new schools carry skemaTagihan {tipe:'perSiswa', params:{}} and legacy records read back with the same default without a bulk rewrite
  VERIFY:  node unit check: newSekolah() has skemaTagihan.tipe === 'perSiswa'; a legacy school object without the key normalizes to perSiswa on first save
  DONE-IF: verify passes; only constants.js changed
```

### G1.2 School form scheme picker

```text
MICROTASK: Add scheme picker UI
  EDIT:    src/features/schools/SchoolList.jsx (SchoolForm only)
  FINDS:   F4
  RULES:   R2, R3, taste #11 (mirror existing form-row + RupiahInput idiom), taste #16 (labels: 'Skema Tagihan', 'Per Siswa', 'Flat', 'Per Pertemuan', 'Manual', 'Alasan override wajib diisi'), taste #18 (all money via RupiahInput)
  DEPENDS: G1.1
  OUTCOME: editing a school shows Skema Tagihan radio + only the params for the picked tipe + live preview line, and saving persists skemaTagihan
  VERIFY:  Playwright: open Edit Sekolah as superadmin, pick Flat, type 5000000 via plain digits, save, refresh, form re-hydrates Flat + 5000000 displayed as 5.000.000
  DONE-IF: verify passes; only SchoolList.jsx changed
```

### G1.3 Finance honors scheme

```text
MICROTASK: Compute potensi per scheme
  EDIT:    src/lib/finance.js (sekolahFinance targetSpp branch only) + src/lib/__tests__/finance-scheme.test.js (new)
  FINDS:   F4
  RULES:   R1, R3, taste #35 (Trial exclusion preserved — M5.4.3 regression guard in the same spec)
  DEPENDS: G1.1
  OUTCOME: targetSpp follows section-5 math per tipe while Trial students stay excluded and invoice-independent aggregates are untouched
  VERIFY:  npm test: perSiswa 30x100rb=3jt, flat 5jt, perPertemuan 11x50rbx12=6,6jt, manual override respected, trial-only students contribute 0
  DONE-IF: verify passes; only finance.js + the new test changed
```

### G1.4 Snapshot scheme onto invoice

```text
MICROTASK: Stamp scheme snapshot
  EDIT:    src/lib/invoices.js (newInvoice + stored shape only)
  FINDS:   F4
  RULES:   R1, R3 (shape additive: skemaTipe + paramsSnapshot; total still jumlahSiswa*hargaSatuan-compatible for perSiswa)
  DEPENDS: G1.2, G1.3
  OUTCOME: every new invoice permanently records which scheme and params produced its total
  VERIFY:  node unit check: newInvoice with skema snapshot round-trips through addInvoice/invoicesForSekolah with skemaTipe + paramsSnapshot intact
  DONE-IF: verify passes; only invoices.js changed
```

---

## Gate G2 — Invoice as downloadable data (D1 + D2; FINDS F5, F7)

**Entry gate:** G1 exit green (scheme snapshot exists). **Exit gate:** one-click Draft → Terbit → download/print with every section-6 slot filled; deleted drafts never burn numbers.

### G2.1 Single-click summarize modal

```text
MICROTASK: Upgrade invoice modal
  EDIT:    src/features/reports/InvoiceModal.jsx only
  FINDS:   F4, F5
  RULES:   R1, R2, taste #11 (keep existing mode/semester/uraian/riwayat idiom; only the total-preview block changes), taste #16 (keep 'Simpan sebagai Draft', 'Terbitkan', 'Tandai Lunas', 'Hapus'), taste #18 (preview via formatRupiah)
  DEPENDS: G1.4
  OUTCOME: the modal shows all visible params (siswa aktif auto-count, harga satuan from scheme, pertemuan, diskon, biaya lain) with a live total and saves a snapshot-stamped Draft
  VERIFY:  Playwright: school with 11 aktif students, perPertemuan 850rb x 12 → preview Rp 9.350.000; save Draft; riwayat shows Draft with that total
  DONE-IF: verify passes; only InvoiceModal.jsx changed
```

### G2.2 Port template to PDF sections

```text
MICROTASK: Port PDF layout
  EDIT:    src/features/reports/InvoiceTemplate.jsx only
  FINDS:   F5, F7
  RULES:   R2, R3, taste #11 (keep printable-report/no-print + terbilang + settings bank/signature idiom; restyle toward pdf_page1_I0.jpg sections only)
  DEPENDS: G2.1
  OUTCOME: printed invoice shows every PLAN section-6 slot (logo+alamat, AFS-style nomor + tanggal, KEPADA YTH + PJ, BULAN TAGIHAN, NO/URAIAN/SISWA/HARGA/TOTAL, GRAND TOTAL, Terbilang, Catatan Pembayaran, Hormat Kami + signature + name) from its single mapped source
  VERIFY:  Playwright (testing taste #29): intercept window.print, open Cetak on a Terbit invoice, assert intercepted + nomor + 'SMP TRIDAYA TUNAS BANGSA'-style name + grand total + terbilang all render; eyeball one full-page screenshot vs pdf_page1_I0.jpg
   DONE-IF: verify passes; only InvoiceTemplate.jsx changed
```

> **Note 2026-09-20 (INVOICE_DOC_PARITY, visual-only):** the visual-parity half is satisfied by the standalone server document `POST /api/invoices-doc.php` (renderer `server/lib/invoiceDoc.php`) — every PLAN §6 slot + settlement appendix, eyeball-accepted vs `pdf_page1_I0.jpg`. Client `InvoiceTemplate.jsx` print path kept as offline fallback (not restyled here). Contract: `php server/tests/invoice-doc.check.php`; E2E: `tests/invoice-doc.spec.js`.

### G2.3 Deterministic download path

```text
MICROTASK: Add download artifact
  EDIT:    src/features/reports/InvoiceTemplate.jsx (print-root isolation + dataURL logo/signature) + src/print.css (A4 @page for .printable-report only)
  FINDS:   F5
  RULES:   R2, R4 (no new dep: isolated print root + browser Save-as-PDF; dataURL avoids /invoice/*.png deploy-subpath 404)
  DEPENDS: G2.2
  OUTCOME: Cetak/Download from the invoice view yields a clean single-document A4 file with no app chrome and working logo/signature offline
   VERIFY:  Playwright: block network, click Cetak, print intercept fires and logo/signature img elements have data: or cache-backed src (no 404); production build passes
   DONE-IF: verify passes; only the two files changed
```

> **Note 2026-09-20 (INVOICE_DOC_PARITY):** partially satisfied via the server document — standalone A4 page (no app chrome) with dataURL logo/signature embedded from disk (`server/api/invoices-doc.php` + `server/lib/invoiceDoc.php`). Client print-root isolation + dataURL in `InvoiceTemplate.jsx`/`print.css` remains open (client print kept as fallback).

---

## Gate G3 — Approval, ops-ringan scope (D4; FINDS F1, F2, F3)

**Entry gate:** G2 exit green (invoice writers stable — G3 touches the same `siswa`/`sppPayments` writers, so it waits). **Exit gate:** the section-7 scenario passes end to end with finance moving only on approval.

### G3.1 Add statusPersetujuan field

```text
MICROTASK: Add approval field
  EDIT:    src/lib/constants.js (newAbsensi only)
  FINDS:   F2
  RULES:   R3, R6 (nullable default null = history-safe; mirror statusVerifikasi/konfirmasiTrainer shape), taste #35 (idempotent)
  DEPENDS: G2.3
  OUTCOME: new attendance records carry statusPersetujuan: null and legacy records read as unblocked history
  VERIFY:  node unit check: newAbsensi() has statusPersetujuan === null; legacy record without the key behaves as approved history in the queue filter
  DONE-IF: verify passes; only constants.js changed
```

### G3.2 Approval queue actions

```text
MICROTASK: Add approve actions
  EDIT:    src/features/attendance/RiwayatAbsensi.jsx only
  FINDS:   F2, F3
  RULES:   R2, R3, taste #11 (default flags-only view + explicit Semua toggle kept; decide buttons mirror the emerald Verifikasi idiom), taste #15 (no dead approve path — Menunggu records without a decide button fail this task), taste #16 (labels: 'Setujui', 'Tolak', 'Menunggu', 'Alasan penolakan wajib diisi')
  DEPENDS: G3.1
  OUTCOME: Menunggu records appear in the needs-review queue with working Setujui/Tolak (Tolak requires a reason and returns the record to trainer-pending); canVerify gating unchanged
  VERIFY:  Playwright: seed one Menunggu record as trainer, log in as admin_cabang, queue count shows 1, click Setujui, record stamps decidedBy/decidedAt and leaves the queue; Tolak without reason is blocked with the pinned copy
  DONE-IF: verify passes; only RiwayatAbsensi.jsx changed
```

### G3.3 Route writers through Menunggu

```text
MICROTASK: Route writers to approval
  EDIT:    src/features/attendance/AttendanceForm.jsx (edit-of-verified path only), src/features/students/StudentList.jsx (create path only), src/features/payments/SppPaymentModal.jsx (create path only)
  FINDS:   F1, F2
  RULES:   R2, R3 (each writer sets statusPersetujuan.status='Menunggu' ONLY on its trigger: verified-record edit / new enrollment / new SPP record; fresh attendance drafts keep statusPersetujuan: null)
  DEPENDS: G3.2
  OUTCOME: the three triggers land in the approval queue while normal trainer saves stay instant
  VERIFY:  Playwright: trainer edits a verified record → it flips to Menunggu and admin queue +1 while FinanceReport totals for the periode are unchanged until approval
  DONE-IF: verify passes; only the three files changed
```

---

## Gate G4 — School detail drawer (D6; FINDS F6)

**Entry gate:** G1–G3 green (drawer reads scheme + latest invoice status). **Exit gate:** drawer numbers equal FinanceReport for the same periode (E4).

### G4.1 Add detail drawer

```text
MICROTASK: Add school detail drawer
  EDIT:    src/features/schools/SchoolList.jsx (new SchoolDetail component in-file + one Detail button per card; card grid otherwise untouched)
  FINDS:   F6
  RULES:   R1, R2, taste #11 (modal idiom mirrored from InvoiceModal; table idiom from FinanceReport sekolahFinance rows), taste #16 (section titles: 'Siswa', 'Tagihan Periode Ini', 'Operasional Periode Ini', 'Status'), taste #15 (every rendered row binds a real value — no placeholder dashes except the pre-existing honor-per-school ledger note)
  DEPENDS: G2.3, G3.3
  OUTCOME: Detail opens a drawer with identity, siswa breakdown Aktif/Trial/Berhenti, tarif + skema tipe, Potensi → Realisasi → Belum Tertagih, trainer names, sesi + beban honor, tunggakan ringkas, latest invoice nomor + status for the selected periode
  VERIFY:  Playwright: open Detail for a seeded school, assert Potensi/Realisasi/Beban figures equal the FinanceReport sekolahFinance row for the same periode; close returns to the unchanged card grid
  DONE-IF: verify passes; only SchoolList.jsx changed
```

---

## Microtask Verification Standards

Each microtask above must satisfy:

```text
MICROTASK: <one verb + one noun>
  EDIT:    <exact file(s)>
  FINDS:   <F-IDs>
  RULES:   <R-IDs + taste codes>
  DEPENDS: <prior microtask>
  OUTCOME: <one observable sentence>
  VERIFY:  <one falsifiable automated or executable check>
  DONE-IF: verify passes; only intended files changed
```

Plus the whole-round gates E1–E5 in `docs/CLIENT_ROUND_PLAN.md` section 11: `npm test` green on touched libs, clean production build, no `console.log` in `src/`, `git status` shows only intended files. Server-side authorize/column work for `statusPersetujuan` is explicitly out of this chain (PLAN section 7) — any 403/column gap found during G3 is documented for follow-up, not patched mid-chain (taste #13).

---

**End of Microtask Chains**
