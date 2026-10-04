# Deferred & Parked Items — do not lose

**Aturan:** tiap baris punya pemilik + status. Sesuatu keluar dari daftar ini hanya lewat keputusan eksplisit (ruling tercatat) atau lewat microtask yang menutupnya. Terakhir disinkron: 2026-10-03 (pasca Slice 1).

## A. Sisa Slice 1 (rapot) — non-blocking, sudah ditriase final review

| # | Item | File:line | Status / pemilik |
|---|------|-----------|------------------|
| A1 | `newRaport` membaca `siswa.cabangId` yang tidak pernah ada (selalu null, server yang mengisi) — membingungkan, harmless | `src/lib/constants.js` newRaport | Deferred — Slice 1 follow-up |
| A2 | Default `semester`/`tahunAjaran` branches tak teruji; `raportTotal` input partial-null/non-object tak teruji (impl toleran) | `src/lib/raport.js`, `src/lib/__tests__/raport.test.js` | Deferred — coverage gap only |
| A3 | `mb_strlen` tanpa guard `ext-mbstring` (ada di XAMPP, negligible) | `server/validation/entities.php` validateSiswa/validateRaport | Deferred — hardening |
| A4 | `tahunAjaran` tanpa batas atas (klien + server; server 422 backstop bawah saja) | `src/features/raport/RaportForm.jsx`, `server/validation/entities.php` | Deferred — opsional `max=2100` |
| A5 | Policy test asimetri: failing leg tanpa mismatched enrichment (hanya bukti fails-closed) | `server/tests/authorize.policy.php` | Deferred — coverage |
| A6 | Duplicate-check TOCTOU race (app-level SELECT, tanpa DB unique key — schema frozen) | `server/api/raport.php` dup block (comment sudah menyatakan posture) | Parked + ruling: tambah unique key `(siswaId,semester,tahunAjaran)` saat schema unfrozen |

## B. Pre-existing (bukan Slice 1) — pemilik: hygiene/owner masing-masing

| # | Item | Status |
|---|------|--------|
| B1 | Migration chain halt di file `2026-09-23` di fresh DB (migrasi sesudahnya tak tercatat; harmless via `schema.sql` baseline) | Pre-existing — future hygiene |
| B2 | Restore = cache-only vs boot = server-wins (baris yang dihapus server tidak kembali) | Pre-existing — diputuskan di luar Slice 1 |
| B3 | Locator `Pengaturan` stale vs AccountMenu (catatan Task 8) | Pre-existing — perbaiki saat menyentuh area itu |

## C. Verification debt (Task 8 gate Slice 1, jujur)

- Full default suite tak selesai dalam budget 40 mnt; 16 legs non-green di-triase per-leg (login-flake, recordSession group, calendar bug, order-accumulation, AP.A.1 hang, finance ×2) — semua di luar footprint Slice 1, tidak di-patch. Tail legs ~84–167 tercatat Unverified. Detail per-leg ada di laporan gate (gitignored,workspace dihapus) — bila perlu, re-run `npx playwright test --project=default --workers=1` dari commit `ef4ede8`.
- Suite butuh >40 mnt di host ini — pertimbangkan split atau runner lebih kencang sebelum gate Slice 2.

## D. Exemplar carries (owner: tim lapangan, dari EXEMPLAR_MIGRATION)

- F4 (MA tariff, zero attendance), F14 (SMP Sains sessions, zero pupils), Q7/Q8 (zero payment samples — Accepted-Unverified): lubang ground truth, bukan defect kode. Tetap carry, jangan diisi dengan data invensi.
- F12 invoice follow-up: editor follow-up sudah ada di InvoiceModal (fuEditing) — anggap tertutup kecuali tim meminta view follow-up global (itu masuk Q-S4-2 Slice 4).

## F. Sisa Slice 3 (diterima apa adanya, 2026-10-04)

| # | Item | Status |
|---|------|--------|
| F1 | Chip kalender memakai nama sekolah penuh (brief bilang "singkat") — diterima, lebih informatif | Accepted as-is |
| F2 | J4 hanya membuktikan klik hari-jangkar (handler `openDayInHarian` identik semua hari) | Accepted — coverage cukup |
| F3 | `penugasan-timetable.spec.js` PG.B.1 gagal di tree bersih juga (ekspektasi copy empty-state basi dari T2.C.1) — JANGAN patch di Slice 3 | Pre-existing, pemilik: yang menyentuh area itu |
| F4 | Pelajaran proses: dispatch subagent menggantung 3× saat Playwright run panjang tanpa output; inline + bounded timeouts + `--reporter=line` jalan. Selalu cek :8000 hidup sebelum run panjang (PHP mati = proxy ECONNREFUSED; PHP wedged = stall sampai timeout) | Proses — diingat untuk Slice 4 |

## G. Open questions per slice (diputuskan saat gilirannya, bukan di sini)

- Slice 2: Q-S2-1 (4 metrik final), Q-S2-2 (toggle semua role?)
- Slice 3: Q-S3-1 (satu tab + switcher vs tab terpisah), Q-S3-2 (scope cabang kalender?)
- Slice 4: Q-S4-1 (in-app cukup vs WA push infra), Q-S4-2 (follow-up invoice ikut?)
