import { read } from '../../lib/store.js'
import { formatRupiah } from '../../lib/format.js'

export default function OverviewCards() {
  const sekolah = read('sekolah')
  const siswa = read('siswa')
  const trainer = read('trainer')

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex items-center justify-between flex-wrap gap-4 bg-white p-4 rounded-2xl shadow-sm border">
        <div>
          <h3 className="text-base font-bold text-slate-800">Ringkasan Eksekutif</h3>
          <p className="text-xs text-slate-500">Gambaran umum data Afterschola.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl shadow-sm border-t-4 border-blue-600 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Sekolah Mitra</p>
            <h4 className="text-3xl font-extrabold text-blue-900 mt-1">{sekolah.length}</h4>
          </div>
          <div className="bg-blue-100 p-3 rounded-xl text-blue-600">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-sm border-t-4 border-yellow-400 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Siswa Terdaftar</p>
            <h4 className="text-3xl font-extrabold text-slate-800 mt-1">{siswa.length}</h4>
          </div>
          <div className="bg-yellow-100 p-3 rounded-xl text-yellow-600">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-sm border-t-4 border-blue-600 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Trainer Aktif</p>
            <h4 className="text-3xl font-extrabold text-blue-900 mt-1">{trainer.length}</h4>
          </div>
          <div className="bg-blue-100 p-3 rounded-xl text-blue-600">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-sm border-t-4 border-emerald-500 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Laba Bersih</p>
            <h4 className="text-2xl font-extrabold text-emerald-600 mt-1">{formatRupiah(0)}</h4>
          </div>
          <div className="bg-emerald-100 p-3 rounded-xl text-emerald-600">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </div>
        </div>
      </div>

      {sekolah.length === 0 && siswa.length === 0 && trainer.length === 0 && (
        <div className="bg-white rounded-2xl p-8 shadow-sm border text-center">
          <p className="text-slate-400 text-sm">Belum ada data. Mulai dengan menambahkan sekolah mitra.</p>
        </div>
      )}
    </div>
  )
}