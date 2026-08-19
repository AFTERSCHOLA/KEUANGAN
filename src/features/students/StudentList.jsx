import { useState } from 'react'
import { read, write, upsert, usePeriod } from '../../lib/store.js'
import { formatRupiah, waNormalize, MONTHS, MONTH_KEYS, periodeKey } from '../../lib/format.js'
import { newSiswa } from '../../lib/constants.js'
import { attendanceStats } from '../../lib/finance.js'
import { elapsedPeriods, isTunggakan, sppPaidForPeriode, buildTagihanWaLink } from '../../lib/tunggakan.js'
import Modal from '../../components/Modal.jsx'
import ConfirmDialog from '../../components/ConfirmDialog.jsx'
import SppPaymentModal from '../payments/SppPaymentModal.jsx'

export default function StudentList({ readOnly = false }) {
  const [siswa, setSiswa] = useState(() => read('siswa'))
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(null)
  const [onlyTunggakan, setOnlyTunggakan] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmMsg, setConfirmMsg] = useState('')
  const [pendingRemoveId, setPendingRemoveId] = useState(null)
  const [sppPaymentSiswaId, setSppPaymentSiswaId] = useState(null)

  const sekolah = read('sekolah')
  const absensi = read('absensi')
  const sppPayments = read('sppPayments')
  const period = usePeriod()
  const elapsed = elapsedPeriods(period.selectedYear, period.selectedMonth)
  const stats = attendanceStats(absensi, period.periodeKey())

  function sppTarifOf(s) {
    return sekolah.find(sch => sch.id === s.sekolahId)?.spp || 0
  }

  function unpaidMonthsOf(s) {
    return elapsed
      .filter(({ periode }) => !sppPaidForPeriode(s, periode, sppPayments, sppTarifOf(s)))
      .map(e => e.monthName)
  }

  function sppTotalOf(s, periode) {
    return sppPayments
      .filter(p => p.siswaId === s.id && p.periode === periode)
      .reduce((sum, p) => sum + Number(p.nominal || 0), 0)
  }

  const isBillable = s => s.status !== 'Trial' // M5.4.3 — Trial siswa tidak masuk hitungan tunggakan sama sekali

  const visibleSiswa = onlyTunggakan ? siswa.filter(s => isBillable(s) && isTunggakan(s, elapsed, sppPayments, sppTarifOf(s))) : siswa

  function refresh() {
    setSiswa(read('siswa'))
  }

  function openAdd() {
    const defaultSekolah = sekolah.length > 0 ? sekolah[0] : null
    setForm(newSiswa(defaultSekolah?.id || '', defaultSekolah?.nama || ''))
    setModalOpen(true)
  }

  function openEdit(s) {
    // M5.4 — legacy siswa records predate `status`; default to 'Aktif' for display only,
    // real data untouched unless user actually saves.
    setForm({ status: 'Aktif', trialMulai: null, ...s })
    setModalOpen(true)
  }

  function save() {
    upsert('siswa', form)
    setModalOpen(false)
    refresh()
  }

  function remove(id) {
    setConfirmMsg('Hapus siswa ini?')
    setPendingRemoveId(id)
    setConfirmOpen(true)
  }

  function doRemove() {
    if (!pendingRemoveId) return
    const updated = siswa.filter(s => s.id !== pendingRemoveId)
    write('siswa', updated)
    setPendingRemoveId(null)
    setConfirmOpen(false)
    refresh()
  }

  if (siswa.length === 0 && !modalOpen) {
    return (
      <div className="space-y-6 animate-fadeIn">
        <div className="flex items-center justify-between flex-wrap gap-4 bg-white p-4 rounded-2xl shadow-sm border">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Manajemen Siswa</h2>
            <p className="text-xs text-slate-500">Profil, Kehadiran, Status SPP Bulanan</p>
          </div>
          {!readOnly && <button onClick={openAdd} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-extrabold px-5 py-2.5 rounded-xl transition shadow-sm active:scale-95">Tambah Siswa Baru</button>}
        </div>
        <div className="bg-white rounded-2xl p-8 shadow-sm border text-center">
          <p className="text-slate-400 text-sm">Belum ada data siswa. Klik "Tambah Siswa Baru" untuk memulai.</p>
        </div>
        {!readOnly && (
          <>
            <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Tambah Siswa">
              <SiswaForm form={form} setForm={setForm} save={save} onClose={() => setModalOpen(false)} sekolah={sekolah} period={period} />
            </Modal>
            <ConfirmDialog open={confirmOpen} onCancel={() => { setConfirmOpen(false); setPendingRemoveId(null) }} onConfirm={doRemove} title="Konfirmasi" body={confirmMsg} danger={true} confirmLabel="Hapus" />
          </>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex items-center justify-between flex-wrap gap-4 bg-white p-4 rounded-2xl shadow-sm border">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Manajemen Siswa</h2>
          <p className="text-xs text-slate-500">Profil, Kehadiran, Status SPP Bulanan</p>
        </div>
        {!readOnly && <button onClick={openAdd} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-extrabold px-5 py-2.5 rounded-xl transition shadow-sm active:scale-95">Tambah Siswa Baru</button>}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setOnlyTunggakan(v => !v)}
          className={`text-xs font-bold px-3.5 py-1.5 rounded-full transition ${
            onlyTunggakan ? 'bg-yellow-400 text-slate-900 shadow-sm' : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'
          }`}
        >
          Hanya yang menunggak
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden border">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                <th className="py-4 px-6">Siswa</th>
                <th className="py-4 px-6">Sekolah Mitra</th>
                <th className="py-4 px-6">Kontak WA</th>
                <th className="py-4 px-6 text-center">Kehadiran (Bulan Ini)</th>
                <th className="py-4 px-6 text-center">Kehadiran (Total)</th>
                <th className="py-4 px-6 text-center">SPP Bulan Ini</th>
                {onlyTunggakan && <th className="py-4 px-6">Bulan Menunggak</th>}
                {!readOnly && <th className="py-4 px-6 text-center">Aksi</th>}
              </tr>
            </thead>
            <tbody className="divide-y text-sm">
              {visibleSiswa.length === 0 && (
                <tr>
                  <td colSpan={onlyTunggakan ? (readOnly ? 7 : 8) : (readOnly ? 6 : 7)} className="py-12 text-center text-slate-400">
                    Tidak ada siswa yang menunggak.
                  </td>
                </tr>
              )}
              {visibleSiswa.map(s => (
                <tr key={s.id} className="hover:bg-slate-50/50">
                  <td className="py-4 px-6 flex items-center gap-3">
                    {s.foto ? (
                      <img src={s.foto} alt="" className="w-10 h-10 rounded-full object-cover border" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-slate-200 border flex items-center justify-center text-slate-400 text-xs font-bold">
                        {s.nama?.charAt(0).toUpperCase() || '?'}
                      </div>
                    )}
                    <div>
                      <p className="font-bold text-slate-800 flex items-center gap-1.5">
                        {s.nama}
                        {s.status === 'Trial' && (
                          <span className="text-[9px] font-extrabold uppercase bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full border border-yellow-200">
                            Trial
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-slate-400">{s.kelas}</p>
                    </div>
                  </td>
                  <td className="py-4 px-6 font-semibold text-slate-600">{s.sekolahNama}</td>
                  <td className="py-4 px-6">
                    <a href={`https://wa.me/${s.wa}`} target="_blank" className="text-blue-600 font-semibold hover:underline">{s.wa}</a>
                  </td>
                  <td className="py-4 px-6 text-center font-extrabold text-blue-700">{stats.studentPeriodCount[s.id] ? `${stats.studentPeriodCount[s.id]} Sesi` : '—'}</td>
                  <td className="py-4 px-6 text-center font-bold text-slate-500">{stats.studentTotalCount[s.id] ? `${stats.studentTotalCount[s.id]} Sesi` : '—'}</td>
                  <td className="py-4 px-6 text-center">
                    {s.status === 'Trial' ? (
                      <span className="bg-yellow-100 text-yellow-700 text-xs px-2.5 py-1 rounded-full font-bold">Trial — Belum Ditagih</span>
                    ) : sppPaidForPeriode(s, period.periodeKey(), sppPayments, sppTarifOf(s)) ? (
                      <span className="bg-emerald-100 text-emerald-700 text-xs px-2.5 py-1 rounded-full font-bold">Lunas</span>
                    ) : sppTotalOf(s, period.periodeKey()) > 0 ? (
                      <span className="bg-yellow-100 text-yellow-700 text-xs px-2.5 py-1 rounded-full font-bold">Sebagian Bayar</span>
                    ) : (
                      <span className="bg-rose-100 text-rose-800 text-xs px-2.5 py-1 rounded-full font-bold">Belum Bayar</span>
                    )}
                  </td>
                  {onlyTunggakan && (
                    <td className="py-4 px-6 text-xs font-semibold text-rose-600">
                      {unpaidMonthsOf(s).join(', ')}
                    </td>
                  )}
                  {!readOnly && (
                    <td className="py-4 px-6 text-center">
                      <div className="flex justify-center gap-2">
                        {isBillable(s) && isTunggakan(s, elapsed, sppPayments, sppTarifOf(s)) && (
                          <a
                            href={buildTagihanWaLink(s, sekolah.find(x => x.id === s.sekolahId)?.spp || 0, unpaidMonthsOf(s))}
                            target="_blank"
                            rel="noreferrer"
                            className="text-slate-500 hover:text-emerald-600"
                            title="Kirim tagihan via WhatsApp"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" strokeWidth="2"/></svg>
                          </a>
                        )}
                        {isBillable(s) && (
                          <button onClick={() => setSppPaymentSiswaId(s.id)} className="text-slate-500 hover:text-emerald-600" title="Catat pembayaran SPP">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                          </button>
                        )}
                        <button onClick={() => openEdit(s)} className="text-slate-500 hover:text-blue-600">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" strokeWidth="2"/></svg>
                        </button>
                        <button onClick={() => remove(s.id)} className="text-slate-500 hover:text-rose-600">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21" strokeWidth="2"/></svg>
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {!readOnly && (
        <>
          <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={form && siswa.find(s => s.id === form.id) ? 'Edit Siswa' : 'Tambah Siswa'}>
            {form && <SiswaForm form={form} setForm={setForm} save={save} onClose={() => setModalOpen(false)} sekolah={sekolah} period={period} />}
          </Modal>
          <ConfirmDialog open={confirmOpen} onCancel={() => { setConfirmOpen(false); setPendingRemoveId(null) }} onConfirm={doRemove} title="Konfirmasi" body={confirmMsg} danger={true} confirmLabel="Hapus" />
        </>
      )}
      <SppPaymentModal
        open={!!sppPaymentSiswaId}
        siswaId={sppPaymentSiswaId}
        sekolah={sekolah}
        period={period}
        onClose={() => setSppPaymentSiswaId(null)}
        onSaved={() => { setSppPaymentSiswaId(null); refresh() }}
      />
    </div>
  )
}

function SiswaForm({ form, setForm, save, onClose, sekolah, period }) {
  const { selectedYear, selectedMonth } = period || {}
  const monthNumList = [7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6]
  return (
    <>
      <div>
        <label className="text-xs font-bold text-slate-400 uppercase">Nama Siswa</label>
        <input value={form.nama} onChange={e => setForm({ ...form, nama: e.target.value })} className="w-full mt-1 rounded-lg border p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600" />
      </div>
      <div>
        <label className="text-xs font-bold text-slate-400 uppercase">Kelas</label>
        <input value={form.kelas} onChange={e => setForm({ ...form, kelas: e.target.value })} className="w-full mt-1 rounded-lg border p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600" />
      </div>
      <div>
        <label className="text-xs font-bold text-slate-400 uppercase">WhatsApp</label>
        <input value={form.wa} onChange={e => setForm({ ...form, wa: e.target.value })} onBlur={() => setForm({ ...form, wa: waNormalize(form.wa) })} className="w-full mt-1 rounded-lg border p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600" />
      </div>
      <div>
        <label className="text-xs font-bold text-slate-400 uppercase">Sekolah</label>
        <select value={form.sekolahId} onChange={e => {
          const s = sekolah.find(sch => sch.id === e.target.value)
          setForm({ ...form, sekolahId: e.target.value, sekolahNama: s ? s.nama : '' })
        }} className="w-full mt-1 rounded-lg border p-2.5 text-sm bg-white">
          <option value="">-- Pilih Sekolah --</option>
          {sekolah.map(s => <option key={s.id} value={s.id}>{s.nama}</option>)}
        </select>
      </div>
      <div>
        <label className="text-xs font-bold text-slate-400 uppercase">Foto (URL)</label>
        <input value={form.foto} onChange={e => setForm({ ...form, foto: e.target.value })} className="w-full mt-1 rounded-lg border p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600" />
      </div>
      <div>
        <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">Status Siswa</label>
        <div className="flex gap-4">
          {['Aktif', 'Trial', 'Berhenti'].map(opt => (
            <label key={opt} className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="status"
                checked={form.status === opt}
                onChange={() => setForm({
                  ...form,
                  status: opt,
                  trialMulai: opt === 'Trial' ? (form.trialMulai || new Date().toISOString().slice(0, 10)) : null,
                })}
                className="w-4 h-4 border-slate-300 text-blue-600 focus:ring-blue-600"
              />
              <span className="text-xs text-slate-600">{opt}</span>
            </label>
          ))}
        </div>
        {form.status === 'Trial' && (
          <div className="mt-2">
            <label className="text-xs font-bold text-slate-400 uppercase">Trial Mulai</label>
            <input
              type="date"
              value={form.trialMulai || ''}
              onChange={e => setForm({ ...form, trialMulai: e.target.value })}
              className="w-full mt-1 rounded-lg border p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
        )}
      </div>
      <div>
        <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">
          SPP Lunas <span className="normal-case font-normal text-slate-400">(otomatis dari riwayat pembayaran — catat lewat tombol pembayaran di daftar siswa)</span>
        </label>
        <div className="grid grid-cols-4 gap-2">
          {monthNumList.map((m, i) => {
            const key = periodeKey(m, selectedYear)
            const lunas = !!form.sppLunas?.[key]
            return (
              <span key={key} className={`text-[11px] font-bold px-2 py-1 rounded-full text-center ${
                lunas ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'
              }`}>
                {MONTHS[i]}
              </span>
            )
          })}
        </div>
      </div>
      <div className="flex gap-3 pt-2">
        <button onClick={save} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-sm py-2.5 rounded-xl transition shadow-sm">Simpan</button>
        <button onClick={onClose} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm py-2.5 rounded-xl transition">Batal</button>
      </div>
    </>
  )
}