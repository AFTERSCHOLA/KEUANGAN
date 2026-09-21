# Absensi Tenaga Pengajar Milestones — Microtask Chain (TA.A → TA.D)

**Companion to `docs/TRAINER_ATTENDANCE_PLAN.md`.**  
Memecah implementasi Absensi Tenaga Pengajar menjadi microtask yang berurutan. Setiap microtask harus VERIFY sebelum microtask berikutnya dimulai. Kegagalan menjadi follow-up terbatas dan tidak otomatis memperlebar scope.

**Source of truth:** `TRAINER_ATTENDANCE_PLAN.md` §3 (F-TA1–F-TA9), §4 (D-TA1–D-TA16), dan §10 (R-TA1–R-TA14).

**Catatan status:** D-TA14 (sumber perhitungan honor) berstatus **Pending** sampai microtask TA.C.2b disetujui secara eksplisit — lihat Gate TA.C di bawah.

---

## Gate exit criteria

Rantai ditutup bila seluruh kriteria berikut terpenuhi:

1. `trainer` mendukung `tipePengajar = instruktur | asisten`.
2. Honor tetap merupakan field per orang dan tidak di-hardcode berdasarkan tipe.
3. Entitas Penugasan dapat menghubungkan sekolah, instruktur, dan asisten (`asistenId` nullable — instruktur solo tanpa asisten harus tetap valid).
4. Satu sekolah dapat memiliki banyak instruktur dan asisten.
5. Absensi tenaga pengajar terpisah dari `absensi` kegiatan lama.
6. Trainer/asisten dapat membuat absensi untuk dirinya sendiri.
7. Trainer/asisten tidak dapat menulis atau membaca data absensi tenaga pengajar lain.
8. Admin Cabang hanya melihat/mengelola data cabangnya.
9. Superadmin dapat melihat/mengelola seluruh cabang.
10. Rekap matriks per bulan menampilkan sekolah sebagai baris dan tanggal sebagai kolom.
11. Satu sel dapat memuat lebih dari satu tenaga pengajar dengan label `I`/`A`.
12. Ringkasan pribadi trainer/asisten hanya menghitung data orang tersebut.
13. Checkpoint keputusan bisnis TA.C.2b disetujui eksplisit sebelum TA.C.3 dijalankan; jika disetujui, Gate C menghitung honor dari `Hadir × trainer.honor`.
14. `honorPayments` dan laporan lama tetap lolos regression check.
15. Setiap microtask mempunyai `VERIFY`.
16. Completion write-back tercatat pada dokumen sumber.

---

# Gate TA.A — Model tenaga pengajar & penugasan

### TA.A.1 Add trainer type

```text
MICROTASK: Add trainer type

EDIT: src/lib/constants.js, src/lib/__tests__/constants*.test.js,
      server/validation/entities.php, server/tests/entity.validation.php

FINDS: F-TA2; D-TA1, D-TA2, D-TA3, D-TA5

RULES: R-TA1, R-TA2, R-TA3; tipe hanya instruktur/asisten;
       honor tetap angka per orang; nilai nominal tidak di-hardcode

DEPENDS: none

OUTCOME: record trainer baru mempunyai tipePengajar yang valid dan trainer lama
         tanpa field baru tetap dapat dibaca.

VERIFY: npm test -- constants
        + php server/tests/entity.validation.php
        -> instruktur/asisten diterima; tipe lain ditolak;
        trainer lama tetap valid.

DONE-IF: verify passes; only intended files changed
```

### TA.A.2 Add assignment schema

```text
MICROTASK: Add trainer assignment schema

EDIT: src/lib/constants.js, src/lib/store.js,
      server/validation/entities.php, server/api/_master.php,
      tests baru untuk referensi penugasan

FINDS: F-TA3; D-TA6

RULES: R-TA1, R-TA8, R-TA9

DEPENDS: TA.A.1

OUTCOME: sistem dapat menyimpan relasi sekolah–instruktur–asisten
         tanpa membuat entity orang baru untuk asisten.

VERIFY: test assignment:
        -> satu sekolah dapat mempunyai >1 penugasan;
        -> satu instruktur dapat mempunyai >1 sekolah;
        -> satu instruktur dapat mempunyai >1 asisten;
        -> instruktur tanpa asisten (asistenId = null) tetap valid;
        -> referensi sekolah/trainer yang tidak ada ditolak.

DONE-IF: verify passes; only intended files changed
```

### TA.A.3 Enforce assignment scope

```text
MICROTASK: Enforce assignment scope

EDIT: server/authorize.php, server/validation/entities.php,
      server/api/read.php, endpoint tests

FINDS: F-TA3, F-TA7; D-TA11, D-TA12, D-TA13

RULES: R-TA6, R-TA7, R-TA8

DEPENDS: TA.A.2

OUTCOME: server dapat menentukan apakah trainer/asisten berhak
         melihat/mengubah penugasan dan sekolah tertentu.

VERIFY: php server/tests/endpoint.protection.php
        -> trainer hanya mendapat assignment miliknya;
        -> admin_cabang hanya cabangnya;
        -> superadmin semua;
        -> trainer tidak dapat memakai ID orang lain untuk bypass scope.

DONE-IF: verify passes; only intended files changed
```

---

# Gate TA.B — Absensi tenaga pengajar

### TA.B.1 Add attendance schema

```text
MICROTASK: Add trainer attendance schema

EDIT: src/lib/constants.js, server/validation/entities.php,
      server/api/_master.php, server/api/read.php,
      server/tests/entity.validation.php

FINDS: F-TA1, F-TA8; D-TA7, D-TA8, D-TA9, D-TA10

RULES: R-TA2, R-TA4, R-TA5

DEPENDS: TA.A.3

OUTCOME: absensiPengajar dapat menyimpan trainerId, sekolahId, tanggal,
         periode, status, keterangan, cabangId, dan audit metadata.

VERIFY: php server/tests/entity.validation.php
        + unit test factory
        -> status Hadir/Izin/Alpa valid;
        -> keterangan EXPO/Pengganti/Lainnya valid;
        -> trainerId/sekolahId/cabangId wajib valid.

DONE-IF: verify passes; only intended files changed
```

### TA.B.2 Add self-attendance write

```text
MICROTASK: Add self attendance write

EDIT: src/lib/store.js, trainer attendance API flow,
      server/authorize.php, endpoint protection tests

FINDS: F-TA7; D-TA11, D-TA13

RULES: R-TA6, R-TA7, R-TA8

DEPENDS: TA.B.1

OUTCOME: trainer/asisten dapat menyimpan absensi dirinya sendiri
         hanya untuk sekolah yang valid menurut penugasannya DAN
         hanya jika tanggal absensi jatuh di dalam rentang penugasan
         yang aktif (periodeMulai/periodeSelesai/aktif=true).

VERIFY: endpoint test:
        -> trainer A create absensi trainer A = allowed;
        -> trainer A create absensi trainer B = 403;
        -> trainer A memakai sekolah di luar assignment = 403;
        -> trainer A memakai tanggal di luar rentang penugasan aktif
           (atau penugasan aktif=false) = 403.

DONE-IF: verify passes; only intended files changed
```

### TA.B.3 Build trainer attendance form

```text
MICROTASK: Build trainer attendance form

EDIT: src/features/.../TrainerAttendance*.jsx,
      dashboard trainer navigation, related tests

FINDS: F-TA4, F-TA8; D-TA9, D-TA10, D-TA11

RULES: R-TA2, R-TA8; copy Indonesia mengikuti UI existing;
       sekolah berasal dari assignment, bukan input bebas

DEPENDS: TA.B.2

OUTCOME: trainer/asisten dapat mengisi tanggal, sekolah, status,
         keterangan, dan catatan dari dashboard sendiri.

VERIFY: npx playwright test tests/trainer-attendance-form.spec.js --workers=1
        -> form tampil;
        -> sekolah hanya assignment valid;
        -> Hadir/Izin/Alpa dapat disimpan;
        -> EXPO/Pengganti/Lainnya tersimpan.

DONE-IF: verify passes; only intended files changed
```

### TA.B.4 Build admin attendance management

```text
MICROTASK: Build admin attendance management

EDIT: src/features/.../TrainerAttendanceAdmin*.jsx,
      navigation role admin_cabang/superadmin,
      related tests

FINDS: F-TA7; D-TA12

RULES: R-TA7, R-TA9

DEPENDS: TA.B.3

OUTCOME: Admin Cabang dapat melihat dan mengoreksi absensi cabangnya,
         sedangkan Superadmin dapat mengelola seluruh data.

VERIFY: npx playwright test tests/trainer-attendance-admin.spec.js --workers=1
        -> admin cabang tidak melihat cabang lain;
        -> superadmin melihat semua;
        -> koreksi tersimpan dan terbaca kembali.

DONE-IF: verify passes; only intended files changed
```

---

# Gate TA.C — Rekap pribadi, matriks, dan honor

### TA.C.1 Build personal attendance summary

```text
MICROTASK: Build personal attendance summary

EDIT: src/features/.../TrainerAttendanceSummary*.jsx,
      trainer dashboard tests

FINDS: F-TA4, F-TA5; D-TA13, D-TA15

RULES: R-TA5, R-TA6

DEPENDS: TA.B.4

OUTCOME: trainer/asisten dapat melihat total hadir/izin/alpa,
         daftar sekolah, dan riwayat absensinya sendiri.

VERIFY: npx playwright test tests/trainer-attendance-summary.spec.js --workers=1
        -> akun trainer A tidak menampilkan record trainer B;
        -> total status sesuai fixture;
        -> filter periode mengubah data sesuai periode.

DONE-IF: verify passes; only intended files changed
```

### TA.C.2 Build monthly attendance matrix

```text
MICROTASK: Build monthly attendance matrix

EDIT: src/lib/.../trainerAttendance*.js,
      src/features/.../TrainerAttendanceRecap*.jsx,
      matrix/reports tests

FINDS: F-TA4, F-TA5; D-TA15

RULES: R-TA5, R-TA9, R-TA10

DEPENDS: TA.C.1

OUTCOME: rekap bulanan berbentuk sekolah × tanggal,
         dan satu sel dapat memuat beberapa tenaga pengajar
         dengan label I/A serta keterangan.

VERIFY: fixture September 2026:
        -> SD Tridaya pada tanggal terkait menampilkan Widia (I)
           dan Asyifa (A);
        -> SDN 037 Sabang dapat menampilkan banyak pengajar
           dalam satu tanggal;
        -> tanggal kosong tetap menjadi kolom;
        -> urutan tanggal mengikuti periode.

DONE-IF: verify passes; only intended files changed
```

### TA.C.2b Business decision checkpoint — validasi & sign-off sumber honor

```text
MICROTASK: Business decision checkpoint before honor integration

EDIT: docs/TRAINER_ATTENDANCE_PLAN.md (update status D-TA14),
      dokumen validasi (mis. docs/TA_C2B_VALIDATION.md — perbandingan
      rekap matriks vs pencatatan manual September 2026),
      tidak ada perubahan kode produksi pada microtask ini

FINDS: F-TA9; D-TA14

RULES: R-TA11; keputusan ini TIDAK boleh diasumsikan/ditebak,
       harus eksplisit disetujui sebelum TA.C.3 dimulai

DEPENDS: TA.C.2

OUTCOME: (a) rekap matriks bulanan dari absensiPengajar dibandingkan
         baris-per-baris dengan pencatatan manual September 2026 dan
         selisihnya didokumentasikan; (b) keputusan eksplisit diambil
         dan dicatat: apakah finance.js/honor berpindah sumber ke
         absensiPengajar, atau tetap memakai absensi kegiatan lama;
         (c) D-TA14 di TRAINER_ATTENDANCE_PLAN.md diupdate dari
         "Pending" menjadi "Locked" dengan hasil keputusannya.

VERIFY: document inspection:
        -> perbandingan matriks vs pencatatan manual September
           terlampir dengan hasil match/selisih;
        -> keputusan sumber honor tertulis eksplisit (bukan implisit);
        -> D-TA14 berstatus Locked dengan keputusan final tercatat.

DONE-IF: verify passes; jika keputusan = "tidak berpindah", maka
         TA.C.3 dan TA.C.4 di bawah ini dianggap tidak diperlukan
         dan chain dapat ditutup dari TA.C.2b langsung ke TA.D.1.
```

### TA.C.3 Integrate attendance into honor calculation

```text
MICROTASK: Integrate attendance honor calculation

EDIT: src/lib/finance.js, related honor calculation tests,
      PaymentTable only where required

FINDS: F-TA6, F-TA9; D-TA4, D-TA5, D-TA14

RULES: R-TA3, R-TA11, R-TA12;
       honor = jumlah Hadir × trainer.honor;
       tidak ada hardcode 100k/75k/50k

DEPENDS: TA.C.2b (hanya dijalankan jika keputusan checkpoint = "berpindah ke absensiPengajar")

OUTCOME: Gate C menghubungkan absensi tenaga pengajar dengan
         perhitungan honor per kedatangan tanpa mengganti kontrak
         pembayaran honor yang sudah berjalan.

VERIFY: npm test -- finance/honor
        -> trainer senior dengan honor 100000 dan 2 Hadir = 200000;
        -> trainer baru dengan honor 75000 dan 2 Hadir = 150000;
        -> asisten dengan honor 50000 dan 2 Hadir = 100000;
        -> Izin/Alpa = 0;
        -> perubahan honor orang tidak mempengaruhi orang lain;
        -> regression test jalur honorPayments tetap hijau.

DONE-IF: verify passes; only intended files changed
```

### TA.C.4 Verify honor/payment boundary

```text
MICROTASK: Verify honor payment boundary

EDIT: tests finance/payment + PaymentTable bila diperlukan

FINDS: F-TA6, F-TA9

RULES: R-TA11, R-TA12

DEPENDS: TA.C.3

OUTCOME: absensi menentukan beban honor, sedangkan pembayaran aktual
         tetap berasal dari ledger honorPayments dan tidak tercampur.

VERIFY: npm test
        -> attendance-based beban berubah sesuai absensi;
        -> honorPayments tetap menjadi sumber pembayaran;
        -> tidak ada double-counting;
        -> PaymentTable tetap menampilkan Beban/Dibayar/Sisa dengan benar.

DONE-IF: verify passes; only intended files changed
```

---

# Gate TA.D — Hardening, audit, dan write-back

### TA.D.1 Add regression/security coverage

```text
MICROTASK: Add trainer attendance regression

EDIT: server/tests/*, src/lib/__tests__/*,
      tests/* terkait absensi tenaga pengajar

FINDS: F-TA1–F-TA9

RULES: R-TA4, R-TA6, R-TA7, R-TA12

DEPENDS: TA.C.4

OUTCOME: kontrak data, akses, matriks, dan honor terlindungi oleh
         automated regression checks.

VERIFY: php server/tests/entity.validation.php
        + php server/tests/endpoint.protection.php
        + npm test
        + npx playwright test tests/trainer-attendance*.spec.js --workers=1

DONE-IF: verify passes; only intended files changed
```

### TA.D.2 Record completion and update source docs

```text
MICROTASK: Write completion back to source docs

EDIT: docs/TRAINER_ATTENDANCE_PLAN.md,
      docs/TRAINER_ATTENDANCE_MILESTONES.md,
      docs/PRODUCTION_MILESTONES.md,
      docs/SCOPE_EXPANSION_MILESTONES.md

FINDS: semua F-TA references

RULES: R-TA10; setiap microtask harus punya Verified:
       <command> -> <result>

DEPENDS: TA.D.1

OUTCOME: dokumen mencerminkan implementasi yang benar-benar selesai,
         termasuk batas Gate C dan keputusan final yang sudah terbukti.

VERIFY: document inspection:
        -> semua gate exit criteria tercentang;
        -> setiap microtask memiliki VERIFY/hasil;
        -> git diff hanya berisi perubahan yang dimaksud.

DONE-IF: verify passes; only intended files changed
```

---

## Ordering rationale

- **TA.A sebelum TA.B:** absensi tidak boleh dibangun sebelum identitas instruktur/asisten dan penugasan jelas.
- **TA.A.2 sebelum TA.A.3:** authorization membutuhkan relasi penugasan yang sudah pasti.
- **TA.B.1 sebelum UI:** kontrak data dan validation harus stabil sebelum form dibuat.
- **TA.B.2 sebelum TA.B.3:** server harus menegakkan ownership lebih dulu agar UI tidak menjadi satu-satunya pengaman.
- **TA.B.4 setelah self-write:** admin management membaca kontrak absensi yang sama dengan trainer.
- **TA.C.1 sebelum TA.C.2:** summary pribadi memastikan filter/ownership benar sebelum data diproyeksikan menjadi matriks.
- **TA.C.2 sebelum TA.C.2b:** checkpoint validasi butuh matriks bulanan yang sudah bisa digenerate untuk dibandingkan dengan pencatatan manual.
- **TA.C.2b sebelum TA.C.3:** integrasi honor ke `finance.js` tidak boleh dimulai sebelum ada keputusan bisnis eksplisit bahwa sumber honor memang berpindah ke `absensiPengajar` — ini bukan asumsi otomatis dari selesainya Gate B.
- **TA.C.3 sebelum TA.C.4:** setelah formula honor masuk, batas antara beban honor dan pembayaran aktual harus diuji.
- **TA.D terakhir:** hardening dan write-back hanya dilakukan setelah semua perilaku utama terbukti.

---

## Deferred with owners

| Item | Owner / resolving venue | Why deferred |
|---|---|---|
| Penyesuaian khusus EXPO terhadap honor | Gate C / keputusan bisnis | Tidak boleh ditebak dari label; perlu aturan finansial eksplisit |
| Penyesuaian Pengganti terhadap honor | Gate C / keputusan bisnis | Harus dibedakan antara sesi tambahan dan pengganti sesi lama |
| Dashboard proyeksi honor | Chain laporan berikutnya | Bergantung pada rumus Gate C |
| Export CSV lanjutan | Chain laporan berikutnya | Rekap dasar harus stabil dulu |
| Rapot/nilai/sertifikat | Modul terpisah | Bukan scope absensi tenaga pengajar |
| Refactor global role matrix | Security chain | Tidak diperlukan untuk implementasi feature-specific ini |

---

## Completion contract

Rantai ini tidak dianggap selesai hanya karena form dapat menyimpan data.

Minimal harus terbukti:

```text
identity
  -> trainer / asisten
  -> assignment
  -> self attendance
  -> admin correction
  -> monthly matrix
  -> personal summary
  -> business decision checkpoint (TA.C.2b)
  -> Gate C honor calculation (conditional on checkpoint approval)
  -> existing honor payment ledger
  -> regression/security verification
  -> source-doc write-back
```

Setiap panah harus mempunyai bukti VERIFY sebelum chain ditutup.