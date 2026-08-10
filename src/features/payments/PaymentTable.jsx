import { useState, Fragment } from 'react'
import { read, upsert, write, usePeriod } from '../../lib/store.js'
import { formatRupiah } from '../../lib/format.js'
import { newHonorPayment } from '../../lib/constants.js'
import { financialData } from '../../lib/finance.js'
import Modal from '../../components/Modal.jsx'
import ConfirmDialog from '../../components/ConfirmDialog.jsx'
import RupiahInput from '../../components/RupiahInput.jsx'

export default function PaymentTable() {
  const period = usePeriod()
  const [trainers] = useState(() => read('trainer'))
  const [payments, setPayments] = useState(() => read('honorPayments'))
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedTrainer, setSelectedTrainer] = useState(null)
  const [payForm, setPayForm] = useState({ nominal: '', tanggalBayar: new Date().toISOString().slice(0, 10) })
  const [expandedTrainerId, setExpandedTrainerId] = useState(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmMsg, setConfirmMsg] = useState('')
  const [confirmOnConfirm, setConfirmOnConfirm] = useState(null)

  const sekolah = read('sekolah')
  const absensi = read('absensi')
  const periode = period.periodeKey()

  // R4: satu-satunya sumber angka Beban/Dibayar/Sisa adalah finance.js.
  // Tidak ada sesi × tarif dihitung ulang di sini.
  const data = financialData({ sekolah, siswa: read('siswa'), trainer: trainers, absensi, honorPayments: payments, periode })
  const financeByTrainerId = Object.fromEntries(data.trainerFinance.map(t => [t.id, t]))

  function refreshPayments() {
    setPayments(read('honorPayments'))
  }

  function openPay(trainer) {
    setSelectedTrainer(trainer)
    setPayForm({ nominal: '', tanggalBayar: new Date().toISOString().slice(0, 10) })
    setModalOpen(true)
  }

  function writePayment(nominal) {
    // periode = periode akuntansi yang sedang dipilih di sidebar (bukan
    // hasil parsing tanggalBayar) — "Lunaskan" & pembayaran manual sama-sama
    // melunasi Beban Honor periode berjalan, terlepas kapan uangnya
    // secara fisik dibayarkan.
    upsert('honorPayments', newHonorPayment({ trainerId: selectedTrainer.id, periode, nominal: Number(nominal), tanggalBayar: payForm.tanggalBayar }))
    setModalOpen(false)
    refreshPayments()
  }

  function submitPayment() {
    if (!payForm.nominal || !payForm.tanggalBayar || !selectedTrainer) return
    const fin = financeByTrainerId[selectedTrainer.id]
    const sisa = fin ? fin.sisaHonor : 0
    if (Number(payForm.nominal) > sisa && sisa > 0) {
      setConfirmMsg(`Peringatan: nominal pembayaran (${formatRupiah(Number(payForm.nominal))}) melebihi sisa kewajiban (${formatRupiah(sisa)}). Lanjutkan?`)
      setConfirmOnConfirm(() => () => writePayment(payForm.nominal))
      setConfirmOpen(true)
      return
    }
    writePayment(payForm.nominal)
  }

  function lunaskan(trainer) {
    const fin = financeByTrainerId[trainer.id]
    const sisa = fin ? fin.sisaHonor : 0
    if (sisa <= 0) return
    const bulanLabel = new Date(`${periode}-01`).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
    setConfirmMsg(`Bayar sisa ${formatRupiah(sisa)} kepada ${trainer.nama} untuk ${bulanLabel}?`)
    setConfirmOnConfirm(() => () => {
      setSelectedTrainer(trainer)
      upsert('honorPayments', newHonorPayment({ trainerId: trainer.id, periode, nominal: sisa, tanggalBayar: new Date().toISOString().slice(0, 10) }))
      refreshPayments()
    })
    setConfirmOpen(true)
  }

  function deletePayment(id) {
    setConfirmMsg('Hapus entri pembayaran ini? Sisa kewajiban akan dihitung ulang.')
    const prevPayments = payments.filter(p => p.id !== id)
    setConfirmOnConfirm(() => () => {
      write('honorPayments', prevPayments)
      refreshPayments()
    })
    setConfirmOpen(true)
  }

  if (trainers.length === 0) {
    return (
      <div className="space-y-6 animate-fadeIn">
        <div className="flex items-center justify-between flex-wrap gap-4 bg-white p-4 rounded-2xl shadow-sm border">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Lembar Pembayaran Honor Trainer</h2>
            <p className="text-xs text-slate-500">Pencatatan realisasi pengeluaran kas pembayaran honorarium</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-8 shadow-sm border text-center">
          <p className="text-slate-400 text-sm">Tidak ada data trainer untuk pencatatan pembayaran.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex items-center justify-between flex-wrap gap-4 bg-white p-4 rounded-2xl shadow-sm border">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Lembar Pembayaran Honor Trainer</h2>
          <p className="text-xs text-slate-500">Pencatatan realisasi pengeluaran kas pembayaran honorarium — periode berjalan sesuai Tahun/Bulan di sidebar</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden border">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                <th className="py-4 px-6">Trainer</th>
                <th className="py-4 px-6">Sekolah Penugasan</th>
                <th className="py-4 px-6 text-center">Kehadiran</th>
                <th className="py-4 px-6 text-right">Tarif per Sesi</th>
                <th className="py-4 px-6 text-right">Akumulasi Beban</th>
                <th className="py-4 px-6 text-right text-emerald-600">Honor Dibayar</th>
                <th className="py-4 px-6 text-right text-rose-600">Sisa Kewajiban</th>
                <th className="py-4 px-6 text-center">Tindakan</th>
              </tr>
            </thead>
            <tbody className="divide-y text-sm">
              {trainers.map(t => {
                const fin = financeByTrainerId[t.id] || { hadirSesi: 0, tarif: t.honor, bebanHonor: 0, dibayar: 0, sisaHonor: 0 }
                const sekolahNama = (t.sekolahIds || []).map(id => sekolah.find(s => s.id === id)).filter(Boolean).map(s => s.nama).join(', ')
                const history = payments.filter(p => p.trainerId === t.id && p.periode === periode)
                const isExpanded = expandedTrainerId === t.id
                return (
                  <Fragment key={t.id}>
                    <tr className="hover:bg-slate-50/50 transition">
                      <td className="py-4 px-6 font-bold text-slate-800">{t.nama}</td>
                      <td className="py-4 px-6 font-semibold text-slate-600">{sekolahNama || 'Tidak ditugaskan'}</td>
                      <td className="py-4 px-6 text-center font-bold text-blue-700">{fin.hadirSesi} Pertemuan</td>
                      <td className="py-4 px-6 text-right font-medium text-slate-500">{formatRupiah(fin.tarif)}</td>
                      <td className="py-4 px-6 text-right font-bold text-slate-800">{formatRupiah(fin.bebanHonor)}</td>
                      <td className="py-4 px-6 text-right font-bold text-emerald-600">{formatRupiah(fin.dibayar)}</td>
                      <td className={`py-4 px-6 text-right font-extrabold ${fin.sisaHonor > 0 ? 'text-rose-600' : 'text-slate-400'}`}>{formatRupiah(fin.sisaHonor)}</td>
                      <td className="py-4 px-6 text-center">
                        <div className="flex items-center justify-center gap-1.5 flex-wrap">
                          {fin.sisaHonor > 0 && (
                            <button onClick={() => lunaskan(t)} className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[11px] px-3 py-1.5 rounded-lg transition shadow-sm active:scale-95">Lunaskan</button>
                          )}
                          <button onClick={() => openPay(t)} className="bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-[11px] px-3 py-1.5 rounded-lg transition shadow-sm active:scale-95">Bayar Manual</button>
                          {history.length > 0 && (
                            <button
                              onClick={() => setExpandedTrainerId(isExpanded ? null : t.id)}
                              className="text-slate-500 hover:text-blue-600 text-[11px] font-bold px-2 py-1.5 flex items-center gap-1"
                            >
                              Riwayat ({history.length})
                              <svg className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {isExpanded && history.length > 0 && (
                      <tr className="bg-slate-50/70">
                        <td colSpan="8" className="px-6 py-3">
                          <div className="space-y-1.5">
                            {history.map(p => (
                              <div key={p.id} className="flex items-center justify-between bg-white rounded-lg border border-slate-100 px-3 py-2 text-xs">
                                <span className="text-slate-500">{new Date(p.tanggalBayar).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                <span className="font-bold text-emerald-600">{formatRupiah(p.nominal)}</span>
                                <button onClick={() => deletePayment(p.id)} className="text-slate-400 hover:text-rose-600">
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                </button>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={`Bayar Honor — ${selectedTrainer?.nama || ''}`}>
        <div>
          <label className="text-xs font-bold text-slate-400 uppercase">Nominal Pembayaran</label>
          <RupiahInput
            value={payForm.nominal}
            onChange={val => setPayForm({ ...payForm, nominal: val })}
            className="w-full mt-1 rounded-lg border p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>
        <div>
          <label className="text-xs font-bold text-slate-400 uppercase">Tanggal Bayar</label>
          <input type="date" value={payForm.tanggalBayar} onChange={e => setPayForm({ ...payForm, tanggalBayar: e.target.value })} className="w-full mt-1 rounded-lg border p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600" />
        </div>
        {selectedTrainer && (() => {
          const fin = financeByTrainerId[selectedTrainer.id] || { bebanHonor: 0, dibayar: 0, sisaHonor: 0 }
          return (
            <div className="bg-slate-50 p-3 rounded-xl text-xs space-y-1">
              <p className="flex justify-between"><span className="text-slate-400">Beban (periode ini):</span><span className="font-bold">{formatRupiah(fin.bebanHonor)}</span></p>
              <p className="flex justify-between"><span className="text-slate-400">Sudah Dibayar:</span><span className="font-bold">{formatRupiah(fin.dibayar)}</span></p>
              <p className="flex justify-between text-rose-600"><span className="font-semibold">Sisa:</span><span className="font-extrabold">{formatRupiah(fin.sisaHonor)}</span></p>
            </div>
          )
        })()}
        <div className="flex gap-3 pt-2">
          <button onClick={submitPayment} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm py-2.5 rounded-xl transition shadow-sm">Simpan Pembayaran</button>
          <button onClick={() => setModalOpen(false)} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm py-2.5 rounded-xl transition">Batal</button>
        </div>
      </Modal>
      <ConfirmDialog open={confirmOpen} onCancel={() => { setConfirmOpen(false); setConfirmOnConfirm(null) }} onConfirm={() => confirmOnConfirm?.()} title="Konfirmasi" body={confirmMsg} danger={true} confirmLabel="Lanjutkan" />
    </div>
  )
}
