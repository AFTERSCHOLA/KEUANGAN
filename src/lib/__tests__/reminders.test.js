import { describe, expect, it } from 'vitest'
import { remindersForTrainer } from '../reminders.js'

const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']

function localISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function dayFixture() {
  const nowLocal = new Date()
  const todayName = DAY_NAMES[nowLocal.getDay()]
  const tomorrowDate = new Date(nowLocal.getFullYear(), nowLocal.getMonth(), nowLocal.getDate() + 1)
  const tomorrowName = DAY_NAMES[tomorrowDate.getDay()]
  const todayISO = localISO(nowLocal)
  return { nowLocal, todayName, tomorrowName, todayISO }
}

describe('remindersForTrainer', () => {
  it('splits H-day and H-1 schools with counts', () => {
    const { nowLocal, todayName, tomorrowName } = dayFixture()
    const trainer = { id: 'trn-1', sekolahIds: ['skl-today', 'skl-tomorrow'], penugasanPengajar: [] }
    const sekolah = [
      { id: 'skl-today', nama: 'SD Hari Ini', jadwalList: [{ dayOfWeek: todayName, time: '14:00', endTime: '15:00' }] },
      { id: 'skl-tomorrow', nama: 'SD Besok', jadwalList: [{ dayOfWeek: tomorrowName, time: '09:00', endTime: '10:00' }] },
    ]
    const out = remindersForTrainer({ trainerId: 'trn-1', sekolah, trainer, absensi: [], nowLocal })
    expect(out.today.length).toBe(1)
    expect(out.tomorrow.length).toBe(1)
    expect(out.counts.total).toBe(2)
  })

  it('marks today done via absensi match', () => {
    const { nowLocal, todayName, todayISO } = dayFixture()
    const trainer = { id: 'trn-1', sekolahIds: ['skl-today'], penugasanPengajar: [] }
    const sekolah = [
      { id: 'skl-today', nama: 'SD Hari Ini', jadwalList: [{ dayOfWeek: todayName, time: '14:00', endTime: '15:00' }] },
    ]
    const absensi = [{ tanggal: todayISO, sekolahId: 'skl-today', trainerId: 'trn-1' }]
    const out = remindersForTrainer({ trainerId: 'trn-1', sekolah, trainer, absensi, nowLocal })
    expect(out.today[0].done).toBe(true)
    expect(out.counts.todayUndone).toBe(0)
  })

  it('unions sekolahIds and active penugasanPengajar on the same day', () => {
    const { nowLocal, todayName } = dayFixture()
    const trainer = {
      id: 'trn-1',
      sekolahIds: ['skl-a'],
      penugasanPengajar: [
        { id: 'pgs-1', sekolahId: 'skl-b', trainerId: 'trn-1', aktif: true },
      ],
    }
    const sekolah = [
      { id: 'skl-a', nama: 'SD A', jadwalList: [{ dayOfWeek: todayName, time: '14:00', endTime: '15:00' }] },
      { id: 'skl-b', nama: 'SD B', jadwalList: [{ dayOfWeek: todayName, time: '16:00', endTime: '17:00' }] },
    ]
    const out = remindersForTrainer({ trainerId: 'trn-1', sekolah, trainer, absensi: [], nowLocal })
    expect(out.today.length).toBe(2)
  })

  it('returns empty lists without throwing for empty jadwalList', () => {
    const { nowLocal } = dayFixture()
    const trainer = { id: 'trn-1', sekolahIds: ['skl-empty'], penugasanPengajar: [] }
    const sekolah = [{ id: 'skl-empty', nama: 'SD Kosong', jadwalList: [] }]
    const out = remindersForTrainer({ trainerId: 'trn-1', sekolah, trainer, absensi: [], nowLocal })
    expect(out.today).toEqual([])
    expect(out.tomorrow).toEqual([])
  })

  it('marks done from absensiPengajar internal row', () => {
    const { nowLocal, todayName, todayISO } = dayFixture()
    const trainer = { id: 'trn-1', sekolahIds: ['skl-today'], penugasanPengajar: [] }
    const sekolah = [{ id: 'skl-today', nama: 'SD Hari Ini', jadwalList: [{ dayOfWeek: todayName, time: '14:00' }] }]
    const absensiPengajar = [{ tanggal: todayISO, sekolahId: 'skl-today', trainerId: 'trn-1' }]
    const out = remindersForTrainer({ trainerId: 'trn-1', sekolah, trainer, absensi: [], absensiPengajar, nowLocal })
    expect(out.today[0].done).toBe(true)
  })

  it('marks done from absensiPengajar eksternal row recorded by owner', () => {
    const { nowLocal, todayName, todayISO } = dayFixture()
    const trainer = { id: 'trn-1', sekolahIds: ['skl-today'], penugasanPengajar: [] }
    const sekolah = [{ id: 'skl-today', nama: 'SD Hari Ini', jadwalList: [{ dayOfWeek: todayName, time: '14:00' }] }]
    const absensiPengajar = [{ tanggal: todayISO, sekolahId: 'skl-today', trainerId: 'ext-1', dicatatOleh: 'trn-1' }]
    const out = remindersForTrainer({ trainerId: 'trn-1', sekolah, trainer, absensi: [], absensiPengajar, nowLocal })
    expect(out.today[0].done).toBe(true)
  })

  it('keeps legacy absensi fallback when absensiPengajar is empty', () => {
    const { nowLocal, todayName, todayISO } = dayFixture()
    const trainer = { id: 'trn-1', sekolahIds: ['skl-today'], penugasanPengajar: [] }
    const sekolah = [{ id: 'skl-today', nama: 'SD Hari Ini', jadwalList: [{ dayOfWeek: todayName, time: '14:00' }] }]
    const absensi = [{ tanggal: todayISO, sekolahId: 'skl-today', trainerId: 'trn-1' }]
    const out = remindersForTrainer({ trainerId: 'trn-1', sekolah, trainer, absensi, absensiPengajar: [], nowLocal })
    expect(out.today[0].done).toBe(true)
  })

  it('uses local wall-clock at WIB boundary 00:30', () => {
    const nowLocal = new Date(2026, 9, 4, 0, 30)
    const todayName = DAY_NAMES[nowLocal.getDay()]
    const todayISO = localISO(nowLocal)
    expect(todayISO).toBe('2026-10-04')
    const trainer = { id: 'trn-1', sekolahIds: ['skl-today'], penugasanPengajar: [] }
    const sekolah = [{ id: 'skl-today', nama: 'SD Hari Ini', jadwalList: [{ dayOfWeek: todayName, time: '14:00' }] }]
    const absensiPengajar = [{ tanggal: todayISO, sekolahId: 'skl-today', trainerId: 'trn-1' }]
    const out = remindersForTrainer({ trainerId: 'trn-1', sekolah, trainer, absensi: [], absensiPengajar, nowLocal })
    expect(out.today.length).toBe(1)
    expect(out.today[0].done).toBe(true)
  })
})
