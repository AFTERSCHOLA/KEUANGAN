import { useState } from 'react'
import { read } from '../../lib/store.js'
import { formatRupiah, MONTHS, periodeKey } from '../../lib/format.js'
import { newSppPayment, addSppPayment, recomputeSppLunasForSiswa } from '../../lib/sppPayments.js'
import Modal from '../../components/Modal.jsx'
import PhotoSlot from '../../components/PhotoSlot.jsx'
import AlertDialog from '../../components/AlertDialog.jsx'

const METODE_OPTIONS = ['Tunai-Sekolah', 'Tunai-Trainer', 'Tunai-Admin', 'Transfer']
const MONTH_NUM_LIST = [7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6]

export default function SppPaymentModal({ open, onClose, siswaId, sekolah, period, onSaved }) {
  const siswa = read('siswa').find(s => s.id === siswaId)
  const sekolahSiswa = sekolah?.find(s => s.id === siswa?.sekolahId)
  const defaultNominal = sekolahSiswa?.spp || 0

  const [periodeSelected, setPeriodeSelected] = useState(period?.periodeKey ? period.periodeKey() : '')
  const [nominal, setNominal] = useState(defaultNominal)
  const [tanggalBayar, setTanggalBayar] = useState(new Date().toISOString().slice(0, 10))
  const [metode, setMetode] = useState(METODE_OPTIONS[0])
  const [diterimaOleh, setDiterimaOleh] = useState('')
  const [bukti, setBukti] = useState(null)
  const [alertOpen, setAlertOpen] = useState(false)
  const [alertMsg, setAlertMsg] = useState('')

  if (!open || !siswa) return null

  function submit() {
    if (!periodeSelected || !nominal || !tanggalBayar || !metode || !diterimaOleh) {
      setAlertMsg('Lengkapi periode, nominal, tanggal, metode, dan penerima.')
      setAlertOpen(true)
      return
    }
    const payment = newSppPayment({
      siswaId,
      periode: periodeSelected,
      nominal: Number(nominal),
      tanggalBayar,
      metode,
      diterimaOleh,
      bukti,
    })
    addSppPayment(payment)
    recomputeSppLunasForSiswa(siswaId)
    if (onSaved) onSaved()
  }

  return (
    <Modal open={open} onClose={onClose} title={`Catat Pembayaran SPP — ${siswa.nama}`}>
      <AlertDialog open={alertOpen} onOk={() => setAlertOpen(false)} title="Peringatan" body={alertMsg} />
      <div className="space-y-4">
        <div>
          <label className="text-xs font-bold text-slate-400 uppercase">Periode</label>
          <select value={periodeSelected} onChange={e => setPeriodeSelected(e.target.value)} className="w-full mt-1 rounded-lg border p-2.5 text-sm bg-white">
            <option value="">-- Pilih Bulan --</option>
            {MONTH_NUM_LIST.map((m, i) => {
              const key = periodeKey(m, period?.selectedYear)
              return <option key={key} value={key}>{MONTHS[i]}</option>
            })}
          </select>
        </div>
        <div>
          <label className="text-xs font-bold text-slate-400 uppercase">Nominal</label>
          <input type="number" min={0} value={nominal} onChange={e => setNominal(e.target.value)} className="w-full mt-1 rounded-lg border p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600" />
          <p className="text-[11px] text-slate-400 mt-1">Tarif SPP sekolah: {formatRupiah(defaultNominal)}</p>
        </div>
        <div>
          <label className="text-xs font-bold text-slate-400 uppercase">Tanggal Bayar</label>
          <input type="date" value={tanggalBayar} onChange={e => setTanggalBayar(e.target.value)} className="w-full mt-1 rounded-lg border p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600" />
        </div>
        <div>
          <label className="text-xs font-bold text-slate-400 uppercase">Metode</label>
          <select value={metode} onChange={e => setMetode(e.target.value)} className="w-full mt-1 rounded-lg border p-2.5 text-sm bg-white">
            {METODE_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-bold text-slate-400 uppercase">Diterima Oleh</label>
          <input value={diterimaOleh} onChange={e => setDiterimaOleh(e.target.value)} placeholder="Nama penerima" className="w-full mt-1 rounded-lg border p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600" />
        </div>
        <PhotoSlot label="Bukti Pembayaran (opsional)" entry={bukti} onChange={setBukti} disabled={false} />
        <div className="flex gap-3 pt-2">
          <button onClick={submit} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-sm py-2.5 rounded-xl transition shadow-sm">Simpan Pembayaran</button>
          <button onClick={onClose} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm py-2.5 rounded-xl transition">Batal</button>
        </div>
      </div>
    </Modal>
  )
}