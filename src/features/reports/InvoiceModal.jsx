import { useState } from 'react'
import Modal from '../../components/Modal.jsx'
import ConfirmDialog from '../../components/ConfirmDialog.jsx'
import { formatRupiah, MONTHS, periodeKey } from '../../lib/format.js'
import { readCached, usePeriod, read } from '../../lib/store.js'
import {
  invoicesForSekolah,
  invoiceSettlement,
  carryOverLines,
  generateInvoiceForSekolah,
  deleteInvoiceServer,
} from '../../lib/invoices.js'

const MONTH_NUM_LIST = [7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6]

// SB.C.2 — invoice creation sekarang lewat server (invoices-generate.php),
// bukan localStorage lagi (D-SB10). Konsekuensinya:
//   - Tidak ada lagi tahap "Draft" tersimpan: server generator langsung
//     set status 'Terbit'. Tombol "Terbitkan"/"Hapus draft" dihapus.
//   - Field "PJ Sekolah" dihapus dari form: server mengambil pjNama dari
//     record sekolah itu sendiri, bukan input per-invoice (tidak ada
//     padanannya di generateInvoicesForPeriod()).
//   - Preview "Harga Satuan"/"Total" di bawah ini adalah ESTIMASI: dihitung
//     dari sekolah.spp flat, sedangkan server menghitung ulang per siswa
//     (memperhitungkan siswa.sppOverride kalau ada) dan bisa menghasilkan
//     beberapa baris tarif berbeda. Total final yang sebenarnya baru
//     terlihat di Riwayat Invoice setelah invoice dibuat.
export default function InvoiceModal({ open, onClose, sekolah, onPrint }) {
  const period = usePeriod()
  const [mode, setMode] = useState('bulanan')
  const [bulanTunggal, setBulanTunggal] = useState(MONTH_NUM_LIST[0])
  const [semester, setSemester] = useState('ganjil')
  const [uraian, setUraian] = useState('')
  const [jumlahPertemuan, setJumlahPertemuan] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmMsg, setConfirmMsg] = useState('')
  const [confirmAction, setConfirmAction] = useState(null)
  const [tick, setTick] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  if (!open || !sekolah) return null

  const siswaAktif = readCached('siswa').filter(s => s.sekolahId === sekolah.id && s.status !== 'Trial')
  const jumlahSiswa = siswaAktif.length

  const periodeList = mode === 'bulanan'
    ? [periodeKey(bulanTunggal, period.selectedYear)]
    : (semester === 'ganjil' ? [7, 8, 9, 10, 11, 12] : [1, 2, 3, 4, 5, 6]).map(m => periodeKey(m, period.selectedYear))

  const hargaSatuanEstimasi = (sekolah.spp || 0) * periodeList.length
  const totalEstimasi = jumlahSiswa * hargaSatuanEstimasi

  const existing = invoicesForSekolah(sekolah.id).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))

  // Diambil sekali di luar map biar nggak baca cache berkali-kali per baris.
  const sppPaymentsAll = readCached('sppPayments')
  const siswaAll = readCached('siswa')

  async function doGenerate() {
    setSubmitting(true)
    setErrorMsg('')
    try {
      const bulanLabel = MONTHS[MONTH_NUM_LIST.indexOf(bulanTunggal)]
      const defaultUraian = mode === 'semester'
        ? `Pembayaran kegiatan Ekstrakurikuler Semester ${semester === 'ganjil' ? 'Ganjil' : 'Genap'} ${period.selectedYear}/${period.selectedYear + 1}${jumlahPertemuan ? ` (${jumlahPertemuan}x Pertemuan)` : ''}`
        : `Pembayaran SPP bulan ${bulanLabel} ${periodeList[0].slice(0, 4)}`

      // Preview object dipakai HANYA untuk hitung carry-over sebelum
      // invoice sungguhan ada — status 'Terbit' di sini murni supaya
      // carryOverLines() mau menganggap ini "invoice yang akan diterbitkan"
      // saat mencari invoice sebelumnya; objek ini TIDAK pernah disimpan.
      const draftPreview = {
        id: 'preview',
        sekolahId: sekolah.id,
        status: 'Terbit',
        tanggalTerbit: new Date().toISOString().slice(0, 10),
      }
      const carryLines = carryOverLines(draftPreview, {
        invoices: existing,
        sppPayments: sppPaymentsAll,
        siswa: siswaAll,
      })

      await generateInvoiceForSekolah({
        sekolahId: sekolah.id,
        cabangId: sekolah.cabangId,
        uraian: uraian || defaultUraian,
        periodeList,
        carryOverLines: carryLines,
      })

      await read('invoices')
      setUraian('')
      setJumlahPertemuan('')
      setTick(t => t + 1)
    } catch (error) {
      setErrorMsg(error?.message || 'Gagal membuat invoice')
    } finally {
      setSubmitting(false)
    }
  }

  function handleCreateClick() {
    setConfirmMsg('Buat & terbitkan invoice ini? Nomor resmi akan digenerate langsung dan tidak bisa diubah lagi.')
    setConfirmAction(() => doGenerate)
    setConfirmOpen(true)
  }

  async function removeInvoice(inv) {
    setConfirmMsg('Hapus invoice ini? Tindakan ini tidak bisa dibatalkan.')
    setConfirmAction(() => async () => {
      setSubmitting(true)
      setErrorMsg('')
      try {
        const result = await deleteInvoiceServer(inv.id)
        if (result?.status === 'forbidden') {
          setErrorMsg(result.message || 'Tidak diizinkan menghapus invoice ini')
        } else {
          await read('invoices')
          setTick(t => t + 1)
        }
      } catch (error) {
        setErrorMsg(error?.message || 'Gagal menghapus invoice')
      } finally {
        setSubmitting(false)
      }
    })
    setConfirmOpen(true)
  }

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
            <label className="text-xs font-bold text-slate-400 uppercase">Jumlah Pertemuan <span className="normal-case font-normal">(opsional, buat teks uraian)</span></label>
            <input type="number" min={0} value={jumlahPertemuan} onChange={e => setJumlahPertemuan(e.target.value)} className="w-full mt-1 rounded-lg border p-2 text-sm" />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-400 uppercase">Uraian <span className="normal-case font-normal">(kosongkan untuk otomatis)</span></label>
            <textarea value={uraian} onChange={e => setUraian(e.target.value)} rows={2} className="w-full mt-1 rounded-lg border p-2 text-sm" />
          </div>

          <div className="bg-white rounded-lg p-3 text-xs space-y-1 border">
            <p className="flex justify-between"><span className="text-slate-400">Jumlah Siswa (aktif, non-trial):</span><span className="font-bold">{jumlahSiswa}</span></p>
            <p className="flex justify-between"><span className="text-slate-400">Estimasi Harga Satuan (SPP × {periodeList.length} bulan):</span><span className="font-bold">{formatRupiah(hargaSatuanEstimasi)}</span></p>
            <p className="flex justify-between text-sm border-t pt-1"><span className="font-semibold">Estimasi Total:</span><span className="font-extrabold text-blue-700">{formatRupiah(totalEstimasi)}</span></p>
            <p className="text-slate-400 italic pt-1">Total final dihitung server (bisa beda kalau ada siswa dengan tarif khusus) — lihat Riwayat Invoice setelah dibuat.</p>
          </div>

          {errorMsg && <p className="text-xs text-rose-600 font-semibold">{errorMsg}</p>}

          <button onClick={handleCreateClick} disabled={jumlahSiswa === 0 || submitting} className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-extrabold text-sm py-2.5 rounded-xl transition">
            {jumlahSiswa === 0 ? 'Tidak ada siswa aktif' : submitting ? 'Memproses...' : 'Buat & Terbitkan Invoice'}
          </button>
        </div>

        <div>
          <h4 className="text-sm font-bold text-slate-800 mb-2">Riwayat Invoice</h4>
          {existing.length === 0 ? (
            <p className="text-xs text-slate-400">Belum ada invoice untuk sekolah ini.</p>
          ) : (
            <div className="space-y-2">
              {existing.map(inv => {
                // status !== 'Draft' mencakup 'Terbit' (alur baru, satu-satunya
                // status yang server generator hasilkan) dan legacy 'Draft'/
                // 'Lunas' dari invoice lama sebelum SB.C.2 (lihat catatan LEGACY
                // di invoices.js — record semacam ini bisa saja masih ada di
                // cache lokal, tapi tidak akan pernah dibuat lagi).
                const isLegacyDraft = inv.status === 'Draft'
                const settlement = !isLegacyDraft
                  ? invoiceSettlement(inv, { sppPayments: sppPaymentsAll, siswa: siswaAll })
                  : null

                const carryLines = Array.isArray(inv.carryOverLines) ? inv.carryOverLines : []
                const displayStatus = isLegacyDraft ? 'Draft (legacy)' : settlement.status

                return (
                  <div key={inv.id} className="flex items-center justify-between bg-white border rounded-lg px-3 py-2 text-xs">
                    <div>
                      <p className="font-bold text-slate-800">{inv.nomor || inv.nomorInvoice || 'Draft'}</p>
                      <p className="text-slate-400">{formatRupiah(inv.grandTotal ?? inv.total)} — {inv.periode || (inv.mode === 'semester' ? 'Semester' : 'Bulanan')}</p>
                      {!isLegacyDraft && (
                        <p className="text-slate-400 mt-0.5">
                          Dibayar {formatRupiah(settlement.dibayar)} · Sisa {formatRupiah(settlement.sisa)}
                          {settlement.credit > 0 && ` · Lebih bayar ${formatRupiah(settlement.credit)}`}
                        </p>
                      )}
                      {carryLines.length > 0 && (
                        <div className="mt-1 space-y-0.5">
                          {carryLines.map(line => (
                            <p
                              key={`${line.invoiceId}-${line.kind}`}
                              className={line.amount < 0 ? 'text-emerald-600' : 'text-amber-600'}
                            >
                              {line.description}: {formatRupiah(Math.abs(line.amount))}
                              {line.amount < 0 ? ' (credit)' : ''}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded-full font-bold ${
                        displayStatus === 'Lunas' ? 'bg-emerald-100 text-emerald-700' :
                        displayStatus === 'Belum Lunas' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'
                      }`}>{displayStatus}</span>
                      <button onClick={() => onPrint(inv, sekolah)} className="text-blue-600 hover:underline font-bold">Cetak</button>
                      <button onClick={() => removeInvoice(inv)} disabled={submitting} className="text-rose-500 hover:underline font-bold disabled:opacity-40">Hapus</button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}