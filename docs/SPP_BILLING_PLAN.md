# SPP & Billing Plan — tarif per pertemuan, cicilan, dan status pelunasan

**Status:** DRAFT 2026-09-16 — §9 Q1–Q5 + follow-up Q4 dijawab (D-SB8/D-SB10/D-SB11/D-SB12/D-SB13 Locked, aging dua kolom); Gate SB-A dibuka, tidak ada blocker tersisa. Belum ada microtask yang dieksekusi.
**Position:** Rantai perbaikan sementara untuk kesiapan fitur billing. Dokumen ini **tidak** menggantikan `PRODUCTION_PLAN.md` / `PRODUCTION_MILESTONES.md`, `SCOPE_EXPANSION_PLAN.md`, atau `RELEASE_HYGIENE_PLAN.md`. Saat Gate SB-C ditutup, §10 mencatat penyelesaian kembali ke dokumen sumber dan pasangan ini dilipat atau dipensiunkan.
**Trigger:** Catatan kebutuhan bisnis 2026-09-13 (metode pembayaran per sekolah, cicilan, carry-over, rekap) + tangkapan layar daftar metode pembayaran riil per sekolah mitra.
**Scope chain ini:** hanya **SPP & Pembayaran** (keputusan D-SB4). Dashboard/laporan lanjutan, absensi trainer yang disederhanakan, dan modul rapot **di luar** chain ini.

---

## 1. Context and inputs

- Rumus SPP saat ini **flat**: `targetSpp = jumlah siswa non-Trial × sekolah.spp` per periode bulanan (`src/lib/finance.js`, `financialData()`). Tidak ada konsep tarif per pertemuan, dan jumlah pertemuan aktual dari `absensi` tidak pernah masuk ke perhitungan SPP sama sekali.
- Realitas bisnis (catatan 2026-09-13): kalender akademik 15–16 pertemuan, sementara siklus penagihan dinormalisasi ke 12 minggu; sebagian sekolah menagih per 4 pertemuan, sebagian per bulan kalender, sebagian per pertemuan, dan sebagian berbasis trainer per pertemuan.
- Sistem invoice **sudah ada dan lebih lengkap dari yang tercatat di `PRODUCTION_MILESTONES.md` M3.4** (yang masih menyebut `invoices` sebagai "ditunda menunggu keputusan bisnis"): `src/lib/invoices.js` + `src/features/reports/InvoiceModal.jsx` sudah punya siklus status `Draft → Terbit → Lunas`, nomor resmi saat terbit, cetak via `InvoiceTemplate.jsx`, dan endpoint server `server/api/invoices.php` (CRUD, superadmin-only per `authorize.php`).
- `absensi` sudah menjadi sumber kebenaran untuk honor trainer (`attendanceStats()` → `trainerSessionCount`), jadi rantai "absensi → uang" sudah ada preseden yang bekerja — chain ini memperluasnya ke sisi SPP.
- Keputusan pengguna 2026-09-13 (lihat §4): margin AfterSchola nyata, metode pembayaran adalah properti sekolah, carry-over dibatasi per sekolah, prioritas SPP & pembayaran lebih dulu.

## 2. Goals and non-goals

**Goals**

1. Satu rumus dasar universal: `tagihan = tarif per pertemuan × jumlah pertemuan`, dengan jumlah pertemuan diambil dari realisasi `absensi`, bukan asumsi.
2. Metode/siklus penagihan tersimpan sebagai properti sekolah dan dipilih dari form Data Sekolah, sehingga perbedaan kesepakatan antar sekolah tidak lagi dihitung manual di luar sistem.
3. Satu invoice dapat menerima beberapa kali pembayaran (cicilan), dan menampilkan total tagihan, sudah dibayar, sisa, serta status Lunas/Belum Lunas yang **diturunkan dari ledger**, bukan ditandai manual.
4. Kurang bayar dan lebih bayar tidak hilang: keduanya terbawa ke invoice berikutnya pada sekolah yang sama sebagai baris tersendiri.
5. Sumber pembayaran (Sekolah → AfterSchola vs Orang tua → AfterSchola) terbedakan di data dan laporan.
6. Honor trainer tetap dihitung terpisah dari tagihan sekolah (ada margin), tidak pernah pass-through.

**Non-goals (tetap di luar chain ini)**

- Dashboard target/proyeksi & rekap akhir bulan otomatis — chain berikutnya, bergantung pada rumus yang chain ini kunci.
- Penyederhanaan input/absensi trainer ("setup sekali di awal") — independen, tidak memblokir chain ini.
- Modul rapot/nilai/sertifikat — modul baru utuh, venue terpisah.
- Perubahan matriks privilese (`authorize.php`) — invoice tetap superadmin-write, admin_cabang read-only.
- Perbaikan utang tes lama (16 kegagalan pre-existing) — tetap milik HYGIENE chain.

## 3. Findings registry (F-SB)

| ID | Finding | Evidence |
|---|---|---|
| F-SB1 | **Rumus SPP tidak mengenal pertemuan.** `financialData()` menghitung `targetSpp = siswaBilling.length × sch.spp`; tidak ada satu pun pembacaan `absensi` untuk sisi SPP (absensi hanya dipakai untuk `trainerSessionCount` → honor). | `src/lib/finance.js` (`sekolahFinance` map + `attendanceStats`) |
| F-SB2 | **Sekolah tidak punya field metode/siklus pembayaran.** `newSekolah()` hanya membawa `spp: 0` sebagai angka bulanan flat. | `src/lib/constants.js` `newSekolah()` |
| F-SB3 | **Total invoice memakai rumus flat, bukan realisasi.** `hargaSatuan = sekolah.spp × jumlah periode`, `total = jumlahSiswa × hargaSatuan`. Field `jumlahPertemuan` ada di form tapi **kosmetik** — labelnya sendiri menyebut "opsional, buat teks uraian" dan nilainya hanya masuk ke string uraian. | `src/features/reports/InvoiceModal.jsx` |
| F-SB4 | **Status `Lunas` adalah tombol manual, tidak terhubung ke ledger.** `advanceStatus()` memanggil `setInvoiceStatus(inv.id, 'Lunas')` tanpa membaca `sppPayments` sama sekali; tidak ada field jumlah dibayar/sisa pada invoice. | `src/features/reports/InvoiceModal.jsx` `advanceStatus()`; `src/lib/invoices.js` |
| F-SB5 | **Granularitas pembayaran dan invoice tidak sama.** `sppPayments` dicatat **per siswa** (`p.siswaId`, `p.periode`), sedangkan invoice diterbitkan **per sekolah** (`inv.sekolahId`). Tidak ada relasi `sppPayments → invoiceId`, sehingga "sudah dibayar berapa untuk invoice ini" tidak dapat dihitung tanpa aturan rekonsiliasi baru. | `src/features/students/StudentList.jsx` `sppTotalOf()`; `src/lib/constants.js` `assertReferences()` (`sppPayments.siswaId`, `invoices.sekolahId`) |
| F-SB6 | **Ada dua jalur pembuatan invoice yang paralel dan belum direkonsiliasi.** Jalur klien `src/lib/invoices.js` + `InvoiceModal` (dipakai UI hari ini) dan jalur server `server/lib/invoiceGenerator.php` + `server/api/invoices-generate.php` (generator massal per periode dengan `nomorInvoice` sendiri). Keduanya menulis ke entitas `invoices` yang sama dengan skema payload berbeda. | `src/lib/invoices.js`; `server/lib/invoiceGenerator.php`; `server/api/invoices-generate.php` |
| F-SB7 | **Tidak ada konsep carry-over / credit.** Tidak ada field sisa piutang maupun kelebihan bayar pada invoice maupun ledger; `computeSppLunas()` bersifat biner per periode. | `src/lib/constants.js` (`siswa.sppLunas` derived); `src/features/students/StudentList.jsx` `sppPaidForPeriode()` |
| F-SB8 | **Sumber pembayaran tidak dibedakan.** `newSppPayment`-equivalent tidak menyimpan asal dana; kasus Darul Tauhid (orang tua bayar langsung ke AfterSchola) tidak terbedakan dari pembayaran via sekolah. | `sppPayments` payload (`siswaId`, `periode`, `nominal`, `tanggal`, `diterimaOleh`) |
| F-SB9 | **Klaim dokumen sudah basi (taste #42).** `PRODUCTION_MILESTONES.md` M3.4 menyebut `invoices` sebagai entitas yang "sengaja ditunda, menunggu keputusan bisnis", padahal endpoint `invoices.php` sudah ada, berfungsi, dan terpakai UI. | `PRODUCTION_MILESTONES.md` M3.4 catatan vs `server/api/invoices.php` |

## 4. Decision set (D-SB) — terkunci dari jawaban pengguna 2026-09-13

| # | Decision | Status |
|---|---|---|
| D-SB1 | **Ada margin AfterSchola.** Tarif yang ditagihkan ke sekolah dan honor trainer adalah dua angka independen; tidak pernah pass-through. Honor tetap dihitung dari `trainer.honor × sesi hadir` seperti sekarang; tarif sekolah dihitung dari metode pembayaran sekolah. Margin adalah selisih turunan, bukan field yang diinput. | Locked |
| D-SB2 | **Metode pembayaran adalah properti sekolah, bukan siswa.** Semua siswa dalam satu sekolah mengikuti metode yang sama. Tidak ada override per siswa (menyederhanakan data dan menghindari rekonsiliasi campuran dalam satu invoice). | Locked |
| D-SB3 | **Carry-over dibatasi pada sekolah yang sama.** Sisa tagihan maupun kelebihan bayar hanya boleh terbawa ke invoice berikutnya milik sekolah yang sama. Tidak ada perpindahan credit lintas sekolah. | Locked |
| D-SB4 | **Prioritas chain: SPP & Pembayaran saja.** Dashboard/target/rekap, absensi trainer, dan rapot ditunda ke chain berikutnya dan tidak boleh masuk scope di sini. | Locked |
| D-SB5 | **Rumus dasar universal = tarif per pertemuan × pertemuan aktual.** Semua metode adalah varian *pemicu penagihan* di atas rumus yang sama, bukan rumus yang berbeda-beda. Jumlah pertemuan diambil dari `absensi` (realisasi), bukan asumsi kalender. | Locked |
| D-SB6 | **Bentuk field metode pembayaran (concrete pick).** Disimpan pada record sekolah sebagai objek:<br>`metodePembayaran: { basis: 'siswa'\|'trainer', tarifPerPertemuan: number, trigger: 'per_pertemuan'\|'per_n_pertemuan'\|'per_bulan'\|'per_siklus_minggu', jumlahN: number\|null, jumlahMinggu: number\|null, sumberDana: 'sekolah'\|'ortu' }`. Field lama `sekolah.spp` **dipertahankan** sebagai fallback untuk data historis (taste #11: tidak merusak kontrak yang ada) — lihat D-SB7. | Proposed |
| D-SB7 | **Strategi migrasi non-destruktif.** Sekolah yang belum punya `metodePembayaran` tetap dihitung dengan rumus flat lama (`spp × jumlah siswa`), sehingga laporan historis tidak berubah angka. Rumus baru hanya berlaku untuk sekolah yang metodenya sudah diisi. Tidak ada migrasi data yang menulis ulang angka keuangan lama. | Proposed |
| D-SB8 | **Rekonsiliasi tingkat sekolah (concrete pick (a), Locked 2026-09-16 Q1).** Pembayaran terhadap invoice dicatat di **tingkat sekolah**: row `sppPayments` membawa `invoiceId` + `sekolahId`, dengan `siswaId` opsional/null untuk pembayaran invoice-level. Baris per-siswa historis (tanpa `invoiceId`) tetap valid dan diagregasi via `sekolahId` + irisan `periode`. Follow-up implementasi: longgarkan `validateSppPayment` (`siswaId` boleh null bila `invoiceId` ada; `sekolahId` wajib sama dengan `invoice.sekolahId`, R-SB6) — dikerjakan di SB.B.1/SB.B.2. | Locked |
| D-SB9 | **Status invoice menjadi turunan, bukan tombol.** `Lunas`/`Belum Lunas` dihitung dari `jumlah dibayar ≥ total`, bukan dari `setInvoiceStatus()` manual. Status `Draft → Terbit` tetap manual (itu keputusan administratif, bukan keuangan). Tombol "Tandai Lunas" dihapus. | Proposed |
| D-SB10 | **Satu jalur pembuatan invoice (Locked 2026-09-16 Q2).** Jalur kanonik = **`server/lib/invoiceGenerator.php`** (+ `server/api/invoices-generate.php`); `src/lib/invoices.js` + `InvoiceModal` dijadikan pemanggil endpoint tersebut atau dipensiunkan. Payload diseragamkan ke bentuk server (`items[]` per tarif, `grandTotal`, `nomorInvoice` `AFS-YYYYMM-XXXX`, single periode `YYYY-MM`). Follow-up: mode semester/`periodeList` client dipetakan ke N invoice single-periode atau generator diperluas — diputuskan di SB.C.2. | Locked |
| D-SB11 | **Total dibekukan saat Terbit + peringatan (Locked 2026-09-16 Q3).** Total dibekukan saat `Terbit`; koreksi absensi yang menyentuh rentang invoice `Terbit` tidak mengubah invoice itu — masuk sebagai penyesuaian di invoice berikutnya via carry-over (SB.B.4). UI absensi wajib menampilkan peringatan saat menyimpan perubahan yang menyentuh periode Terbit ("Invoice periode ini sudah Terbit — perubahan masuk ke invoice berikutnya"). | Locked |
| D-SB12 | **Dua kolom per sumberDana, field terpisah (Locked 2026-09-16 Q4 + follow-up).** Laporan aging/piutang memakai **dua kolom**: `'Sekolah'` vs `'Ortu langsung'`; CSV membawa kolom `sumberDana`. `sumberDana` adalah **field sendiri** (`'sekolah'\|'ortu'`, default `'sekolah'` untuk histori), **tidak** dilipat ke `metode` — `metode` (kanal/penerima) tetap independen karena dimensinya ortogonal (ortu bisa `Tunai-Admin` maupun `Transfer`; sekolah bisa `Transfer` maupun `Tunai-Sekolah`) dan histori `metode` tak terpetakan (`'Transfer'`/`'Tunai'` tanpa asal — lih. `server/tests/reconcile.check.php:160`). Pembayaran luar kanal formal = baris ledger `sumberDana='ortu'` + `metode` apa adanya. | Locked |
| D-SB13 | **Hanya yang hadir yang menagih (Locked 2026-09-16 Q5).** Hanya absensi dengan `trainerStatus='Hadir'` yang dihitung ke `pertemuan_aktual`; `Izin`/`Alpa` tidak menagih dalam kondisi apa pun. Sesi pengganti dicatat sebagai record absensi **baru** dengan `Hadir`, bukan flip status record lama. Konsisten dengan `finance.js` (`==='Hadir'`) dan `TRAINER_STATUS_VALUES`. | Locked |

## 5. Rules (R-SB)

- **R-SB1** `sppPayments` tetap **append-only**. Cicilan adalah baris baru, bukan update baris lama. Koreksi dilakukan dengan baris koreksi, tidak pernah dengan mengubah atau menghapus baris historis (mengikuti invariant ledger yang sudah berlaku).
- **R-SB2** Tidak ada angka keuangan yang ditulis ganda. Status lunas, sisa, dan kelebihan bayar **selalu turunan** dari ledger + total invoice; tidak pernah disimpan sebagai field yang bisa menyimpang (taste: satu sumber kebenaran).
- **R-SB3** Perubahan rumus tidak boleh mengubah angka historis. Sekolah tanpa `metodePembayaran` dihitung persis seperti sebelumnya (D-SB7); setiap microtask yang menyentuh `finance.js` wajib membuktikan ini dengan tes regresi angka.
- **R-SB4** Satu concern per edit: skema data, rumus, UI form, UI invoice, dan rekonsiliasi adalah microtask terpisah. Tidak ada perubahan styling saat mengubah logika.
- **R-SB5** Otoritas server tidak dilonggarkan: `invoices` tetap superadmin-write / admin_cabang read-only; tidak ada peran yang diperluas sebagai jalan pintas.
- **R-SB6** Carry-over hanya boleh merujuk invoice pada `sekolahId` yang sama (D-SB3); pelanggaran referensi harus gagal keras, bukan diam-diam dilewati.
- **R-SB7** Bahasa verifikasi: `Verified: <command> -> <result>` / `Unverified: run <command>`. Setiap microtask membawa satu OUTCOME dan satu VERIFY yang falsifiable.

## 6. Rumus — bentuk final yang diusulkan

Basis tunggal, empat pemicu penagihan:

```text
pertemuan_aktual = COUNT(absensi WHERE sekolahId = X
                                 AND periode dalam rentang tagihan
                                 AND trainerStatus = 'Hadir')

basis 'siswa'   → tagihan = tarifPerPertemuan × pertemuan_aktual × jumlah siswa aktif non-Trial
basis 'trainer' → tagihan = tarifPerPertemuan × pertemuan_aktual        (tidak dikali jumlah siswa)
```

| `trigger` | Rentang tagihan | Kapan invoice dibuat |
|---|---|---|
| `per_pertemuan` | 1 pertemuan | setiap kali ada absensi baru |
| `per_n_pertemuan` | `jumlahN` pertemuan (mis. 4) | saat akumulasi pertemuan mencapai kelipatan `jumlahN` |
| `per_bulan` | 1 periode bulanan (`YYYY-MM`) | akhir bulan kalender, jumlah pertemuan menyesuaikan realisasi |
| `per_siklus_minggu` | `jumlahMinggu` minggu (mis. 12) | saat siklus selesai |

Honor trainer **tidak** mengikuti tabel ini; tetap `trainer.honor × sesi hadir` (D-SB1). Hanya `trainerStatus='Hadir'` yang dihitung ke `pertemuan_aktual`; sesi pengganti = record absensi baru dengan `Hadir`, bukan flip status (D-SB13). Margin = tagihan sekolah − honor terkait, dan hanya ditampilkan sebagai angka turunan di laporan.

## 7. Cicilan, sisa, dan kelebihan bayar

- **Total tagihan** = hasil §6, dibekukan pada invoice saat status `Terbit` (angka tidak boleh berubah lagi setelah terbit, meskipun absensi kemudian dikoreksi — koreksi masuk sebagai penyesuaian di invoice berikutnya) (D-SB11).
- **Sudah dibayar** = Σ `sppPayments` yang terekonsiliasi ke invoice tersebut (D-SB8).
- **Sisa** = `total − sudah dibayar`, jika positif.
- **Kelebihan (credit)** = `sudah dibayar − total`, jika positif.
- **Status** = `Lunas` bila `sisa ≤ 0`, selain itu `Belum Lunas` (D-SB9, D-SB11).
- **Peringatan**: penyimpanan absensi yang menyentuh rentang invoice `Terbit` memunculkan peringatan dan diteruskan ke invoice berikutnya, tidak mengubah invoice `Terbit` (D-SB11).
- Invoice berikutnya pada sekolah yang sama menampilkan baris tambahan: `Sisa tagihan periode sebelumnya (+)` atau `Kelebihan bayar periode sebelumnya (−)`, keduanya merujuk `invoiceId` asal agar jejaknya dapat ditelusuri (R-SB6).

## 8. Sumber dana (F-SB8)

`metodePembayaran.sumberDana` bernilai `'sekolah'` atau `'ortu'`. Kasus Darul Tauhid memakai `'ortu'`. Dampaknya terbatas pada pelabelan dan pemisahan di laporan/CSV — **tidak** mengubah rumus, tidak mengubah kepemilikan cabang, dan tidak membuat entitas baru. Piutang memakai dua kolom per `sumberDana` (`Sekolah` vs `Ortu langsung`) + kolom CSV; `sumberDana` field terpisah (bukan dilipat ke `metode`, yang dimensinya ortogonal dan historinya tak terpetakan); pembayaran luar kanal formal = baris ledger `sumberDana='ortu'` (D-SB12 Locked).

## 9. Pertanyaan — Q1–Q5 + follow-up Q4 dijawab 2026-09-16; tidak ada blocker tersisa

1. **Rekonsiliasi pembayaran (D-SB8). ✅ Answered 2026-09-16 → (a) tingkat sekolah.** Satu pembayaran tingkat sekolah terhadap invoice: row `sppPayments` membawa `invoiceId` + `sekolahId`, `siswaId` opsional/null untuk pembayaran invoice-level. Baris per-siswa historis tetap valid, diagregasi via `sekolahId` + irisan `periode`. Follow-up implementasi: longgarkan `validateSppPayment` (`siswaId` boleh null bila `invoiceId` ada; `sekolahId` wajib = `invoice.sekolahId`, R-SB6) — dikerjakan di SB.B.1/SB.B.2.
2. **Dua jalur invoice (F-SB6, D-SB10). ✅ Answered 2026-09-16 → kanonik `server/lib/invoiceGenerator.php`.** `src/lib/invoices.js` + `InvoiceModal` menjadi pemanggil endpoint (atau dipensiunkan); payload diseragamkan ke bentuk server. Follow-up: mode semester/`periodeList` client dipetakan ke N invoice single-periode atau generator diperluas — diputuskan di SB.C.2. Blocker SB-A/SB.B **dibuka**.
3. **Pembekuan total saat terbit (D-SB11). ✅ Answered 2026-09-16 → agreed + warning.** Total dibekukan saat `Terbit`; koreksi absensi yang menyentuh rentang invoice `Terbit` masuk sebagai penyesuaian di invoice berikutnya (SB.B.4) dan **tidak** mengubah invoice Terbit. Tambahan: UI absensi menampilkan peringatan saat menyimpan perubahan yang menyentuh periode Terbit.
4. **Laporan piutang (D-SB12). ✅ Answered 2026-09-16 → dua kolom; follow-up dijawab → field terpisah, jangan lipat ke `metode`.** Dua kolom (`Sekolah` vs `Ortu langsung`) + kolom CSV. Verdict *don't merge*: `metode` sudah mencampur kanal+penerima dan tidak divalidasi server sama sekali (`server/validation/entities.php:165-172` hanya cek `id`+`siswaId`; fixture `server/tests/reconcile.check.php:160` memakai `'Tunai'` yang bahkan di luar enum UI) — melipat dimensi ketiga (asal dana) ke dalamnya butuh tabel pemetaan enum→sumber plus migrasi nilai lama yang tak terpetakan (`'Transfer'` dari siapa?). Field terpisah default `'sekolah'` menjaga histori tetap valid (R-SB3) dan split jadi proyeksi murni.
5. **Pertemuan yang dihitung (D-SB13). ✅ Answered 2026-09-16 → hanya yang hadir; pengganti = record baru.** Hanya `trainerStatus = 'Hadir'` yang menagih; `Izin`/`Alpa` tidak menagih dalam kondisi apa pun. Sesi pengganti dicatat sebagai record absensi **baru** dengan `Hadir`, bukan flip status record lama. Konsisten dengan `finance.js` (`==='Hadir'`) dan `TRAINER_STATUS_VALUES`.

## 10. Completion recording (taste #43)

Saat Gate SB-C ditutup: perbarui `PRODUCTION_MILESTONES.md` (koreksi klaim basi M3.4 per F-SB9 + catatan DONE billing), `SCOPE_EXPANSION_MILESTONES.md` (baris SPP/invoice), dan header `src/lib/finance.js` (kontrak rumus baru). Chain berikutnya (dashboard/target/rekap) baru boleh dibuka setelah itu.

**Status Gate SB-C: DITUTUP (2026-09-17).** SB.B.4, SB.B.5, SB.C.1, SB.C.2 verified (lihat `SCOPE_EXPANSION_MILESTONES.md` Gate SB-C). SB.C.3 (dokumen ini) mencatat penyelesaian dan mengoreksi klaim basi M3.4 (`PRODUCTION_MILESTONES.md`). Chain berikutnya (dashboard/target/rekap, D-SB4) dapat dibuka.

## 11. Cross-references

- `docs/PRODUCTION_PLAN.md` — invariant keuangan (cash basis, ledger append-only, tidak ada derived finance writes)
- `docs/PRODUCTION_MILESTONES.md` M3.4 (klaim basi, F-SB9), M3.2 (validasi entitas)
- `docs/SCOPE_EXPANSION_PLAN.md` — aturan privilese & scope cabang
- Kode: `src/lib/finance.js`, `src/lib/invoices.js`, `src/lib/constants.js`, `src/features/reports/InvoiceModal.jsx`, `src/features/students/StudentList.jsx`, `server/api/invoices.php`, `server/lib/invoiceGenerator.php`
