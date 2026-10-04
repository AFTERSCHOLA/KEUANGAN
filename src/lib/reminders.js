import { localDateString } from './constants.js'
import { formatJadwalList } from './format.js'
import { penugasanInvolvesTrainer } from './penugasan.js'

const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']

// Mirror of scheduleIncludesToday() in TrainerDashboard.jsx: jadwalList
// dayOfWeek match first, legacy string `jadwal` fallback; empty/missing
// jadwalList never matches (and never throws).
function scheduleIncludesDay(sekolah, dayName) {
  if (!sekolah || typeof sekolah !== 'object') return false
  if (Array.isArray(sekolah.jadwalList) && sekolah.jadwalList.length > 0) {
    return sekolah.jadwalList.some(entry => entry && entry.dayOfWeek === dayName)
  }
  return String(sekolah.jadwal || '').toLocaleLowerCase('id-ID').includes(String(dayName).toLocaleLowerCase('id-ID'))
}

function isAssignedToTrainer(sekolah, trainer, trainerId) {
  if (!sekolah || !trainerId) return false
  if (Array.isArray(trainer?.sekolahIds) && trainer.sekolahIds.includes(sekolah.id)) return true
  const assignments = Array.isArray(trainer?.penugasanPengajar) ? trainer.penugasanPengajar : []
  return assignments.some(a => a && a.sekolahId === sekolah.id && a.aktif === true && penugasanInvolvesTrainer(a, trainerId))
}

// Pure H-day/H-1 derivation for the notification bell (Task 2): which of
// the trainer's schools are scheduled today vs tomorrow (local
// wall-clock), plus the done flag from the absensiPengajar lane with
// legacy absensi OR-fallback. No fetch, no store/server writes.
export function remindersForTrainer({ trainerId, sekolah = [], trainer = null, absensi = [], absensiPengajar = [], nowLocal = new Date() } = {}) {
  const now = nowLocal instanceof Date ? nowLocal : new Date(nowLocal)
  const todayISO = localDateString(now)
  const todayName = DAY_NAMES[now.getDay()]
  // H-1 in the same local wall-clock (Date handles month boundaries).
  const tomorrowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  const tomorrowName = DAY_NAMES[tomorrowDate.getDay()]

  const schools = Array.isArray(sekolah) ? sekolah : []
  const ledger = Array.isArray(absensi) ? absensi : []
  const ledgerPengajar = Array.isArray(absensiPengajar) ? absensiPengajar : []
  const assigned = schools.filter(s => isAssignedToTrainer(s, trainer, trainerId))

  const today = assigned
    .filter(s => scheduleIncludesDay(s, todayName))
    .map(s => ({
      sekolahId: s.id,
      nama: s.nama,
      waktu: formatJadwalList(s.jadwalList),
      done: ledgerPengajar.some(a => a && a.tanggal === todayISO && a.sekolahId === s.id && (a.trainerId === trainerId || a.dicatatOleh === trainerId || penugasanInvolvesTrainer(a, trainerId))) || ledger.some(a => a && a.tanggal === todayISO && a.sekolahId === s.id && a.trainerId === trainerId),
    }))
  const tomorrow = assigned
    .filter(s => scheduleIncludesDay(s, tomorrowName))
    .map(s => ({
      sekolahId: s.id,
      nama: s.nama,
      waktu: formatJadwalList(s.jadwalList),
    }))

  const todayUndone = today.filter(t => !t.done).length
  return {
    today,
    tomorrow,
    counts: { todayUndone, tomorrow: tomorrow.length, total: todayUndone + tomorrow.length },
  }
}
