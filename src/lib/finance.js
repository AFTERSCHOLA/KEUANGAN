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

export function financialData({ sekolah = [], siswa = [], trainer = [], absensi = [], honorPayments = [], sppPayments = [], periode }) {
  const stats = attendanceStats(absensi, periode)
  const dibayarByTrainer = honorPaidByTrainer(honorPayments, periode)

  let potensiSpp = 0
  let pemasukanSpp = 0

  const sekolahFinance = sekolah.map(sch => {
    const siswaSekolah = siswa.filter(s => s.sekolahId === sch.id)
    // M5.4.3 — Trial students never enter SPP potensi/tunggakan math (R4: ledger trust,
    // and Trial is a billing-status, not attendance/list-membership filter)
    const siswaBilling = siswaSekolah.filter(s => s.status !== 'Trial')
    const targetSpp = siswaBilling.length * sch.spp
    const realisasiSpp = siswaBilling.reduce((sum, s) => sum + sppPayments
      .filter(p => p.siswaId === s.id && p.periode === periode)
      .reduce((studentSum, p) => studentSum + Number(p.nominal || 0), 0), 0)

    potensiSpp += targetSpp
    pemasukanSpp += realisasiSpp


    const trainerNama = (sch.trainerIds || [])
      .map(id => trainer.find(t => t.id === id)?.nama)
      .filter(Boolean)
      .join(', ') || 'Belum Ditugaskan'

    const sesiHadir = absensi.filter(
      a => a.sekolahId === sch.id && a.periode === periode && a.trainerStatus === 'Hadir'
    )
    const bebanHonor = sesiHadir.reduce((sum, a) => {
      const tr = trainer.find(t => t.id === a.trainerId)
      return sum + (tr ? tr.honor : 0)
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
  const trainerFinance = trainer.map(t => {
    const hadirSesi = stats.trainerSessionCount[t.id] || 0
    const bebanHonor = hadirSesi * t.honor
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
      total: siswaBilling.length * sch.spp,
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