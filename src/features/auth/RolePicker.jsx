import { useState } from 'react'
import { readCached } from '../../lib/store.js'
import { login } from '../../lib/auth.js'

export default function RolePicker({ onSelect, onAuthenticated, production = false }) {
  return production
    ? <ProductionLogin onAuthenticated={onAuthenticated} />
    : <SoftRolePicker onSelect={onSelect} />
}

function SoftRolePicker({ onSelect }) {
  const [role, setRole] = useState(null)
  const [trainerId, setTrainerId] = useState('')
  const [cabangId, setCabangId] = useState('')
  const trainers = readCached('trainer')
  const cabang = readCached('cabang')

  const canSubmit =
    role === 'superadmin' ||
    (role === 'admin_cabang' && !!cabangId && cabang.some(c => c.id === cabangId)) ||
    (role === 'trainer' && !!trainerId && trainers.some(t => t.id === trainerId))

  function submit() {
    if (!canSubmit) return
    onSelect({
      role,
      trainerId: role === 'trainer' ? trainerId : null,
      cabangId: role === 'superadmin' ? null : cabangId || null,
    })
  }

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl animate-scaleIn max-w-lg w-full mx-4">
        <div className="bg-blue-900 px-6 py-4 rounded-t-2xl">
          <h3 className="text-lg font-bold text-yellow-300">Pilih Peran Masuk</h3>
          <p className="text-xs text-blue-200 mt-0.5">Pilih peran Anda untuk masuk ke aplikasi.</p>
        </div>

        <div className="p-6 space-y-4">
          <button
            aria-label="Pilih peran Superadmin"
            onClick={() => { setRole('superadmin'); setTrainerId(''); setCabangId('') }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition ${
              role === 'superadmin'
                ? 'border-blue-600 bg-blue-50'
                : 'border-slate-200 hover:border-blue-400'
            }`}
          >
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7-7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div>
              <p className="font-bold text-slate-800">Superadmin</p>
              <p className="text-xs text-slate-500">Akses penuh termasuk pengelolaan cabang.</p>
            </div>
          </button>

          <button
            aria-label="Pilih peran Admin Cabang"
            onClick={() => { setRole('admin_cabang'); setTrainerId(''); setCabangId('') }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition ${
              role === 'admin_cabang'
                ? 'border-blue-600 bg-blue-50'
                : 'border-slate-200 hover:border-blue-400'
            }`}
          >
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div>
              <p className="font-bold text-slate-800">Admin Cabang</p>
              <p className="text-xs text-slate-500">Akses data operasional pada cabang yang dipilih.</p>
            </div>
          </button>

          {role === 'admin_cabang' && (
            <div className="animate-fadeIn">
              <label className="text-xs font-bold text-slate-400 uppercase">Pilih Cabang Anda</label>
              <select
                aria-label="Pilih Cabang Anda"
                value={cabangId}
                onChange={e => setCabangId(e.target.value)}
                className="w-full mt-1 rounded-lg border p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="">— Pilih Cabang —</option>
                {cabang.map(c => <option key={c.id} value={c.id}>{c.nama}</option>)}
              </select>
              {cabang.length === 0 && (
                <p className="text-xs text-amber-600 mt-1.5">Belum ada data cabang. Buat dulu lewat akun Superadmin.</p>
              )}
            </div>
          )}

          <button
            aria-label="Pilih peran Trainer"
            onClick={() => { setRole('trainer'); setCabangId('') }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition ${
              role === 'trainer'
                ? 'border-blue-600 bg-blue-50'
                : 'border-slate-200 hover:border-blue-400'
            }`}
          >
            <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center text-yellow-600 font-bold">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div>
              <p className="font-bold text-slate-800">Trainer</p>
              <p className="text-xs text-slate-500">Akses terbatas untuk sesi mengajar.</p>
            </div>
          </button>

          {role === 'trainer' && (
            <div className="animate-fadeIn">
              <label className="text-xs font-bold text-slate-400 uppercase">Pilih Trainer Anda</label>
              <select
                value={trainerId}
                onChange={e => setTrainerId(e.target.value)}
                className="w-full mt-1 rounded-lg border p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="">— Pilih Trainer —</option>
                {trainers.map(t => <option key={t.id} value={t.id}>{t.nama}</option>)}
              </select>
              {trainers.length === 0 && (
                <p className="text-xs text-amber-600 mt-1.5">Belum ada data trainer. Buat dulu lewat akun Admin Cabang.</p>
              )}
            </div>
          )}

          <button
            onClick={submit}
            disabled={!canSubmit}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-extrabold text-sm py-2.5 rounded-xl transition shadow-sm"
          >
            Masuk
          </button>
        </div>
      </div>
    </div>
  )
}

function ProductionLogin({ onAuthenticated }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submit(event) {
    event.preventDefault()
    if (!username || !password || submitting) return
    setSubmitting(true)
    setError('')
    try {
      const user = await login(username, password)
      onAuthenticated(user)
    } catch (loginError) {
      setError(loginError.status === 401 ? 'Nama pengguna atau kata sandi salah.' : 'Login gagal. Coba lagi.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50">
      <form onSubmit={submit} className="bg-white rounded-2xl shadow-2xl animate-scaleIn max-w-lg w-full mx-4 overflow-hidden">
        <div className="bg-blue-900 px-6 py-4">
          <h3 className="text-lg font-bold text-yellow-300">Masuk ke Afterschola</h3>
          <p className="text-xs text-blue-200 mt-0.5">Gunakan akun yang diberikan administrator.</p>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-400 uppercase">Nama Pengguna</label>
            <input autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} className="w-full mt-1 rounded-lg border p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600" />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-400 uppercase">Kata Sandi</label>
            <input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} className="w-full mt-1 rounded-lg border p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600" />
          </div>
          {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
          <button type="submit" disabled={!username || !password || submitting} className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-extrabold text-sm py-2.5 rounded-xl transition shadow-sm">
            {submitting ? 'Memeriksa...' : 'Masuk'}
          </button>
        </div>
      </form>
    </div>
  )
}
