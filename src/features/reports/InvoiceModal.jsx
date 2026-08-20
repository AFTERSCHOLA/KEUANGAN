import { useState } from 'react'
import Modal from '../../components/Modal.jsx'
import ConfirmDialog from '../../components/ConfirmDialog.jsx'
import { formatRupiah, MONTHS, periodeKey } from '../../lib/format.js'
import { readCached, usePeriod } from '../../lib/store.js'
import { newInvoice, addInvoice, invoicesForSekolah, setInvoiceStatus, deleteInvoice } from '../../lib/invoices.js'

const MONTH_NUM_LIST = [7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6]

export default function InvoiceModal({ open, onClose, sekolah, onPrint }) {
  const period = usePeriod()
  const [mode, setMode] = useState('bulanan')
  const [bulanTunggal, setBulanTunggal] = useState(MONTH_NUM_LIST[0])
  const [semester, setSemester] = useState('ganjil')
  const [pjSekolah, setPjSekolah] = useState('')
  const [uraian, setUraian] = useState('')
  const [jumlahPertemuan, setJumlahPertemuan] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmMsg, setConfirmMsg] = useState('')
  const [confirmAction, setConfirmAction] = useState(null)
  const [tick, setTick] = useState(0)

  if (!open || !sekolah) return null

  const cabangKode = readCached('cabang').find(c => c.id === sekolah.cabangId)?.kode
  const siswaAktif = readCached('siswa').filter(s => s.sekolahId === sekolah.id && s.status !== 'Trial')
  const jumlahSiswa = siswaAktif.length

  const periodeList = mode === 'bulanan'
    ? [periodeKey(bulanTunggal, period.selectedYear)]
    : (semester === 'ganjil' ? [7, 8, 9, 10, 11, 12] : [1, 2, 3, 4, 5, 6]).map(m => periodeKey(m, period.selectedYear))

  const hargaSatuan = (sekolah.spp || 0) * periodeList.length
  const total = jumlahSiswa * hargaSatuan

  function handleCreate() {
    const bulanLabel = MONTHS[MONTH_NUM_LIST.indexOf(bulanTunggal)]
    const defaultUraian = mode === 'semester'
      ? `Pembayaran kegiatan Ekstrakurikuler Semester ${semester === 'ganjil' ? 'Ganjil' : 'Genap'} ${period.selectedYear}/${period.selectedYear + 1}${jumlahPertemuan ? ` (${jumlahPertemuan}x Pertemuan)` : ''}`
      : `Pembayaran SPP bulan ${bulanLabel} ${periodeList[0].slice(0, 4)}`

    const inv = newInvoice({
      sekolahId: sekolah.id,
      mode,
      periodeList,
      jumlahSiswa,
      hargaSatuan,
      jumlahPertemuan: jumlahPertemuan ? Number(jumlahPertemuan) : null,
      pjSekolah,
      uraian: uraian || defaultUraian,
      tanggalTerbit: new Date().toISOString().slice(0, 10),
      cabangKode,
    })
    addInvoice(inv)
    setPjSekolah('')
    setUraian('')
    setJumlahPertemuan('')
    setTick(t => t + 1)
  }

  function advanceStatus(inv) {
    const next = inv.status === 'Draft' ? 'Terbit' : inv.status === 'Terbit' ? 'Lunas' : null
    if (!next) return
    setConfirmMsg(next === 'Terbit'
      ? 'Terbitkan invoice ini? Nomor resmi akan digenerate dan tidak bisa diubah lagi.'
      : 'Tandai invoice ini sebagai Lunas?')
    setConfirmAction(() => () => {
      setInvoiceStatus(inv.id, next)
      setTick(t => t + 1)
    })
    setConfirmOpen(true)
  }

  function removeInvoice(inv) {
    setConfirmMsg('Hapus invoice draft ini?')
    setConfirmAction(() => () => {
      deleteInvoice(inv.id)
      setTick(t => t + 1)
    })
    setConfirmOpen(true)
  }

  const existing = invoicesForSekolah(sekolah.id).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))

  return (
    <Modal open={open} onClose={onClose} title={`Invoice — ${sekolah.nama}`}>
      <ConfirmDialog open={confirmOpen} onCancel={() => setConfirmOpen(false)} onConfirm={() => { confirmAction?.(); setConfirmOpen(false) }} title="Konfirmasi" body={confirmMsg} confirmLabel="Ya, Lanjutkan" />

      <div className="space-y-4">
        <div className="border rounded-xl p-4 bg-slate-50 space-y-3">
          <h4 className="text-sm font-bold text-slate-800">Buat Invoice Baru</h4>
          <div>
            <label className="text-xs font-bold text-slate-400 uppercase">Mode</label>
            <div className="flex gap-2 mt-1">
              {['bulanan', 'semester'].map(m => (
                <button key={m} onClick={() => setMode(m)} className={`text-xs font-bold px-3 py-1.5 rounded-full ${mode === m ? 'bg-blue-600 text-white' : 'bg-white border text-slate-500'}`}>
                  {m === 'bulanan' ? 'Per Bulan' : 'Per Semester'}
                </button>
              ))}
            </div>
          </div>

          {mode === 'bulanan' ? (
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase">Bulan</label>
              <select value={bulanTunggal} onChange={e => setBulanTunggal(Number(e.target.value))} className="w-full mt-1 rounded-lg border p-2 text-sm bg-white">
                {MONTH_NUM_LIST.map((m, i) => <option key={m} value={m}>{MONTHS[i]}</option>)}
              </select>
            </div>
          ) : (
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase">Semester</label>
              <div className="flex gap-2 mt-1">
                <button onClick={() => setSemester('ganjil')} className={`text-xs font-bold px-3 py-1.5 rounded-full ${semester === 'ganjil' ? 'bg-blue-600 text-white' : 'bg-white border text-slate-500'}`}>Ganjil (Jul-Des)</button>
                <button onClick={() => setSemester('genap')} className={`text-xs font-bold px-3 py-1.5 rounded-full ${semester === 'genap' ? 'bg-blue-600 text-white' : 'bg-white border text-slate-500'}`}>Genap (Jan-Jun)</button>
              </div>
            </div>
          )}

          <div>
            <label className="text-xs font-bold text-slate-400 uppercase">PJ Sekolah <span className="normal-case font-normal">(opsional)</span></label>
            <input value={pjSekolah} onChange={e => setPjSekolah(e.target.value)} placeholder="Nama penanggung jawab sekolah" className="w-full mt-1 rounded-lg border p-2 text-sm" />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-400 uppercase">Jumlah Pertemuan <span className="normal-case font-normal">(opsional, buat teks uraian)</span></label>
            <input type="number" min={0} value={jumlahPertemuan} onChange={e => setJumlahPertemuan(e.target.value)} className="w-full mt-1 rounded-lg border p-2 text-sm" />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-400 uppercase">Uraian <span className="normal-case font-normal">(kosongkan untuk otomatis)</span></label>
            <textarea value={uraian} onChange={e => setUraian(e.target.value)} rows={2} className="w-full mt-1 rounded-lg border p-2 text-sm" />
          </div>

          <div className="bg-white rounded-lg p-3 text-xs space-y-1 border">
            <p className="flex justify-between"><span className="text-slate-400">Jumlah Siswa (aktif, non-trial):</span><span className="font-bold">{jumlahSiswa}</span></p>
            <p className="flex justify-between"><span className="text-slate-400">Harga Satuan (SPP × {periodeList.length} bulan):</span><span className="font-bold">{formatRupiah(hargaSatuan)}</span></p>
            <p className="flex justify-between text-sm border-t pt-1"><span className="font-semibold">Total:</span><span className="font-extrabold text-blue-700">{formatRupiah(total)}</span></p>
          </div>

          <button onClick={handleCreate} disabled={jumlahSiswa === 0} className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-extrabold text-sm py-2.5 rounded-xl transition">
            {jumlahSiswa === 0 ? 'Tidak ada siswa aktif' : 'Simpan sebagai Draft'}
          </button>
        </div>

        <div>
          <h4 className="text-sm font-bold text-slate-800 mb-2">Riwayat Invoice</h4>
          {existing.length === 0 ? (
            <p className="text-xs text-slate-400">Belum ada invoice untuk sekolah ini.</p>
          ) : (
            <div className="space-y-2">
              {existing.map(inv => (
                <div key={inv.id} className="flex items-center justify-between bg-white border rounded-lg px-3 py-2 text-xs">
                  <div>
                    <p className="font-bold text-slate-800">{inv.nomor || 'Draft'}</p>
                    <p className="text-slate-400">{formatRupiah(inv.total)} — {inv.mode === 'semester' ? 'Semester' : 'Bulanan'}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 rounded-full font-bold ${
                      inv.status === 'Lunas' ? 'bg-emerald-100 text-emerald-700' :
                      inv.status === 'Terbit' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'
                    }`}>{inv.status}</span>
                    {inv.status !== 'Lunas' && (
                      <button onClick={() => advanceStatus(inv)} className="text-emerald-600 hover:underline font-bold">
                        {inv.status === 'Draft' ? 'Terbitkan' : 'Tandai Lunas'}
                      </button>
                    )}
                    <button onClick={() => onPrint(inv, sekolah)} className="text-blue-600 hover:underline font-bold">Cetak</button>
                    {inv.status === 'Draft' && (
                      <button onClick={() => removeInvoice(inv)} className="text-rose-500 hover:underline font-bold">Hapus</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}