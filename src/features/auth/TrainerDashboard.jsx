import { useMemo } from 'react'
import { read, usePeriod } from '../../lib/store.js'
import { financialData } from '../../lib/finance.js'
import { formatRupiah } from '../../lib/format.js'

const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']

function scheduleIncludesToday(schedule, dayName) {
  return String(schedule || '').toLocaleLowerCase('id-ID').includes(dayName.toLocaleLowerCase('id-ID'))
}

export default function TrainerDashboard({ trainerId }) {
  const { periodeKey } = usePeriod()
  const periode = periodeKey()
  const trainers = read('trainer')
  const trainer = trainers.find(t => t.id === trainerId)
  const sekolah = read('sekolah')
  const siswa = read('siswa')
  const absensi = read('absensi')
  const honorPayments = read('honorPayments')
  const sppPayments = read('sppPayments')
  const finance = financialData({ sekolah, siswa, trainer: trainers, absensi, honorPayments, sppPayments, periode })
  const trainerFinance = finance.trainerFinance.find(t => t.id === trainerId) || {
    hadirSesi: 0,
    tarif: trainer?.honor || 0,
    dibayar: 0,
    sisaHonor: 0,
  }
  const today = new Date().toISOString().slice(0, 10)
  const todayName = DAY_NAMES[new Date(`${today}T00:00:00`).getDay()]
  const assignedSchools = useMemo(() => {
    const schoolIds = new Set(trainer?.sekolahIds || [])
    return sekolah
      .filter(s => schoolIds.has(s.id) && scheduleIncludesToday(s.jadwal, todayName))
      .map(s => ({
        ...s,
        done: absensi.some(a => a.tanggal === today && a.sekolahId === s.id && a.trainerId === trainerId),
      }))
  }, [absensi, sekolah, today, todayName, trainer, trainerId])

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex items-center justify-between flex-wrap gap-4 bg-white p-4 rounded-2xl shadow-sm border">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Rekap Saya</h2>
          <p className="text-xs text-slate-500">
            Jadwal hari ini dan ringkasan honor periode <b>{periode}</b>.
            {trainer && <> Saat ini: <b>{trainer.nama}</b></>}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
        <div className="p-5 border-b border-slate-100">
          <h3 className="text-base font-bold text-slate-800">Jadwal Sekolah Hari Ini</h3>
          <p className="text-xs text-slate-500">{today} · {todayName}</p>
        </div>
        {assignedSchools.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-400">Tidak ada sekolah terjadwal hari ini.</p>
        ) : (
          <div className="divide-y">
            {assignedSchools.map(s => (
              <div key={s.id} className="flex items-center justify-between gap-4 p-5">
                <div>
                  <p className="font-bold text-slate-800">{s.nama}</p>
                  <p className="text-xs text-slate-500">{s.jadwal}</p>
                </div>
                <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${s.done ? 'bg-emerald-100 text-emerald-700' : 'bg-yellow-100 text-yellow-700'}`}>
                  {s.done ? 'Selesai' : 'Belum Diisi'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border p-5">
        <h3 className="text-base font-bold text-slate-800">Honor Saya</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
          <Summary label="Sesi Hadir" value={`${trainerFinance.hadirSesi} sesi`} />
          <Summary label="Tarif per Sesi" value={formatRupiah(trainerFinance.tarif)} />
          <Summary label="Honor Dibayar" value={formatRupiah(trainerFinance.dibayar)} />
          <Summary label="Sisa Honor" value={formatRupiah(trainerFinance.sisaHonor)} />
        </div>
      </div>
    </div>
  )
}

function Summary({ label, value }) {
  return (
    <div className="bg-slate-50 rounded-xl p-4">
      <p className="text-[10px] text-slate-400 font-bold uppercase">{label}</p>
      <p className="text-lg font-extrabold text-blue-700 mt-1">{value}</p>
    </div>
  )
}
