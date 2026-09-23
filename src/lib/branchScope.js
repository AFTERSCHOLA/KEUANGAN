export function filterEntitiesByBranch(entities, selectedCabangId) {
  if (!selectedCabangId) return entities

  const sekolah = entities.sekolah.filter(s => s.cabangId === selectedCabangId)
  const sekolahIds = new Set(sekolah.map(s => s.id))
  const siswa = entities.siswa.filter(s => sekolahIds.has(s.sekolahId))
  const siswaIds = new Set(siswa.map(s => s.id))
  const trainer = entities.trainer.filter(t => (t.sekolahIds || []).some(id => sekolahIds.has(id)))
  const trainerIds = new Set(trainer.map(t => t.id))

  return {
    ...entities,
    sekolah,
    siswa,
    trainer,
    absensi: entities.absensi.filter(a => sekolahIds.has(a.sekolahId)),
    // TA.C.3 — Gate C source scoped by the same sekolahId rule as legacy
    // absensi, so a branch-filtered Overview never mixes other-cabang
    // beban into the memo rows. Tolerates entities without the key
    // (legacy callers) via (entities.absensiPengajar || []).
    absensiPengajar: (entities.absensiPengajar || []).filter(a => sekolahIds.has(a.sekolahId)),
    honorPayments: entities.honorPayments.filter(p => trainerIds.has(p.trainerId)),
    sppPayments: entities.sppPayments.filter(p => siswaIds.has(p.siswaId)),
    invoices: entities.invoices.filter(i => sekolahIds.has(i.sekolahId)),
  }
}
