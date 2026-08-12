import React, { useState } from 'react'
import { usePeriod } from '../../lib/store'
import AttendanceForm from './AttendanceForm'
import AttendanceHistory from './AttendanceHistory'

export { default as AttendanceForm } from './AttendanceForm'
export { default as AttendanceHistory } from './AttendanceHistory'

export default function AttendanceTab({ initialView = 'input' }) {
  const { periodeKey } = usePeriod()
  const [view, setView] = useState(initialView)
  const [editingRecord, setEditingRecord] = useState(null)

  function loadForCorrection(record) {
    setEditingRecord(record)
    setView('input')
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex items-center justify-between flex-wrap gap-4 bg-white p-4 rounded-2xl shadow-sm border">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Lembar Absensi Harian Kelas</h2>
          <p className="text-xs text-slate-500">Mencatat data kehadiran guru dan siswa untuk periode <b>{periodeKey()}</b></p>
        </div>
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => { setView('input'); setEditingRecord(null) }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition ${
              view === 'input' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'
            }`}
          >
            Input Absensi
          </button>
          <button
            onClick={() => setView('riwayat')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition ${
              view === 'riwayat' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'
            }`}
          >
            Riwayat Absensi
          </button>
        </div>
      </div>

      {view === 'input' ? (
        <AttendanceForm editingRecord={editingRecord} onSaved={() => setEditingRecord(null)} />
      ) : (
        <AttendanceHistory onLoadForCorrection={loadForCorrection} initialView={initialView} />
      )}
    </div>
  )
}