import { useState } from 'react'
import { read, upsert, write } from '../../lib/store.js'
import { formatRupiah } from '../../lib/format.js'
import { generateId } from '../../lib/constants.js'
import Modal from '../../components/Modal.jsx'

export default function PaymentTable() {
  const [trainers] = useState(() => read('trainer'))
  const [payments, setPayments] = useState(() => read('honorPayments'))
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedTrainer, setSelectedTrainer] = useState(null)
  const [payForm, setPayForm] = useState({ nominal: '', tanggalBayar: new Date().toISOString().slice(0, 10) })

  function refreshPayments() {
    setPayments(read('honorPayments'))
  }

  function openPay(trainer) {
    setSelectedTrainer(trainer)
    setPayForm({ nominal: '', tanggalBayar: new Date().toISOString().slice(0, 10) })
    setModalOpen(true)
  }

  function submitPayment() {
    if (!payForm.nominal || !payForm.tanggalBayar || !selectedTrainer) return
    const absensi = read('absensi')
    const jumlahSesi = absensi.filter(a => a.trainerId === selectedTrainer.id).length
    const beban = jumlahSesi * (selectedTrainer.honor || 0)
    const dibayar = payments.filter(p => p.trainerId === selectedTrainer.id).reduce((sum, p) => sum + p.nominal, 0)
    const sisa = beban - dibayar
    if (payForm.nominal > sisa && sisa > 0) {
      if (!confirm(`Peringatan: nominal pembayaran (Rp ${payForm.nominal.toLocaleString()}) melebihi sisa kewajiban (Rp ${sisa.toLocaleString()}). Lanjutkan?`)) return
    }
    const payment = {
      id: generateId('hp'),
      trainerId: selectedTrainer.id,
      nominal: Number(payForm.nominal),
      tanggalBayar: payForm.tanggalBayar,
    }
    upsert('honorPayments', payment)
    setModalOpen(false)
    refreshPayments()
  }

  function deletePayment(id) {
    if (!confirm('Hapus entri pembayaran ini?')) return
    const updated = payments.filter(p => p.id !== id)
    write('honorPayments', updated)
    refreshPayments()
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
          <p className="text-xs text-slate-500">Pencatatan realisasi pengeluaran kas pembayaran honorarium</p>
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
                const absensi = read('absensi')
                const jumlahSesi = absensi.filter(a => a.trainerId === t.id).length
                const beban = jumlahSesi * (t.honor || 0)
                const dibayar = payments.filter(p => p.trainerId === t.id).reduce((sum, p) => sum + p.nominal, 0)
                const sisa = beban - dibayar
                const sekolah = read('sekolah')
                const sekolahNama = (t.sekolahIds || []).map(id => sekolah.find(s => s.id === id)).filter(Boolean).map(s => s.nama).join(', ')
                return (
                  <tr key={t.id} className="hover:bg-slate-50/50 transition">
                    <td className="py-4 px-6 font-bold text-slate-800">{t.nama}</td>
                    <td className="py-4 px-6 font-semibold text-slate-600">{sekolahNama || 'Tidak ditugaskan'}</td>
                    <td className="py-4 px-6 text-center font-bold text-blue-700">{jumlahSesi} Pertemuan</td>
                    <td className="py-4 px-6 text-right font-medium text-slate-500">{formatRupiah(t.honor)}</td>
                    <td className="py-4 px-6 text-right font-bold text-slate-800">{formatRupiah(beban)}</td>
                    <td className="py-4 px-6 text-right font-bold text-emerald-600">{formatRupiah(dibayar)}</td>
                    <td className="py-4 px-6 text-right font-extrabold text-rose-600">{formatRupiah(sisa)}</td>
                    <td className="py-4 px-6 text-center">
                      <button onClick={() => openPay(t)} className="bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-[11px] px-3.5 py-1.5 rounded-lg transition shadow-sm active:scale-95">Bayar Honor</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={`Bayar Honor — ${selectedTrainer?.nama || ''}`}>
        <div>
          <label className="text-xs font-bold text-slate-400 uppercase">Nominal Pembayaran</label>
          <input type="number" min="0" value={payForm.nominal} onChange={e => setPayForm({ ...payForm, nominal: e.target.value })} className="w-full mt-1 rounded-lg border p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600" />
        </div>
        <div>
          <label className="text-xs font-bold text-slate-400 uppercase">Tanggal Bayar</label>
          <input type="date" value={payForm.tanggalBayar} onChange={e => setPayForm({ ...payForm, tanggalBayar: e.target.value })} className="w-full mt-1 rounded-lg border p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600" />
        </div>
        {selectedTrainer && (() => {
          const absensi = read('absensi')
          const jumlahSesi = absensi.filter(a => a.trainerId === selectedTrainer.id).length
          const beban = jumlahSesi * (selectedTrainer.honor || 0)
          const dibayar = payments.filter(p => p.trainerId === selectedTrainer.id).reduce((sum, p) => sum + p.nominal, 0)
          return (
            <div className="bg-slate-50 p-3 rounded-xl text-xs space-y-1">
              <p className="flex justify-between"><span className="text-slate-400">Beban:</span><span className="font-bold">{formatRupiah(beban)}</span></p>
              <p className="flex justify-between"><span className="text-slate-400">Sudah Dibayar:</span><span className="font-bold">{formatRupiah(dibayar)}</span></p>
              <p className="flex justify-between text-rose-600"><span className="font-semibold">Sisa:</span><span className="font-extrabold">{formatRupiah(beban - dibayar)}</span></p>
            </div>
          )
        })()}
        <div className="flex gap-3 pt-2">
          <button onClick={submitPayment} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm py-2.5 rounded-xl transition shadow-sm">Simpan Pembayaran</button>
          <button onClick={() => setModalOpen(false)} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm py-2.5 rounded-xl transition">Batal</button>
        </div>
      </Modal>
    </div>
  )
}