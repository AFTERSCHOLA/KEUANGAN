# SPP & Billing Milestones — Microtask Chain (SB.A → SB.C)

**Companion to `docs/SPP_BILLING_PLAN.md`.** Memecah rencana menjadi microtask yang berurutan ketat. Setiap microtask harus VERIFY sebelum berikutnya dimulai; pemeriksaan yang gagal menjadi follow-up terbatas, bukan pelebaran edit.

**Source of truth untuk findings/decisions:** `SPP_BILLING_PLAN.md` §3 (F-SB1–F-SB9) dan §4 (D-SB1–D-SB10). Rantai di bawah tidak mengulang prosa rencana; setiap baris `FINDS`/`RULES` merujuk registry.

```text
MICROTASK: <one verb + one noun>
  EDIT:    <exact file(s)>
  FINDS:   <F-SB references>
  RULES:   <R-SB codes + existing invariants>
  DEPENDS: <entry dependency>
  OUTCOME: <one observable sentence>
  VERIFY:  <one falsifiable automated or executable check>
  DONE-IF: verify passes; only intended files changed
```

**Gate exit criteria (rantai ditutup bila semua terpenuhi):**

1. Sekolah dengan `metodePembayaran` terisi menghasilkan tagihan `tarif × pertemuan aktual`, dan sekolah tanpa field itu menghasilkan angka **identik** dengan sebelum chain ini (R-SB3).
2. Satu invoice menerima ≥ 2 pembayaran, menampilkan total / dibayar / sisa dengan benar, dan status `Lunas` berubah sendiri saat sisa ≤ 0 tanpa tombol manual.
3. Kurang bayar dan lebih bayar muncul sebagai baris tersendiri pada invoice berikutnya milik sekolah yang sama, dan tidak pernah lintas sekolah (R-SB6).
4. `sppPayments` tetap append-only: tidak ada satu pun jalur kode baru yang meng-update atau menghapus baris ledger (R-SB1).
5. Matriks privilese tidak berubah: `invoices` tetap superadmin-write, admin_cabang read-only (R-SB5).
6. Setiap microtask punya baris `Verified: <command> -> <result>`, dan §10 write-back tercatat di dokumen sumber.

> ✅ **ALL BLOCKERS RESOLVED 2026-09-16.** §9 Q1 (D-SB8), Q2 (D-SB10), Q3 (D-SB11), Q4 (D-SB12: dua kolom, field terpisah), Q5 (D-SB13) — semua Locked. Gate SB-A **dibuka**, tidak ada konfirmasi tersisa.

---

## Gate SB.A — Skema & rumus (tanpa perubahan UI)

### SB.A.1 Add payment-method schema

```text
MICROTASK: Add metodePembayaran to sekolah schema
  EDIT:    src/lib/constants.js (newSekolah), src/lib/__tests__/ (unit test baru)
  FINDS:   F-SB2; D-SB6, D-SB7, D-SB8
  RULES:   R-SB3, R-SB4; field lama sekolah.spp dipertahankan apa adanya; record lama tanpa field baru tetap valid (tidak ada migrasi destruktif)
  DEPENDS: resolved 2026-09-16 — §9 Q1 (D-SB8 Locked) & Q2 (D-SB10 Locked)
  OUTCOME: newSekolah() menghasilkan record dengan metodePembayaran default null, dan record lama tanpa field itu tetap lolos validasi entitas.
  VERIFY:  npm test -- constants -> record baru punya metodePembayaran: null; record lama (tanpa field) tidak melempar error di assertReferences()/validasi entitas
  DONE-IF: verify passes; only intended files changed
```

### SB.A.2 Implement per-meeting billing formula

```text
MICROTASK: Add per-meeting billing calculator
  EDIT:    src/lib/finance.js (fungsi baru billingForSekolah, belum dipakai UI), src/lib/__tests__/finance-billing.test.js (baru)
  FINDS:   F-SB1; D-SB5, D-SB7, D-SB13
  RULES:   R-SB2, R-SB3, R-SB4; absensi hanya dibaca, tidak pernah ditulis; sekolah tanpa metodePembayaran mengembalikan hasil rumus flat lama persis
  DEPENDS: SB.A.1
  OUTCOME: satu fungsi menghitung tagihan dari tarif per pertemuan × realisasi absensi untuk keempat trigger, dan jatuh ke rumus lama saat metode belum diisi (D-SB13: hanya trainerStatus 'Hadir'; pengganti = record Hadir baru).
  VERIFY:  npm test -- finance-billing -> keempat trigger (per_pertemuan, per_n_pertemuan, per_bulan, per_siklus_minggu) menghasilkan angka yang benar pada fixture; basis 'trainer' tidak mengalikan jumlah siswa; sekolah tanpa metodePembayaran menghasilkan angka identik dengan financialData() lama; Izin/Alpa tidak menagih, sesi pengganti (record Hadir baru) menagih
  DONE-IF: verify passes; only intended files changed
```

### SB.A.3 Prove historical-number invariance

```text
MICROTASK: Add regression guard for historical figures
  EDIT:    src/lib/__tests__/finance-regression.test.js (baru)
  FINDS:   F-SB1; D-SB7
  RULES:   R-SB3; fixture memakai bentuk data produksi (sekolah tanpa metodePembayaran)
  DEPENDS: SB.A.2
  OUTCOME: perubahan rumus terbukti tidak menggeser satu pun angka laporan untuk data yang sudah ada.
  VERIFY:  npm test -- finance-regression -> potensiSpp, pemasukanSpp, belumTertagih, totalBebanHonor, labaRugi pada fixture legacy sama persis sebelum dan sesudah SB.A.2
  DONE-IF: verify passes; only intended files changed
```

---

## Gate SB.B — Cicilan, pelunasan, dan carry-over

### SB.B.1 Add payment-source field

```text
MICROTASK: Add sumberDana to SPP payments
  EDIT:    src/features/payments/SppPaymentModal.jsx, src/lib/constants.js (factory pembayaran), server/validation/entities.php
  FINDS:   F-SB8; D-SB6, D-SB12
  RULES:   R-SB1, R-SB4; pembayaran lama tanpa sumberDana tetap valid dan diperlakukan sebagai 'sekolah'
  DEPENDS: SB.A.3
  OUTCOME: setiap pembayaran baru membawa asal dana (sekolah atau ortu langsung; D-SB12, kanal `metode` tetap independen), dan pembayaran historis tidak berubah.
  VERIFY:  npm test + php server/tests/entity.validation.php -> pembayaran dengan sumberDana valid diterima, nilai di luar enum ditolak 422, payload lama tanpa field tetap lolos
  DONE-IF: verify passes; only intended files changed
```

### SB.B.2 Derive invoice payment status

```text
MICROTASK: Compute invoice paid/outstanding from ledger
  EDIT:    src/lib/invoices.js (fungsi turunan baru), src/lib/__tests__/invoice-status.test.js (baru)
  FINDS:   F-SB4, F-SB5; D-SB8, D-SB9
  RULES:   R-SB1, R-SB2; status tidak pernah disimpan sebagai field yang bisa menyimpang; ledger tidak pernah diubah
  DEPENDS: SB.B.1 (D-SB8 Locked 2026-09-16)
  OUTCOME: untuk satu invoice, sistem dapat menghitung total, sudah dibayar, sisa, dan status Lunas/Belum Lunas murni dari ledger.
  VERIFY:  npm test -- invoice-status -> nol pembayaran = Belum Lunas sisa penuh; pembayaran sebagian = Belum Lunas dengan sisa benar; pembayaran penuh = Lunas sisa 0; pembayaran berlebih = Lunas dengan credit positif
  DONE-IF: verify passes; only intended files changed
```

### SB.B.3 Wire installment UI

```text
MICROTASK: Show installments and outstanding on invoice
  EDIT:    src/features/reports/InvoiceModal.jsx, src/features/reports/InvoiceTemplate.jsx, src/features/reports/AgingReport.jsx, src/lib/csv.js
  FINDS:   F-SB3, F-SB4; D-SB9, D-SB12
  RULES:   R-SB4, R-SB5; hapus tombol "Tandai Lunas" (status kini turunan); Draft→Terbit tetap manual; copy Indonesia mengikuti idiom yang ada
  DEPENDS: SB.B.2
  OUTCOME: invoice menampilkan total tagihan, jumlah dibayar, sisa, dan badge Lunas/Belum Lunas yang berubah sendiri setelah pembayaran dicatat; aging memakai dua kolom sumberDana (Sekolah vs Ortu langsung) per D-SB12.
  VERIFY:  npx playwright test tests/invoice-installment.spec.js --workers=1 -> catat 2 pembayaran parsial pada satu invoice, badge berubah Belum Lunas → Lunas tanpa klik manual; tombol "Tandai Lunas" tidak ada di DOM; aging menampilkan dua kolom (Sekolah vs Ortu langsung), CSV membawa kolom sumberDana
  DONE-IF: verify passes; only intended files changed
```

### SB.B.4 Implement carry-over lines

```text
MICROTASK: Carry outstanding and credit to next invoice
  EDIT:    src/lib/invoices.js (penyusun baris carry-over), src/features/reports/InvoiceModal.jsx
  FINDS:   F-SB7; D-SB3, D-SB11
  RULES:   R-SB2, R-SB6; carry-over wajib merujuk invoiceId asal; referensi lintas sekolah gagal keras; total invoice Terbit dibekukan
  DEPENDS: SB.B.3
  OUTCOME: invoice berikutnya pada sekolah yang sama menampilkan baris sisa tagihan atau kelebihan bayar dari invoice sebelumnya, lengkap dengan rujukan asal; penyimpanan absensi yang menyentuh rentang invoice Terbit memunculkan peringatan dan diteruskan ke invoice berikutnya (D-SB11).
  VERIFY:  npm test -- invoice-carryover -> kurang bayar muncul sebagai baris positif di invoice berikutnya; lebih bayar muncul sebagai baris negatif; percobaan carry-over ke sekolah berbeda ditolak; edit absensi pada periode Terbit memunculkan peringatan dan tidak mengubah total Terbit
  DONE-IF: verify passes; only intended files changed
```

---

## Gate SB.C — Form, rekonsiliasi jalur, dan write-back

### SB.C.1 Add payment-method form field

```text
MICROTASK: Add payment-method picker to school form
  EDIT:    src/features/schools/SchoolList.jsx (SchoolForm)
  FINDS:   F-SB2; D-SB2, D-SB6
  RULES:   R-SB4; mengikuti idiom form yang ada (RupiahInput untuk tarif, select untuk enum); tidak ada perubahan styling lain; copy Indonesia
  DEPENDS: SB.B.4
  OUTCOME: superadmin/admin cabang dapat memilih basis, tarif per pertemuan, pemicu penagihan, dan sumber dana langsung dari form Data Sekolah.
  VERIFY:  npx playwright test tests/sekolah-metode-pembayaran.spec.js --workers=1 -> isi metode, simpan, refresh, form ter-hydrate dengan nilai yang sama; sekolah lama tanpa metode tetap bisa dibuka dan disimpan
  DONE-IF: verify passes; only intended files changed
```

### SB.C.2 Reconcile the two invoice paths

```text
MICROTASK: Consolidate invoice creation paths
  EDIT:    server/lib/invoiceGenerator.php + server/api/invoices-generate.php (kanonik, D-SB10 Locked 2026-09-16); src/lib/invoices.js + src/features/reports/InvoiceModal.jsx (dijadikan pemanggil / dipensiunkan)
  FINDS:   F-SB6; D-SB10
  RULES:   R-SB2, R-SB5; satu jalur kanonik; jalur lain dipensiunkan atau menjadi pemanggil jalur kanonik; tidak ada invoice ganda untuk sekolah+periode yang sama
  DEPENDS: SB.C.1 (D-SB10 Locked 2026-09-16)
  OUTCOME: hanya ada satu sumber kebenaran untuk pembuatan invoice, dan bentuk payload-nya seragam (bentuk server: items[] per tarif, grandTotal, nomorInvoice AFS-YYYYMM-XXXX).
  VERIFY:  php server/tests/invoice.endpoint.php -> generate massal dan pembuatan via UI menghasilkan bentuk payload identik; generate dua kali untuk sekolah+periode sama tidak menghasilkan baris ganda
  DONE-IF: verify passes; only intended files changed
```

### SB.C.3 Record completion and correct stale claims

```text
MICROTASK: Write completion back to source docs
  EDIT:    docs/PRODUCTION_MILESTONES.md, docs/SCOPE_EXPANSION_MILESTONES.md, docs/SPP_BILLING_PLAN.md (status line)
  FINDS:   F-SB9; semua (taste #43 write-back)
  RULES:   R-SB7; klaim basi dikoreksi eksplisit (M3.4 "invoices ditunda" sudah tidak benar); baris manual tetap manual dengan pemilik dan slot bukti
  DEPENDS: SB.C.2
  OUTCOME: dokumen sumber mencerminkan keadaan sebenarnya, dan pembaca berikutnya tidak mengulang asumsi yang sudah usang.
  VERIFY:  document inspection: seluruh Gate exit criteria 1-6 tercentang; setiap microtask membawa baris Verified:; git status hanya menunjukkan perubahan dokumen yang dimaksud
  DONE-IF: verify passes; only intended files changed
```

---

## Ordering rationale

- **SB.A sebelum semuanya**: rumus dan skema adalah fondasi; membangun UI cicilan di atas rumus yang belum final berarti mengerjakan ulang nanti.
- **SB.A.3 sebagai gerbang keselamatan**: bukti angka historis tidak bergeser harus ada *sebelum* rumus baru menyentuh jalur yang dipakai UI.
- **SB.B.1 sebelum B.2**: status pelunasan membaca ledger; menambah field sumber dana setelah status dihitung berarti menyentuh jalur yang sama dua kali.
- **SB.B.2 sebelum B.3**: perhitungan turunan harus benar sebelum UI menampilkannya, agar kegagalan tes menunjuk ke logika, bukan tampilan.
- **SB.B.4 setelah B.3**: carry-over memerlukan konsep sisa/credit yang baru ada setelah B.2/B.3.
- **SB.C.1 setelah SB.B**: form baru hanya berguna kalau rumus di belakangnya sudah bekerja penuh.
- **SB.C.2 mendekati akhir**: konsolidasi dua jalur invoice adalah perubahan berisiko tinggi; dilakukan setelah semua perilaku baru terbukti hijau, bukan di tengah.
- **SB.C.3 terakhir**: write-back menyusun seluruh bukti VERIFY sebelumnya.

## Deferred with owners

| Item | Owner / resolving venue | Why deferred |
|---|---|---|
| Dashboard target/proyeksi + rekap akhir bulan | Chain berikutnya setelah SB-C | Bergantung pada rumus yang chain ini kunci; membangun lebih dulu berarti mengerjakan ulang |
| Penyederhanaan input & absensi trainer | Scope-expansion terpisah | Independen dari billing; tidak memblokir |
| Modul rapot / nilai / sertifikat | Modul baru, venue tersendiri | Setara besarnya dengan modul Absensi; bukan bagian billing |
| Export CSV seluruh transaksi | Chain laporan berikutnya | Sebagian sudah ada di FinanceReport; perluasan menunggu rumus final |
| Utang tes lama (16 kegagalan pre-existing) | HYGIENE chain | Dimiliki tempat lain; chain ini hanya menjamin tidak ada regresi baru |

## Follow-up fix gate SBF (2026-09-18, CLOSED)

Post–SB-C audit (`docs/SB_FOLLOWUP_FIX.md`, retired on close) fixed three gaps: print-template server-shape support, invoice-level payment validation (D-SB8 follow-up now implemented), installment spec on the canonical flow. Verified: `entity.validation.php -> all passed incl. SBF.2`; `invoice-installment.spec.js --workers=1 -> 1 passed, pageErrors 0`; `npm test -> 33/164`; `npm run build -> green`.
