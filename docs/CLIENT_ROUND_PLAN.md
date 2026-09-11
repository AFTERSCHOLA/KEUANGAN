# Client Round — Billing, Invoice, Approval & School Detail Plan

**Status:** Agreed with client (2026-09-11 session). This document is the durable record of that agreement and the build contract for the milestone chain in `docs/CLIENT_ROUND_MILESTONES.md`. If the two disagree, this file wins on *intent*; the milestones file wins on *execution order*.

**Authoritative foundation (read first, per taste):** `docs/UNIVERSAL.md` + `docs/IMPLEMENTATION_PLAN.md` (D1 cash basis, D3 ledger, D4 academic year, R1–R8) + `docs/SCOPE_EXPANSION_PLAN.md` (this file wins on scope-expansion intent) + `docs/SCOPE_EXPANSION_PRIVILEGES.md` (server-side privilege matrix). Nothing here broadens a role's authority as a shortcut (taste #33); all privilege changes stay inside the matrix's escalation paths.

**Ground truth for invoice layout:** `invoice-template.pdf` at repo root (image-only PDF, no text layer — port by eye against `pdf_page1_I0.jpg`). `public/invoice/` holds only assets (`logo.png`, `signature.png`), not the format.

Cross-reference: `docs/CLIENT_ROUND_MILESTONES.md` owns the ordered MICROTASK chain that implements sections 5–8 below.

---

## 1. Scope and boundary

This plan covers exactly the four agreed items, in this build order (rationale in section 9):

1. **Per-school billing scheme** (`sekolah.skemaTagihan`) — the data foundation invoice depends on.
2. **Invoice as downloadable data** — one-click `Draft → Terbit → Lunas` document following the PDF layout.
3. **Trainer approval, "ops ringan" scope** — auto-accept attendance; approve corrections-after-verify, new enrollments, SPP records; Pusat keeps money-out.
4. **School detail drawer** — full info per school, reading already-computed finance data.

Deliberately excluded (not open scope unless a linked microtask says so):

- Honor matrix per branch (stays deferred per `SCOPE_EXPANSION_PLAN.md` Part 4 item 7).
- Server-side PDF generation / archival (client-side download first; server only if a later round demands central archiving).
- Free-formula expression engine for billing (YAGNI per taste #65 — 4 presets + override cover the known cases).
- F1–F24 (`AUDIT_MILESTONES.md`), AF1–AF16 (`AUDIT_FOLLOWUP_PLAN.md`), production auth gates (`PRODUCTION_MILESTONES.md`). Where this plan restates one, it is only to record the current-source check.

---

## 2. Findings (stable IDs; verified against current source 2026-09-11)

| ID | Finding | Evidence |
|----|---------|----------|
| F1 | Trainer attendance saves bypass any approval: direct `upsert('absensi')` after the paper-sanity confirm. | `src/features/attendance/AttendanceForm.jsx:65-77,109` |
| F2 | Post-verification correction has no formal state — only the manual escalation path "request pusat un-verify → correct → re-verify". | `docs/SCOPE_EXPANSION_PRIVILEGES.md:132-138`, `src/features/attendance/RiwayatAbsensi.jsx:146-152` |
| F3 | Verification stamping exists (`statusVerifikasi {by, at}`, `konfirmasiTrainer`) with role gate `canVerify()` = admin_cabang + superadmin; trainer sees "Menunggu". The queue defaults to flags-only, not review-everything. | `src/features/attendance/RiwayatAbsensi.jsx:60-64,130-144`, `src/lib/role.js:28-30`, `src/lib/constants.js:280,300` |
| F4 | Invoice math is rigid: `hargaSatuan = spp × bulanCount`, `total = siswaAktif × hargaSatuan`. One flat `spp` per school; no per-school scheme. | `src/features/reports/InvoiceModal.jsx:33-34`, `src/lib/constants.js:34-48`, `src/lib/finance.js:52-64` |
| F5 | Invoice output relies on `window.print()` over the live app DOM; there is no downloadable file artifact. Numbering format (`BRANCH-YYYYMM-XXXX` in `src/lib/invoices.js:53-67`) differs from the PDF ground truth (`AFS-202608-0001`). | `src/features/reports/InvoiceTemplate.jsx:27`, `src/lib/invoices.js:53-67` |
| F6 | School card shows counts only (trainer count, siswa count via per-card filter, jadwal, SPP). Full info (status breakdown, Potensi → Realisasi → Tunggakan, trainer names, sesi/beban, invoice status) requires leaving the tab, although `sekolahFinance` already computes most of it. | `src/features/schools/SchoolList.jsx:296-328`, `src/lib/finance.js:52-89` |
| F7 | `invoice-template.pdf` is an image-only PDF (0 text objects; 217,512 bytes) — placeholders must be mapped by eye from the `pdf_page1_I0.jpg` render, then verified visually. | Root `invoice-template.pdf` + `pdf_page1_I0.jpg` (see section 6) |

---

## 3. Decisions (stable IDs; locked with client 2026-09-11)

| ID | Decision | Concrete pick |
|----|----------|---------------|
| D1 | PDF is the layout ground truth. | Port the sections in section 6 by eye; visual-parity check against `pdf_page1_I0.jpg` is the acceptance for layout. |
| D2 | Invoice **record** is the source of truth; PDF/download is a rendering. | Keep `Draft → Terbit → Lunas` (`src/lib/invoices.js:69-81`); nomor generated once at Terbit; deleted drafts never burn numbers. Styling may return to generic-clean-A4 as long as the ledger stays true. |
| D3 | "Total income" = total fee the school pays the company = **billing-side**. | Scheme lives on `sekolah.skemaTagihan` (section 5); every invoice snapshots `{skemaTipe, paramsSnapshot, total}` so any number stays explainable. |
| D4 | Approval scope = **"ops ringan"**. | Attendance drafts, `catatan`, photos, weekly self-cert auto-accept. Approval required only for: (a) correction of an already-verified record, (b) new student enrollment, (c) SPP collection record (`sudahDisetor` flag). Money-out (honor payout, tarif change, invoice Terbit, un-verify of locked record) stays Superadmin-only. |
| D5 | Billing flexibility = **4 presets + manual override with mandatory reason**. | `tipe: 'perSiswa' \| 'flat' \| 'perPertemuan' \| 'manual'`; default `perSiswa` = today's behavior (zero-migration). `totalManualOverride` requires `alasanOverride` (audit trail, operational text only — no new PII). |
| D6 | School detail = **drawer over the existing card, reading existing aggregates**. | No new aggregation: values come from `financialData().sekolahFinance` + `siswa` status counts + latest invoice status. Card grid itself unchanged. |

---

## 4. Rules (stable IDs; bind every microtask)

| ID | Rule |
|----|------|
| R1 | **Ledger trust.** Invoice totals, `potensiSpp`/`pemasukanSpp`, honor aggregates derive from stored records (`invoices`, `sppPayments`, `honorPayments`, `absensi`) — never recomputed from live entity state at render time except inside `finance.js`. Invoice snapshots scheme+params+total at creation (D3). |
| R2 | **Mirror existing idiom, do not invent** (taste #11). Approval queue reuses the `RiwayatAbsensi` flags-only table + emerald `Verifikasi`-style button; dialogs reuse `ConfirmDialog`/`AlertDialog` with pinned Indonesian copy (`Setujui / Tolak / Menunggu`, `Ya, Simpan / Cek Ulang`, `Terbitkan / Tandai Lunas / Hapus`, `Nama sekolah tidak boleh kosong`); money inputs reuse `RupiahInput` (type `150000` → display `150.000`, store plain number); print reuses `.printable-report` / `.no-print`. |
| R3 | **Smallest slice, one concern per edit, verify immediately** (taste #3–#6, R1/R6). One MICROTASK = one behavior; run its VERIFY before the next begins; on a bug state the violated invariant as one hypothesis before editing. |
| R4 | **No new dependency for the first slices.** Downloadable invoice ships via the existing print path made deterministic (isolated print root, A4 `@page`, dataURL logo/signature with `settings.logoUrl` fallback). A PDF lib or server-side renderer is a later, separately-justified step (UNIVERSAL scope gate). |
| R5 | **No new PII.** `alasanOverride`, `pjSekolah`, `uraian` are operational text. Photos stay out of localStorage (IndexedDB/server per plan). |
| R6 | **Idempotent migration.** `skemaTagihan` defaults to `{tipe:'perSiswa'}` on read/first-save for legacy schools; `statusPersetujuan` defaults to `null` (= pre-approval records behave as approved history, never blocked). No bulk rewrite. |

---

## 5. Billing scheme spec (D3 + D5)

```js
sekolah.skemaTagihan = {
  tipe: 'perSiswa' | 'flat' | 'perPertemuan' | 'manual', // default 'perSiswa'
  params: {
    sppPerSiswa?: number,     // perSiswa: defaults to sekolah.spp
    flatNominal?: number,      // flat: fixed fee per periodeList
    tarifPertemuan?: number,   // perPertemuan: fee per student per meeting
    jumlahPertemuan?: number,  // perPertemuan: meeting count (also feeds uraian "(Nx Pertemuan)")
    diskon?: number,           // any tipe: subtraction, >= 0
    biayaLain?: number,        // any tipe: addition, >= 0
  },
  totalManualOverride?: number, // manual tipe, or exception override on any tipe
  alasanOverride?: string,      // REQUIRED when totalManualOverride is set
}
```

Computation (lives in one place — `finance.js` for potensi, `invoices.js`/modal preview for invoice total; UI only renders):

- `perSiswa`: `jumlahSiswaAktif × sppPerSiswa × bulanCount − diskon + biayaLain` (`jumlahSiswaAktif` = non-trial count, as today).
- `flat`: `flatNominal × bulanCount − diskon + biayaLain` (siswa count shown for context, not multiplied).
- `perPertemuan`: `jumlahSiswaAktif × tarifPertemuan × jumlahPertemuan − diskon + biayaLain`.
- `manual`: `totalManualOverride` (reason required).

`finance.js` potensi per school follows the same branch so Potensi-vs-Realisasi memo math stays consistent; `Trial` students stay excluded (M5.4.3 preserved).

---

## 6. Invoice placeholder map (D1 + D2; sources — no invented slots)

PDF section → single source:

| PDF slot | Source |
|----------|--------|
| Logo + alamat usaha | `settings.logoUrl` (fallback `/invoice/logo.png` as dataURL) + `settings.alamatUsaha` (`InvoiceTemplate.jsx:34-39`) |
| `INVOICE` + nomor + Tanggal | `invoice.nomor` (once at Terbit, `invoices.js:69-81`) + `invoice.tanggalTerbit` |
| `KEPADA YTH` + PJ | `sekolah.nama` + `invoice.pjSekolah` |
| `BULAN TAGIHAN` | `invoice.periodeList` → existing `periodeLabel` |
| Table `NO / URAIAN / SISWA / HARGA SATUAN / TOTAL` | `invoice.uraian / jumlahSiswa / hargaSatuan / total` (+ `jumlahPertemuan` feeds uraian text as today, `InvoiceModal.jsx:38-40`) |
| `GRAND TOTAL` + `Terbilang` | `invoice.total` + `terbilang(invoice.total)` |
| `Catatan Pembayaran` (bank block) | `settings.rekeningBank / rekeningNomor / rekeningAtasNama` |
| `Hormat Kami` + signature + name | `/invoice/signature.png` as dataURL + `settings.penandatangan` |

Numbering note (F5): keep the existing once-at-Terbit generator mechanics; align the **display format** toward the PDF ground truth (`AFS-YYYYMM-XXXX`) in microtask I2.2 — format change only, no ledger-semantics change.

---

## 7. Approval spec (D4; extends F3, formalizes F2)

New field (nullable = history-safe per R6):

```js
absensi.statusPersetujuan = null | {
  status: 'Menunggu' | 'Disetujui' | 'Ditolak',
  alasanPenolakan?: string,
  by?: string, at?: string, decidedBy?: string, decidedAt?: string,
}
```

- Auto-accept path unchanged: fresh attendance saves with `statusPersetujuan: null` and flow exactly as today (F1).
- Approval path triggers only on: (a) editing a record whose `statusVerifikasi?.at` is set, (b) creating a `siswa` with `status Aktif` via enrollment (minimal writer change), (c) creating an `sppPayments` record. These writes set `statusPersetujuan.status = 'Menunggu'` and surface in the existing flags-only queue pattern (default view = needs-review; full history behind the explicit "Semua" toggle, mirroring `RiwayatAbsensi.jsx:71-98`).
- Decide action stamps `{decidedBy: role, decidedAt}`; `Ditolak` requires `alasanPenolakan` and returns the record to the trainer's pending surface ("Rekap Saya") — the Trainer → Head transmission loop taste #28 demands.
- Server follow-up (explicitly later, not in this chain): `cabang_id`-scoped authorize rule + column for `statusPersetujuan`; client is the mirror, server is the guard (per `SCOPE_EXPANSION_PRIVILEGES.md` UI-vs-server section).

---

## 8. School detail spec (D6; surfaces F6)

Drawer (modal idiom, cf. `InvoiceModal`) over the unchanged card grid, sections:

1. Identitas: nama, cabang kode, alamat, `jadwalList` formatted.
2. Siswa: total + breakdown Aktif/Trial/Berhenti (counts from `siswa` by `sekolahId`).
3. Tagihan periode ini: tarif + `skemaTagihan.tipe`, Potensi → Realisasi → Belum Tertagih (from `sekolahFinance` entry).
4. Operasional periode ini: trainer names (not just count), sesi kehadiran, beban honor.
5. Status: tunggakan bucket ringkas + latest invoice `{nomor, status}` for this school.

All finance numbers are the `sekolahFinance` values for the selected periode — the drawer takes `periode` as input and renders, never aggregates.

---

## 9. Sequencing (why scheme → invoice → approval → detail)

`G1` scheme is the data foundation `G2` invoice snapshots (D3) — invoice cannot lock numbers before the scheme exists. `G3` approval is independent of billing math but touches the same `siswa`/`sppPayments` writers, so it lands after invoice to avoid two chains editing the same modals concurrently (ownership discipline R7). `G4` detail reads scheme + invoice status, so it closes last. Gates: no later gate starts until the earlier gate's exit VERIFY passes.

---

## 10. Triage vs planning docs (taste #30, #31, #68)

| ID | Already planned? | Where | Disposition here |
|----|------------------|-------|------------------|
| F1 (direct absensi save) | Confirmed Phase A behavior | `SCOPE_EXPANSION_PLAN.md` A2/A5, M5.2–M5.3 | Kept (auto-accept leg of D4) |
| F2 (manual un-verify path) | Partially specified | `SCOPE_EXPANSION_PRIVILEGES.md:132-138` | Formalized as `statusPersetujuan` (G3) |
| F3 (verify stamps + queue) | Confirmed | M5.3.1/M5.3.1b | Reused as the approval idiom (R2), not rebuilt |
| F4 (rigid invoice math) | Deferred pending case | Part 4 item 7 (`sppOverride` now, matrix later) | This round IS the case: G1 presets un-defer it; honor matrix stays deferred |
| F5 (print-only invoice) | Confirmed need | B2/B3, M6.2.2 | G2: data-first + downloadable rendering |
| F6 (thin school card) | Implied only | `sekolahFinance` exists, no school-tab view specified | G4 new small spec |
| F7 (image-only PDF) | Not documented | — | G2 ports by eye + visual-parity VERIFY |

---

## 11. Exit gates (whole round)

- E1: Two schools on different schemes in one periode produce correct potensi + matching invoice totals; a manual override carries its reason onto the invoice.
- E2: Trainer corrects a verified record → `Menunggu` → Cabang decides → finance moves only on approval; trainer sees the decision.
- E3: Invoice for a school downloads/prints from one click with every section-6 slot filled from its mapped source; deleted drafts never burn numbers.
- E4: School Detail drawer numbers equal FinanceReport for the same periode.
- E5: Full chain: `npm test` green (touched libs), production build clean, no `console.log` in `src/` (taste #20), `git status` shows only intended files.

---

**End of Client Round Plan**
