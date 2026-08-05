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

export function financialData({ sekolah = [], siswa = [], trainer = [], absensi = [], honorPayments = [], periode }) {
  const stats = attendanceStats(absensi, periode)
  const dibayarByTrainer = honorPaidByTrainer(honorPayments, periode)

  let potensiSpp = 0
  let pemasukanSpp = 0

  const sekolahFinance = sekolah.map(sch => {
    const siswaSekolah = siswa.filter(s => s.sekolahId === sch.id)
    const targetSpp = siswaSekolah.length * sch.spp
    const realisasiSpp = siswaSekolah.filter(s => s.sppLunas?.[periode]).length * sch.spp

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
      sisaHonor: bebanHonor - dibayar,
    }
  })

  const totalHonorDibayar = trainerFinance.reduce((sum, t) => sum + t.dibayar, 0)
  const belumTertagih = potensiSpp - pemasukanSpp
  const sisaKewajiban = totalBebanHonor - totalHonorDibayar

  // D1 — cash basis saja. Beban Honor / Sisa Kewajiban tidak pernah masuk baris ini.
  const labaRugi = pemasukanSpp - totalHonorDibayar

  return {
    periode,
    pemasukanSpp,
    totalHonorDibayar,
    labaRugi,
    potensiSpp,
    belumTertagih,
    totalBebanHonor,
    sisaKewajiban,
    sekolahFinance,
    trainerFinance,
  }
}