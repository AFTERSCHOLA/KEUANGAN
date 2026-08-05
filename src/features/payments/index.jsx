import React, { useMemo, useState } from 'react'
import { read, remove, upsert, usePeriod } from '../../lib/store'
import { financialData } from '../../lib/finance'
import { formatRupiah } from '../../lib/format'
import { monthLabel, newHonorPayment } from '../../lib/constants'
import PaymentModal from './PaymentModal'

export default function PembayaranTab() {
  const { periodeKey, selectedMonth, selectedYear, calYear } = usePeriod()
  const periode = periodeKey()

  const [refreshTick, setRefreshTick] = useState(0)
  const sekolah = useMemo(() => read('sekolah'), [refreshTick])
  const trainer = useMemo(() => read('trainer'), [refreshTick])
  const siswa = useMemo(() => read('siswa'), [refreshTick])
  const absensi = useMemo(() => read('absensi'), [refreshTick])
  const honorPayments = useMemo(() => read('honorPayments'), [refreshTick])

  const finance = useMemo(
    () => financialData({ sekolah, siswa, trainer, absensi, honorPayments, periode }),
    [sekolah, siswa, trainer, absensi, honorPayments, periode]
  )

  const [expandedTrainerId, setExpandedTrainerId] = useState(null)
  const [payModalTrainer, setPayModalTrainer] = useState(null)
  const [confirmDialog, setConfirmDialog] = useState(null)

  function refresh() {
    setRefreshTick(t => t + 1)
  }

  const bulanLabel = monthLabel(String(selectedMonth).padStart(2, '0'))
  const tahunLabel = calYear(selectedMonth, selectedYear)

  function handleLunaskan(row) {
    if (row.sisaHonor <= 0) return
    setConfirmDialog({
      title: 'Lunaskan Honor',
      message: `Bayar sisa ${formatRupiah(row.sisaHonor)} kepada ${row.nama} untuk ${bulanLabel} ${tahunLabel}?`,
      onConfirm: () => {
        upsert('honorPayments', newHonorPayment(row.id, periode, row.sisaHonor, new Date().toISOString().slice(0, 10)))
        setConfirmDialog(null)
        refresh()
      },
    })
  }

  function handleDeleteEntry(entryId) {
    setConfirmDialog({
      title: 'Hapus Pembayaran',
      message: 'Hapus entri pembayaran ini? Sisa kewajiban akan dihitung ulang.',
      onConfirm: () => {
        remove('honorPayments', entryId)
        setConfirmDialog(null)
        refresh()
      },
    })
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex items-center justify-between flex-wrap gap-4 bg-white p-4 rounded-2xl shadow-sm border">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Lembar Pembayaran Honor Trainer</h2>
          <p className="text-xs text-slate-500">Pencatatan realisasi pengeluaran kas pembayaran honorarium untuk periode <b>{periode}</b></p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden border">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                <th className="py-4 px-6">Trainer</th>
                <th className="py-4 px-6">Sekolah Penugasan</th>
                <th className="py-4 px-6 text-center">Kehadiran ({periode})</th>
                <th className="py-4 px-6 text-right">Tarif per Sesi</th>
                <th className="py-4 px-6 text-right">Akumulasi Beban</th>
                <th className="py-4 px-6 text-right text-emerald-600">Honor Dibayar</th>
                <th className="py-4 px-6 text-right text-rose-600">Sisa Kewajiban</th>
                <th className="py-4 px-6 text-center">Tindakan</th>
              </tr>
            </thead>
            <tbody className="divide-y text-sm">
              {finance.trainerFinance.map(row => {
                const entries = honorPayments.filter(p => p.trainerId === row.id && p.periode === periode)
                const isExpanded = expandedTrainerId === row.id
                return (
                  <React.Fragment key={row.id}>
                    <tr className="hover:bg-slate-50/50 transition">
                      <td className="py-4 px-6 font-bold text-slate-800">{row.nama}</td>
                      <td className="py-4 px-6 font-semibold text-slate-600">{row.sekolahNama}</td>
                      <td className="py-4 px-6 text-center font-bold text-blue-700">{row.hadirSesi} Pertemuan</td>
                      <td className="py-4 px-6 text-right font-medium text-slate-500">{formatRupiah(row.tarif)}</td>
                      <td className="py-4 px-6 text-right font-bold text-slate-800">{formatRupiah(row.bebanHonor)}</td>
                      <td className="py-4 px-6 text-right font-bold text-emerald-600">{formatRupiah(row.dibayar)}</td>
                      <td className="py-4 px-6 text-right font-extrabold text-rose-600">{formatRupiah(row.sisaHonor)}</td>
                      <td className="py-4 px-6 text-center">
                        <div className="flex gap-1.5 justify-center flex-wrap">
                          <button
                            onClick={() => handleLunaskan(row)}
                            disabled={row.sisaHonor <= 0}
                            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-extrabold text-[11px] px-3 py-1.5 rounded-lg transition shadow-sm active:scale-95"
                          >
                            ✓ Lunaskan
                          </button>
                          <button
                            onClick={() => setPayModalTrainer(row)}
                            className="bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-[11px] px-3 py-1.5 rounded-lg transition shadow-sm active:scale-95"
                          >
                            Bayar Manual
                          </button>
                          <button
                            onClick={() => setExpandedTrainerId(isExpanded ? null : row.id)}
                            className="border border-slate-200 text-slate-500 font-extrabold text-[11px] px-3 py-1.5 rounded-lg transition"
                          >
                            Riwayat ({entries.length})
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan="8" className="bg-slate-50 px-6 py-4">
                          {entries.length === 0 ? (
                            <p className="text-xs text-slate-400">Belum ada pembayaran tercatat untuk periode ini.</p>
                          ) : (
                            <div className="space-y-2">
                              {entries.map(entry => (
                                <div key={entry.id} className="flex items-center justify-between bg-white border border-slate-100 rounded-xl px-4 py-2.5 text-xs">
                                  <span className="text-slate-500">{entry.tanggalBayar}</span>
                                  <span className="font-bold text-slate-800">{formatRupiah(entry.nominal)}</span>
                                  <button onClick={() => handleDeleteEntry(entry.id)} className="text-rose-600 hover:text-rose-700 font-bold">
                                    Hapus
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
              {finance.trainerFinance.length === 0 && (
                <tr>
                  <td colSpan="8" className="py-12 text-center text-slate-400">
                    Tidak ada data trainer untuk pencatatan pembayaran.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {payModalTrainer && (
        <PaymentModal
          trainerRow={payModalTrainer}
          periode={periode}
          onClose={() => setPayModalTrainer(null)}
          onSaved={() => { setPayModalTrainer(null); refresh() }}
        />
      )}

      {confirmDialog && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl animate-scaleIn border-t-4 border-yellow-400">
            <h4 className="text-lg font-bold text-slate-900 mb-2">{confirmDialog.title}</h4>
            <p className="text-sm text-slate-600 mb-6">{confirmDialog.message}</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setConfirmDialog(null)} className="px-4 py-2 border rounded-xl text-xs font-bold text-slate-500">Kembali</button>
              <button onClick={confirmDialog.onConfirm} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow">Konfirmasi</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}