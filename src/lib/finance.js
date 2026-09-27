import { resolveCurrentAbsensiPengajar } from './trainerAttendance.js'

// ============================================
// M2.4 — Money engine (Person 3)
// D1: cash basis. labaRugi = Σ SPP lunas(periode) − Σ honorPayments(periode).
// Beban Honor / Sisa Kewajiban = memo saja, tidak pernah masuk labaRugi.
// R4: satu-satunya tempat sesi × tarif dihitung; UI cuma render angkanya.
// ============================================

export function attendanceStats(absensi = [], periode) {
  const trainerSessionCount = {}
  const studentPeriodCount = {}
  const studentTotalCount = {}

  absensi.forEach(record => {
    ;(record.siswaList || []).forEach(s => {
      if (s.status === 'Hadir') {
        studentTotalCount[s.siswaId] = (studentTotalCount[s.siswaId] || 0) + 1
      }
    })

    if (record.periode === periode) {
      if (record.trainerStatus === 'Hadir' && record.trainerId) {
        trainerSessionCount[record.trainerId] = (trainerSessionCount[record.trainerId] || 0) + 1
      }
      ;(record.siswaList || []).forEach(s => {
        if (s.status === 'Hadir') {
          studentPeriodCount[s.siswaId] = (studentPeriodCount[s.siswaId] || 0) + 1
        }
      })
    }
  })

  return { trainerSessionCount, studentPeriodCount, studentTotalCount }

}

export function honorPaidByTrainer(honorPayments = [], periode) {
  const result = {}
  honorPayments.forEach(p => {
    if (p.periode === periode) {
      result[p.trainerId] = (result[p.trainerId] || 0) + Number(p.nominal)
    }
  })
  return result
}

// CS.C.1 (F-CS4; D-CS3, D-CS6) — role-first honor flat for assistants.
// D2: whoever fills the asisten slot that session prices 50k, incl.
// externals without a login. Documented here only (no second hardcode).
export const PERAN_ASISTEN_HONOR = 50000

// CS.C.1 — honor for one absensiPengajar row. A -> flat 50k (D2);
// I or legacy (peran null/absent) -> owner's trainer.honor per R-TA3
// (no hardcode tiers). Missing owner prices 0 (fails closed; an
// external-I row mints nothing — externals are always A in practice).
export function honorForPengajarRow(row, trainer = []) {
  if (row?.peran === 'A') return PERAN_ASISTEN_HONOR
  const list = Array.isArray(trainer) ? trainer : [...(trainer?.values?.() ?? [])]
  const tr = list.find(t => t?.id === row?.trainerId)
  return tr ? Number(tr.honor) || 0 : 0
}

// TA.C.3 (F-TA6, F-TA9; D-TA4, D-TA5, D-TA14 Locked berpindah; R-TA3,
// R-TA11, R-TA12) — beban honor dari `absensiPengajar`.
// Counts stay role-agnostic (hadirSesi = Hadir rows per person);
// honor sums are role-first via honorForPengajarRow() (CS.C.1, D-CS6):
// nominal selalu dibaca dari field honor orangnya untuk I/legacy
// (R-TA3, tidak ada hardcode 100k/75k/50k) dan flat 50k untuk A (D2);
// Izin/Alpa = 0; keterangan EXPO/Pengganti tidak mengubah nominal
// (PLAN §9, TA_C2B_VALIDATION.md §3). Correction records supersede
// via latest-wins on `correctionOf` (R-TA4, same rule as the matrix).
export function pengajarHonorStats(absensiPengajar = [], periode) {
  const current = resolveCurrentAbsensiPengajar(
     (absensiPengajar || []).filter(r => r.periode === periode)
   )
  const hadirByTrainer = {}
  const hadirBySekolah = {}
  const hadirRecords = []
  current.forEach(r => {
    if (r.status !== 'Hadir' || !r.trainerId) return
    hadirByTrainer[r.trainerId] = (hadirByTrainer[r.trainerId] || 0) + 1
    if (r.sekolahId) hadirBySekolah[r.sekolahId] = (hadirBySekolah[r.sekolahId] || 0) + 1
    hadirRecords.push(r)
  })
  return { hadirByTrainer, hadirBySekolah, hadirRecords }
}

export function financialData({ sekolah = [], siswa = [], trainer = [], absensi = [], honorPayments = [], sppPayments = [], periode, absensiPengajar = null }) {
  const stats = attendanceStats(absensi, periode)
  const dibayarByTrainer = honorPaidByTrainer(honorPayments, periode)
  // TA.C.3 — Concrete pick: `absensiPengajar` null/absent = legacy
  // `absensi` source (every existing caller and test stays byte-identical,
  // R-TA12); an array (even empty) switches honor beban to the Gate C
  // source. SPP math never reads either attendance entity.
  const pengajarStats = Array.isArray(absensiPengajar) ? pengajarHonorStats(absensiPengajar, periode) : null
  const trainerSessionCount = pengajarStats ? pengajarStats.hadirByTrainer : stats.trainerSessionCount

  let potensiSpp = 0
  let pemasukanSpp = 0

  const sekolahFinance = sekolah.map(sch => {
    const siswaSekolah = siswa.filter(s => s.sekolahId === sch.id)
    // M5.4.3 — Trial students never enter SPP potensi/tunggakan math (R4: ledger trust,
    // and Trial is a billing-status, not attendance/list-membership filter)
    const siswaBilling = siswaSekolah.filter(s => s.status !== 'Trial')
    // EF.A.3 (F-EF3; D-EF3) — round once at the flat derivation so a
    // semester-normalized fractional spp (e.g. 141666.67) never leaks
    // fractions into targetSpp/Potensi. Integer-spp schools are unaffected
    // (Math.round is identity); the per-meeting path is untouched.
    const targetSpp = Math.round(siswaBilling.length * sch.spp)
    const realisasiSpp = siswaBilling.reduce((sum, s) => sum + sppPayments
      .filter(p => p.siswaId === s.id && p.periode === periode)
      .reduce((studentSum, p) => studentSum + Number(p.nominal || 0), 0), 0)

    potensiSpp += targetSpp
    pemasukanSpp += realisasiSpp


    const trainerNama = (sch.trainerIds || [])
      .map(id => trainer.find(t => t.id === id)?.nama)
      .filter(Boolean)
      .join(', ') || 'Belum Ditugaskan'

    // TA.C.3: with the Gate C source, beban per sekolah = Σ Hadir rows
    // in absensiPengajar × role-first honor (CS.C.1, D-CS6:
    // A -> 50k, I/legacy -> owner's trainer.honor per R-TA3).
    // hadirRecords is already latest-wins deduped (R-TA4).
    const sesiHadir = pengajarStats
      ? pengajarStats.hadirRecords.filter(a => a.sekolahId === sch.id)
      : absensi.filter(
        a => a.sekolahId === sch.id && a.periode === periode && a.trainerStatus === 'Hadir'
      )
    const bebanHonor = sesiHadir.reduce((sum, a) => {
      if (!pengajarStats) {
        const tr = trainer.find(t => t.id === a.trainerId)
        return sum + (tr ? tr.honor : 0)
      }
      return sum + honorForPengajarRow(a, trainer)
    }, 0)

    return {
      id: sch.id,
      nama: sch.nama,
      siswaCount: siswaSekolah.length,
      sppTarif: sch.spp,
      targetSpp,
      realisasiSpp,
      trainerNama,
      trainerKehadiran: sesiHadir.length,
      bebanHonor,
    }
  })

  let totalBebanHonor = 0
  const trainerById = new Map((trainer || []).map(t => [t?.id, t]))
  const trainerFinance = trainer.map(t => {
    const hadirSesi = trainerSessionCount[t.id] || 0
    // CS.C.1: role-first honor when the Gate C source is active; legacy
    // count × tarif when absensiPengajar is absent (byte-identical).
    const bebanHonor = pengajarStats
      ? pengajarStats.hadirRecords
        .filter(r => r.trainerId === t.id)
        .reduce((sum, r) => sum + honorForPengajarRow(r, trainer), 0)
      : hadirSesi * t.honor
    totalBebanHonor += bebanHonor
    const dibayar = dibayarByTrainer[t.id] || 0


    const sekolahNama = (t.sekolahIds || [])
      .map(id => sekolah.find(s => s.id === id)?.nama)
      .filter(Boolean)
      .join(', ') || 'Tidak ditugaskan'

    return {
      id: t.id,
      nama: t.nama,
      sekolahNama,
      hadirSesi,
      tarif: t.honor,
      bebanHonor,
      dibayar,
      // TEAM_FEEDBACK D5 (G5.1) — floor at zero; excess surfaces as credit.
      sisaHonor: Math.max(0, bebanHonor - dibayar),
      lebihBayarHonor: Math.max(0, dibayar - bebanHonor),
    }
  })

  // CS.C.1: external-assistant rows (no trainer record) price 50k when
  // peran A and contribute to school/total beban; they carry no
  // trainerFinance entry (no honorPayments ledger for externals), so
  // sisaKewajiban stays trainer-only by design.
  if (pengajarStats) {
    totalBebanHonor += pengajarStats.hadirRecords
      .filter(r => !trainerById.has(r.trainerId))
      .reduce((sum, r) => sum + honorForPengajarRow(r, trainer), 0)
  }

  const totalHonorDibayar = trainerFinance.reduce((sum, t) => sum + t.dibayar, 0)
  // TEAM_FEEDBACK D5 (G5.1) — sisaKewajiban sums the floored per-trainer
  // balances (overpay on one trainer never offsets another's debt).
  const belumTertagih = Math.max(0, potensiSpp - pemasukanSpp)
  const sisaKewajiban = trainerFinance.reduce((sum, t) => sum + t.sisaHonor, 0)
  const lebihBayarSpp = Math.max(0, pemasukanSpp - potensiSpp)
  const lebihBayarHonor = trainerFinance.reduce((sum, t) => sum + t.lebihBayarHonor, 0)

  // D1 — cash basis saja. Beban Honor / Sisa Kewajiban tidak pernah masuk baris ini.
  const labaRugi = pemasukanSpp - totalHonorDibayar

  return {
    periode,
    pemasukanSpp,
    totalHonorDibayar,
    labaRugi,
    potensiSpp,
    belumTertagih,
    lebihBayarSpp,
    lebihBayarHonor,

    totalBebanHonor,
    sisaKewajiban,
    sekolahFinance,
    trainerFinance,
  }
}

// ============================================
// SB.A.2 — Per-meeting billing calculator (F-SB1; D-SB5, D-SB6, D-SB7, D-SB13)
// Rumus dasar tunggal (SPP_BILLING_PLAN.md §6): tarifPerPertemuan ×
// pertemuan_aktual, basis 'siswa' dikali jumlah siswa aktif non-Trial,
// basis 'trainer' tidak. `trigger`/`jumlahN`/`jumlahMinggu`/`sumberDana`
// adalah metadata jadwal & pelabelan invoice (dikerjakan di SB.B/SB.C) —
// TIDAK mengubah rumus di sini; fungsi ini sengaja hanya membaca `basis`
// dan `tarifPerPertemuan` dari metodePembayaran.
// D-SB13: hanya trainerStatus 'Hadir' menagih; Izin/Alpa = 0; sesi
// pengganti = record Hadir baru, terhitung normal (bukan flip status).
// Sekolah tanpa metodePembayaran (null) → rumus flat lama, IDENTIK dengan
// financialData() sebelum SB.A ada (R-SB3, dibuktikan SB.A.3). Fungsi ini
// BELUM dipanggil dari financialData() — berdiri sendiri sampai SB.B/SB.C
// menyambungkannya ke invoice generator, sesuai urutan gate di
// SPP_BILLING_MILESTONES.md.
// ============================================

export function billingForSekolah(sch, { absensi = [], siswa = [], periode }) {
  const siswaBilling = siswa.filter(s => s.sekolahId === sch.id && s.status !== 'Trial')

  if (!sch.metodePembayaran) {
    return {
      // EF.A.3 (D-EF3) — same once-at-derivation rounding as the flat path
      // above; per-meeting branches below use tarifPerPertemuan directly.
      total: Math.round(siswaBilling.length * sch.spp),
      basis: 'flat_legacy',
      pertemuanAktual: null,

    }
  }

  const { basis, tarifPerPertemuan } = sch.metodePembayaran

  const pertemuanAktual = absensi.filter(
    a => a.sekolahId === sch.id && a.periode === periode && a.trainerStatus === 'Hadir'
  ).length

  const total = basis === 'trainer'
    ? tarifPerPertemuan * pertemuanAktual
    : tarifPerPertemuan * pertemuanAktual * siswaBilling.length

  return { total, basis, pertemuanAktual }
}