# Absensi Tenaga Pengajar Plan — Instruktur & Asisten

**Status:** DRAFT — 2026-09-21  
**Position:** Rantai implementasi khusus untuk fitur Absensi Tenaga Pengajar. Dokumen ini menjadi sumber keputusan untuk skema data, relasi penugasan, alur pengisian absensi, hak akses, rekap, dan integrasi honor.  
**Scope:** Absensi Tenaga Pengajar (Instruktur + Asisten). Perhitungan honor baru diaktifkan pada Gate C dan tidak boleh mengubah jalur `honorPayments` yang sudah berjalan sebelum Gate C.

---

## 1. Context and inputs

- Website saat ini sudah mempunyai entitas `trainer`, data absensi kegiatan, serta pencatatan pembayaran honor trainer.
- Di operasional nyata terdapat **absensi khusus tenaga pengajar** yang berbeda dari absensi kegiatan/siswa yang sudah ada.
- Contoh rekap September 2026 berbentuk matriks:
  - baris = sekolah;
  - kolom = tanggal/hari;
  - isi sel = satu atau beberapa tenaga pengajar yang hadir pada sekolah tersebut;
  - label `I` = **Instruktur**;
  - label `A` = **Asisten**;
  - catatan tambahan dapat berupa `EXPO`, `Pengganti`, atau keterangan lain.
- Satu sekolah dapat memiliki lebih dari satu instruktur.
- Satu instruktur dapat mempunyai satu atau lebih asisten.
- Satu orang tenaga pengajar tetap menjadi satu entitas orang; pembeda instruktur/asisten disimpan pada `tipePengajar`.
- Honor per kedatangan sudah ditentukan ketika akun tenaga pengajar dibuat oleh Admin Cabang. Nilai contoh:
  - trainer senior: Rp100.000;
  - trainer baru: Rp75.000;
  - asisten: Rp50.000.
  Nilai tersebut **tidak di-hardcode** ke sistem; field honor pada akun menjadi sumber nilainya.
- Pengisian absensi dilakukan oleh masing-masing tenaga pengajar melalui akun sendiri.
- Admin Cabang mengelola data cabangnya dan dapat melakukan koreksi.
- Superadmin dapat mengelola seluruh cabang.
- Masing-masing tenaga pengajar hanya melihat ringkasan absensinya sendiri.
- Perhitungan honor dari absensi baru masuk pada **Gate C**, setelah fondasi data dan alur absensi terbukti stabil.

---

## 2. Goals and non-goals

### Goals

1. Menambahkan konsep **Tenaga Pengajar** yang mendukung dua tipe:
   - `instruktur`;
   - `asisten`.
2. Menyimpan honor per kedatangan pada orangnya, bukan pada sekolah atau hardcode berdasarkan tipe.
3. Mendukung relasi:
   - satu sekolah → banyak instruktur;
   - satu instruktur → banyak sekolah;
   - satu instruktur → banyak asisten;
   - satu asisten dapat ditugaskan sesuai relasi penugasan yang valid.
4. Menyediakan entitas **Penugasan** sebagai relasi eksplisit sekolah–instruktur–asisten.
5. Menyediakan entitas **Absensi Tenaga Pengajar** yang terpisah dari absensi kegiatan lama.
6. Memungkinkan tenaga pengajar mengisi absensi sendiri dari akun masing-masing.
7. Memungkinkan Admin Cabang dan Superadmin melihat, mengelola, dan mengoreksi absensi sesuai scope akses.
8. Menyediakan ringkasan absensi pribadi untuk tenaga pengajar.
9. Menghasilkan rekap matriks bulanan yang bentuknya mengikuti dokumen operasional: sekolah × tanggal, dengan nama tenaga pengajar + label `I`/`A` + keterangan.
10. Pada Gate C, menggunakan absensi tenaga pengajar sebagai sumber perhitungan honor per kedatangan tanpa mengganti mekanisme pembayaran honor yang sudah ada.

### Non-goals

- Tidak mengganti absensi siswa/kegiatan yang sudah ada.
- Tidak menghapus atau mengubah `honorPayments` sebelum Gate C.
- Tidak meng-hardcode Rp100.000/Rp75.000/Rp50.000 sebagai rumus honor.
- Tidak menjadikan huruf `I` sebagai status `Izin` atau `A` sebagai `Alpa`. `I/A` adalah **tipe/peran pengajar**.
- Tidak membuat akun terpisah untuk asisten. Asisten tetap menggunakan entitas tenaga pengajar yang sama.
- Tidak mengubah hak akses role secara global di luar kebutuhan fitur ini.

---

## 3. Findings registry (F-TA)

| ID | Finding | Evidence / impact |
|---|---|---|
| F-TA1 | Sistem belum mempunyai model khusus untuk absensi tenaga pengajar. | Absensi kegiatan yang ada belum cukup untuk merepresentasikan kehadiran instruktur/asisten per sekolah dan tanggal. |
| F-TA2 | Model `trainer` belum membedakan instruktur dan asisten secara eksplisit. | Rekap operasional membutuhkan label `I` dan `A`. |
| F-TA3 | Relasi sekolah–pengajar belum cukup eksplisit untuk kasus banyak instruktur + asisten. | Array sederhana tidak cukup untuk menjawab pasangan penugasan dengan konsisten. |
| F-TA4 | Satu sekolah dapat memiliki beberapa tenaga pengajar pada tanggal yang sama. | Satu record absensi harus mampu merepresentasikan lebih dari satu orang pada sekolah/tanggal yang sama, atau menggunakan record per orang dengan kunci unik yang tepat. |
| F-TA5 | Rekap operasional memakai tanggal sebagai kolom dan sekolah sebagai baris. | UI rekap perlu membangun matriks dari data absensi, bukan menyimpan matriks sebagai data utama. |
| F-TA6 | Honor berbeda antar orang. | Honor harus membaca `trainer.honor`/field honor tenaga pengajar, bukan enum nominal hardcode. |
| F-TA7 | Pengisian dilakukan oleh pemilik akun, sedangkan pengelolaan dilakukan Admin Cabang/Superadmin. | Ownership dan branch scope harus ditegakkan server-side. |
| F-TA8 | Absensi dapat mempunyai catatan khusus seperti `EXPO` dan `Pengganti`. | Keterangan harus menjadi field terpisah, bukan bagian dari status. |
| F-TA9 | Perhitungan honor belum boleh digabung ke implementasi awal. | Gate C menjadi batas integrasi keuangan agar tidak mengganggu sistem honor yang sudah stabil. |

---

## 4. Decision set (D-TA)

| # | Decision | Status |
|---|---|---|
| D-TA1 | Entitas orang tetap satu: `trainer`/Tenaga Pengajar. | Locked |
| D-TA2 | Tipe pengajar disimpan eksplisit sebagai `tipePengajar: 'instruktur' \| 'asisten'`. | Locked |
| D-TA3 | Label operasional `I` = Instruktur dan `A` = Asisten. Label ini bukan status absensi. | Locked |
| D-TA4 | Honor per kedatangan disimpan pada record orang dan diinput Admin Cabang saat membuat/mengelola akun. | Locked |
| D-TA5 | Nilai Rp100k/Rp75k/Rp50k hanya contoh bisnis, bukan enum/hardcode aplikasi. | Locked |
| D-TA6 | Relasi penugasan dibuat eksplisit melalui entitas Penugasan dengan bentuk dasar `{ sekolahId, trainerId, asistenId }`. `asistenId` bersifat **nullable** — satu instruktur boleh bertugas tanpa asisten. | Locked |
| D-TA7 | Absensi tenaga pengajar dibuat sebagai entitas terpisah dari `absensi` kegiatan lama. | Locked |
| D-TA8 | Record absensi menyimpan orang yang hadir, sekolah, tanggal, status, keterangan, cabang, dan periode. | Locked |
| D-TA9 | Status absensi menggunakan `Hadir \| Izin \| Alpa`. | Locked |
| D-TA10 | Keterangan seperti `EXPO`, `Pengganti`, dan `Lainnya` disimpan sebagai field keterangan, bukan status baru. | Locked |
| D-TA11 | Tenaga pengajar mengisi absensi sendiri dari dashboard masing-masing. | Locked |
| D-TA12 | Admin Cabang mengelola/koreksi absensi di cabangnya; Superadmin dapat mengelola/koreksi semua cabang. | Locked |
| D-TA13 | Tenaga pengajar hanya melihat ringkasan absensinya sendiri. | Locked |
| D-TA14 | Perhitungan honor dari absensi baru **boleh** masuk Gate C — tetapi apakah `finance.js`/honor benar-benar berpindah sumber ke `absensiPengajar` (vs tetap dari absensi kegiatan lama) **belum diputuskan**. Keputusan ini menunggu hasil validasi TA.C.2b (data absensi tenaga pengajar vs pencatatan manual September). | **Pending** |
| D-TA15 | Matriks bulanan dibangun dari record absensi dan dapat menampilkan beberapa pengajar dalam satu sel. | Locked |
| D-TA16 | Rekap matriks historis mengambil label `I`/`A` dari `trainer.tipePengajar` saat ini (bukan snapshot per record). Jika tipe pengajar seseorang berubah, label pada rekap lama ikut berubah mengikuti tipe terbaru. Ini risiko yang disadari, bukan bug — dievaluasi ulang bila perubahan tipe pengajar mulai sering terjadi. | Locked |

---

## 5. Data model

### 5.1 Tenaga Pengajar

Model existing `trainer` diperluas, bukan membuat entitas orang baru.

```text
trainer
{
  id,
  nama,
  tipePengajar: 'instruktur' | 'asisten',
  honor,
  sekolahIds / field existing lain yang tetap diperlukan,
  cabangId,
  ...
}
```

`honor` adalah nominal per kedatangan dan menjadi sumber nilai untuk Gate C.

### 5.2 Penugasan

Entitas baru untuk relasi eksplisit.

```text
penugasanPengajar
{
  id,
  sekolahId,
  trainerId,
  asistenId,
  cabangId,
  periodeMulai,
  periodeSelesai,
  aktif
}
```

Interpretasi:

- `trainerId` = instruktur utama;
- `asistenId` = asisten yang mendampingi instruktur tersebut. **Nullable** — satu baris penugasan boleh berupa instruktur solo tanpa asisten;
- satu sekolah dapat mempunyai banyak baris penugasan;
- satu instruktur dapat mempunyai banyak baris penugasan;
- satu asisten dapat muncul pada penugasan yang berbeda selama relasinya valid;
- `aktif` + rentang `periodeMulai`/`periodeSelesai` menentukan apakah penugasan itu **valid untuk tanggal absensi tertentu**. Penulisan absensi (§7, TA.B.2) wajib mengecek bahwa tanggal absensi jatuh di dalam rentang penugasan yang `aktif = true`, bukan hanya mengecek bahwa sekolah pernah ditugaskan.

Jika kebutuhan implementasi akhirnya membutuhkan pasangan yang lebih fleksibel, field relasi boleh diperluas, tetapi tidak boleh menghilangkan identitas sekolah + orang yang ditugaskan.

### 5.3 Absensi Tenaga Pengajar

```text
absensiPengajar
{
  id,
  trainerId,
  sekolahId,
  tanggal,
  periode,
  status: 'Hadir' | 'Izin' | 'Alpa',
  keterangan: 'EXPO' | 'Pengganti' | 'Lainnya' | null,
  catatan: string | null,
  cabangId,
  createdAt,
  updatedAt
}
```

Record harus merepresentasikan **satu orang pada satu sekolah pada satu tanggal**. Jika ada tiga orang pada sekolah yang sama di tanggal yang sama, terdapat tiga record orang yang berbeda.

Matriks hanya merupakan view/reka ulang dari record tersebut.

---

## 6. Attendance semantics

### Peran

- `I` = Instruktur
- `A` = Asisten

### Status

- `Hadir`
- `Izin`
- `Alpa`

### Keterangan

Contoh:

- `EXPO`
- `Pengganti`
- `Lainnya`

Contoh tampilan satu sel:

```text
Widia (I)
Asyifa (A)
```

atau:

```text
Widia (I) — EXPO
Ira (A)
```

Nama + tipe harus berasal dari data trainer, bukan diketik bebas oleh pengguna.

---

## 7. Access model

### Trainer / Asisten

Boleh:

- melihat sekolah/penugasan yang menjadi tanggung jawabnya;
- mengisi absensinya sendiri;
- melihat riwayat dan ringkasan absensinya sendiri.

Tidak boleh:

- mengisi absensi orang lain;
- mengubah absensi orang lain;
- melihat ringkasan absensi tenaga pengajar lain;
- memindahkan penugasan dirinya sendiri.

### Admin Cabang

Boleh:

- melihat absensi tenaga pengajar di cabangnya;
- membuat/koreksi absensi sesuai kewenangan;
- melihat rekap matriks cabangnya;
- mengelola penugasan cabangnya;
- mengelola tipe pengajar dan honor pada akun tenaga pengajar sesuai kewenangan yang sudah berlaku.

Tidak boleh:

- membaca/mengubah data cabang lain.

### Superadmin

Boleh:

- melihat semua cabang;
- mengelola dan mengoreksi seluruh absensi;
- mengelola penugasan;
- melihat rekap lintas cabang;
- melakukan filter cabang/periode/sekolah/pengajar.

---

## 8. UI concept

### 8.1 Dashboard Tenaga Pengajar

Menu baru:

- **Absensi Saya**
- **Riwayat Absensi**
- **Rekap Saya**

Form pengisian minimal:

- tanggal;
- sekolah;
- status;
- keterangan;
- catatan bila diperlukan.

Sekolah hanya berasal dari penugasan yang valid.

### 8.2 Dashboard Admin Cabang / Superadmin

Menu pengelolaan:

- **Absensi Tenaga Pengajar**
- **Penugasan Pengajar**
- **Rekap Absensi Pengajar**

Filter:

- periode/bulan;
- cabang;
- sekolah;
- tenaga pengajar;
- tipe pengajar;
- status.

### 8.3 Rekap Matriks

Format utama mengikuti kebutuhan operasional:

| No | Nama Sekolah | Tgl 1 | Tgl 2 | Tgl 3 | ... |
|---|---|---|---|---|---|
| 1 | SD Tridaya | | Widia (I) | Asyifa (A) | ... |

Tanggal menjadi kolom dinamis sesuai periode yang dipilih.

Satu sel dapat berisi banyak tenaga pengajar.

---

## 9. Honor integration — Gate C only, keputusan pending

Sebelum Gate C:

- absensi tenaga pengajar hanya menjadi sumber data operasional;
- jangan mengubah `financialData()`/`honorPayments`;
- jangan membuat nominal honor baru dari hardcode tipe.

**Gate C tidak otomatis berarti "honor pasti dipindah ke absensi tenaga pengajar".** Sebelum TA.C.3 (integrasi honor) dieksekusi, harus ada checkpoint validasi eksplisit (lihat TA.C.2b pada dokumen milestone): data absensi tenaga pengajar dibandingkan dengan pencatatan manual September 2026, dan baru setelah itu diputuskan apakah sumber perhitungan honor benar-benar berpindah, atau tetap memakai absensi kegiatan lama. D-TA14 berstatus **Pending** sampai checkpoint ini disetujui.

Jika checkpoint disetujui, pada Gate C:

```text
honor = absensiPengajar(status = Hadir) × trainer.honor
```

Per orang dan per periode.

Status `Izin` dan `Alpa` tidak menghasilkan honor kedatangan.

Keterangan `EXPO`/`Pengganti` tidak otomatis mengubah nominal; perlakuan finansial baru diputuskan dan diuji pada Gate C.

Integrasi harus tetap menjaga audit trail dan invariant ledger yang sudah berlaku pada `honorPayments`.

---

## 10. Rules (R-TA)

- **R-TA1** — Satu orang = satu entitas tenaga pengajar; jangan membuat entity `asisten` terpisah.
- **R-TA2** — `I/A` adalah tipe pengajar, sedangkan `Hadir/Izin/Alpa` adalah status absensi.
- **R-TA3** — Honor selalu membaca field honor orang tersebut; tidak ada nominal hardcode berdasarkan tipe.
- **R-TA4** — Absensi adalah ledger operasional; koreksi harus mengikuti pola audit yang sudah digunakan sistem.
- **R-TA5** — Matriks rekap adalah derived view, bukan source of truth.
- **R-TA6** — Trainer/asisten hanya boleh menulis absensinya sendiri.
- **R-TA7** — Server tetap menjadi sumber enforcement untuk branch scope dan ownership.
- **R-TA8** — Penugasan harus valid **dan aktif untuk tanggal yang dipilih** (sesuai `periodeMulai`/`periodeSelesai`/`aktif`) sebelum sekolah dapat dipilih pada form absensi.
- **R-TA9** — Satu sekolah boleh memiliki banyak pengajar pada tanggal yang sama.
- **R-TA10** — Setiap microtask mempunyai satu outcome dan satu verify yang falsifiable.
- **R-TA11** — Gate C adalah satu-satunya gate yang boleh mengubah jalur perhitungan honor berdasarkan absensi baru, **dan hanya boleh dieksekusi setelah checkpoint keputusan bisnis TA.C.2b disetujui secara eksplisit**.
- **R-TA12** — Implementasi baru tidak boleh mengubah angka historis `honorPayments` tanpa bukti regresi eksplisit.
- **R-TA13** — `asistenId` pada Penugasan bersifat nullable; validator tidak boleh menolak penugasan instruktur tanpa asisten.
- **R-TA14** — Label `I`/`A` pada rekap matriks selalu mengikuti `trainer.tipePengajar` terkini (bukan snapshot), sesuai D-TA16; ini bukan bug dan tidak boleh "diperbaiki" tanpa keputusan eksplisit untuk menambah field snapshot.

---

## 11. Gate exit criteria

Rantai dianggap selesai jika:

1. Trainer dan asisten dapat dibedakan secara eksplisit sebagai `instruktur`/`asisten`.
2. Satu sekolah dapat mempunyai banyak instruktur dan asisten tanpa data duplikat atau relasi ambigu.
3. Penugasan sekolah–instruktur–asisten dapat dibuat, dibaca, dan divalidasi.
4. Trainer/asisten dapat mengisi absensi dirinya sendiri.
5. Trainer/asisten tidak dapat mengubah atau membaca absensi milik orang lain.
6. Admin Cabang hanya dapat mengelola cabangnya.
7. Superadmin dapat mengelola seluruh cabang.
8. Absensi menyimpan tanggal, sekolah, orang, status, keterangan, cabang, dan periode.
9. Rekap matriks September/periodik dapat menghasilkan bentuk yang setara dengan tabel operasional.
10. Satu sekolah + satu tanggal dapat menampilkan banyak tenaga pengajar.
11. Ringkasan pribadi tenaga pengajar hanya menampilkan data miliknya.
12. Checkpoint keputusan bisnis (TA.C.2b) disetujui secara eksplisit sebelum Gate C dieksekusi; jika disetujui, Gate C menghitung honor berdasarkan `Hadir × trainer.honor` tanpa hardcode nominal.
13. Jalur `honorPayments` yang sudah ada tetap lolos regresi.
14. Setiap microtask mempunyai bukti `Verified:`.
15. Dokumen sumber diperbarui setelah chain selesai.

---

## 12. Deferred with owners

| Item | Owner / resolving venue | Why deferred |
|---|---|---|
| Perhitungan honor absensi pengajar | Gate C | Menunggu fondasi absensi stabil agar tidak mengganggu `honorPayments` yang sudah selesai |
| Dashboard proyeksi/target honor | Chain laporan berikutnya | Bergantung pada rumus honor Gate C |
| Export CSV lanjutan | Chain laporan | Bisa memakai derived matrix setelah kontrak data stabil |
| Rapot/nilai/sertifikat | Modul terpisah | Bukan bagian absensi pengajar |
| Perubahan privilege global | Scope/security chain | Fitur ini hanya menambah rule spesifik, bukan merombak matriks role |

---

## 13. Cross-references

- `docs/PRODUCTION_PLAN.md`
- `docs/PRODUCTION_MILESTONES.md`
- `docs/SCOPE_EXPANSION_PLAN.md`
- `docs/SCOPE_EXPANSION_MILESTONES.md`
- `src/lib/constants.js`
- `src/lib/store.js`
- `src/lib/finance.js`
- `src/features/...` untuk dashboard trainer/admin
- `server/api/read.php`
- `server/api/_master.php`
- `server/authorize.php`
- `server/validation/entities.php`