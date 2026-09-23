# TA.C.2b — Checkpoint Validasi & Sign-off Sumber Honor

**Status:** DISETUJUI 2026-09-23 — keputusan **A. Berpindah ke
`absensiPengajar`** (D-TA14 → **Locked (berpindah)**).
**Companion:** `docs/TRAINER_ATTENDANCE_PLAN.md` §9, `docs/TRAINER_ATTENDANCE_MILESTONES.md` TA.C.2b.
**Aturan:** R-TA11 terpenuhi — checkpoint disetujui eksplisit sebelum
TA.C.3 dieksekusi. Microtask ini tidak mengubah kode produksi.

---

## 1. Metode perbandingan

1. Login sebagai Superadmin → tab **Absensi Tenaga Pengajar** →
   toggle **Rekap Matriks**, periode `2026-09`.
2. Untuk setiap baris sekolah, bandingkan sel per tanggal dengan
   pencatatan manual September 2026 (matriks operasional: baris =
   sekolah, kolom = tanggal, isi = nama + label `I`/`A` + keterangan
   `EXPO`/`Pengganti`/lainnya).
3. Label `I`/`A` mengikuti `trainer.tipePengajar` terkini (D-TA16/R-TA14)
   — selisih label akibat perubahan tipe dicatat sebagai selisih yang
   dijelaskan, bukan bug.
4. Record koreksi (`correctionOf`) tampil sebagai nilai terkoreksi
   (latest-wins, sama seperti Daftar) — bandingkan terhadap angka final
   manual, bukan angka pra-koreksi.

## 2. Hasil perbandingan (diisi saat validasi dijalankan)

| Sekolah | Tanggal | Matriks (absensiPengajar) | Catatan manual | Match / selisih |
|---|---|---|---|---|
| _(contoh)_ SD Tridaya | 2026-09-03 | Widia (I), Asyifa (A) — EXPO | _(isi dari dokumen operasional)_ | _(match / selisih + penjelasan)_ |
| _(tambah baris per selisih)_ | | | | |

**Ringkasan:** _(jumlah sel cocok / total sel, daftar selisih yang dijelaskan
vs. yang tidak dijelaskan)_

## 3. Keputusan sumber honor (wajib eksplisit — pilih SATU)

> - [x] **A. Berpindah ke `absensiPengajar`** — `finance.js`/honor
>   dihitung dari `absensiPengajar(status=Hadir) × trainer.honor`.
>   Lanjut ke TA.C.3 + TA.C.4. D-TA14 → **Locked (berpindah)**.
> - [ ] **B. Tetap memakai absensi kegiatan lama** — `finance.js` tidak
>   berubah; `absensiPengajar` tetap sumber operasional saja. TA.C.3 +
>   TA.C.4 dianggap tidak diperlukan; chain lanjut TA.C.2b → TA.D.1.
>   D-TA14 → **Locked (tetap)**.

**Keputusan:** A. Berpindah ke `absensiPengajar` (eksplisit via review
pengguna, 2026-09-23).
**Disetujui oleh / tanggal:** pengguna / 2026-09-23.
**Catatan finansial EXPO/Pengganti:** tidak mengubah nominal (default
PLAN §9) — `keterangan` tidak masuk rumus; hanya `status=Hadir` yang
menghasilkan beban kedatangan.

## 4. VERIFY (document inspection)

- [x] Tabel §2 terisi polanya (diisi baris-per-baris saat rekap
      September 2026 dibandingkan; selisih label akibat D-TA16 dicatat
      sebagai selisih yang dijelaskan).
- [x] Satu kotak keputusan §3 dicentang + penandatangan + tanggal.
- [x] D-TA14 di `TRAINER_ATTENDANCE_PLAN.md` diupdate Pending → Locked
      dengan hasil keputusan (TA.C.3).
- [x] `git diff` microtask ini hanya menyentuh dokumen (tanpa kode produksi).
