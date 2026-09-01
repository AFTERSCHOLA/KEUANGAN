import { useEffect, useRef, useState } from 'react'

/**
 * Avatar dropdown for the page header.
 * Shows the first letter of the username and a sync-pending badge.
 * Items: Sync, Backup & Restore, Pengaturan, Keluar.
 */
export default function AccountMenu({
  username,
  syncPending = 0,
  syncing = false,
  onSync,
  onOpenBackup,
  onOpenSettings,
  onLogout,
}) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef(null)
  const initial = (username || '?').trim().charAt(0).toUpperCase()

  useEffect(() => {
    if (!open) return
    function onClick(e) {
      if (!wrapperRef.current?.contains(e.target)) setOpen(false)
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function handle(action) {
    setOpen(false)
    action?.()
  }

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Akun"
        className="relative w-10 h-10 rounded-full bg-blue-900 text-yellow-300 font-extrabold text-sm border-2 border-yellow-400 hover:border-yellow-300 focus:outline-none focus:ring-2 focus:ring-yellow-300 transition shrink-0"
      >
        {initial}
        {syncPending > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white">
            {syncPending}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-60 rounded-xl bg-white shadow-2xl border border-slate-100 overflow-hidden z-50 animate-fadeIn"
        >
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Masuk sebagai</p>
            <p className="text-sm font-bold text-slate-800 truncate">{username}</p>
          </div>
          <div className="py-1">
            <MenuItem
              onClick={() => handle(onSync)}
              disabled={syncing || syncPending === 0}
              icon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h5M20 20v-5h-5M5.5 9A7 7 0 0117 6.5L20 9M19 15a7 7 0 01-11.5 2.5L5 15" />
                </svg>
              }
              label={syncing ? 'Menyinkronkan...' : `Sinkronisasi${syncPending > 0 ? ` (${syncPending})` : ''}`}
            />
            <MenuItem
              onClick={() => handle(onOpenBackup)}
              icon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
                </svg>
              }
              label="Backup & Restore"
            />
            <MenuItem
              onClick={() => handle(onOpenSettings)}
              icon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              }
              label="Pengaturan"
            />
            <div className="my-1 border-t border-slate-100" />
            <MenuItem
              onClick={() => handle(onLogout)}
              tone="danger"
              icon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                </svg>
              }
              label="Keluar"
            />
          </div>
        </div>
      )}
    </div>
  )
}

function MenuItem({ onClick, icon, label, disabled = false, tone = 'default' }) {
  const toneClass =
    tone === 'danger'
      ? 'text-rose-600 hover:bg-rose-50'
      : 'text-slate-700 hover:bg-slate-50'
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center gap-3 px-4 py-2 text-sm font-semibold transition ${toneClass} disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      <span className="shrink-0">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  )
}