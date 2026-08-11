import { read } from '../../lib/store.js'

// Rekap Saya — landing view untuk role Trainer (M5.1.2).
// Totals rekap sesungguhnya diisi di M5.3.2 (TrainerHistory).
export default function TrainerDashboard({ trainerId }) {
  const trainers = read('trainer')
  const trainer = trainers.find(t => t.id === trainerId)

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex items-center justify-between flex-wrap gap-4 bg-white p-4 rounded-2xl shadow-sm border">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Rekap Saya</h2>
          <p className="text-xs text-slate-500">
            Ringkasan sesi dan honor pribadi Anda.
            {trainer && <> Saat ini: <b>{trainer.nama}</b></>}
          </p>
        </div>
      </div>
      <div className="bg-white rounded-2xl p-8 shadow-sm border text-center">
        <p className="text-slate-400 text-sm">
          Rekap sesi mengajar akan muncul di sini.
        </p>
      </div>
    </div>
  )
}
