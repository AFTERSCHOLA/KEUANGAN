import { useState, useEffect } from 'react'
import SchoolList from './features/schools/SchoolList.jsx'
import StudentList from './features/students/StudentList.jsx'
import TrainerList from './features/trainers/TrainerList.jsx'
import AttendanceTab from './features/attendance/index.jsx'
import PaymentTable from './features/payments/PaymentTable.jsx'
import FinanceReport from './features/reports/FinanceReport.jsx'
import AgingReport from './features/reports/AgingReport.jsx'
import OverviewCards from './features/overview/OverviewCards.jsx'
import Modal from './components/Modal.jsx'
import BackupRestorePanel from './components/BackupRestorePanel.jsx'
import SettingsModal from './components/SettingsModal.jsx'
import SidebarLayout from './components/SidebarLayout.jsx'
import AccountMenu from './components/AccountMenu.jsx'
import { usePeriod, getUiState, setUiState, getSettings, setSettings as persistSettings, getSyncStatus, syncPending, subscribeStore, hydrateServerData } from './lib/store'
import { fetchLogoCurrent, loadPhotoDataUrl } from './lib/photoStorage.js'
import TrainerDashboard from './features/auth/TrainerDashboard.jsx'
import TrainerHistory from './features/attendance/TrainerHistory.jsx'
import BranchManager from './features/admin/BranchManager.jsx'
import { bootstrapAuth, getCurrentUser, logout, subscribeAuth } from './lib/auth.js'
import LoginPage from './features/auth/LoginPage.jsx'
import MustChangePasswordPage from './features/auth/MustChangePasswordPage.jsx'




const TABS = [
  { id: 'overview', label: 'Overview', icon: 'M4 5a1 1 0 011-1h3a1 1 0 011 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h3a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1V5zM4 14a1 1 0 011-1h3a1 1 0 011 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1v-3zM14 14a1 1 0 011-1h3a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-3z' },
  { id: 'sekolah', label: 'Data Sekolah', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
  { id: 'siswa', label: 'Data Siswa', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a3 3 0 11-6 0 3 3 0 016 0z' },
  { id: 'trainer', label: 'Data Trainer', icon: 'M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
  { id: 'absensi', label: 'Data Absensi', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01' },
  { id: 'riwayat', label: 'Riwayat Absensi', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
  { id: 'pembayaran', label: 'Data Pembayaran', icon: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z' },
  { id: 'keuangan', label: 'Data Keuangan', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
   { id: 'aging', label: 'Umur Piutang', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
 ]

const CABANG_TAB = {
  id: 'cabang',
  label: 'Data Cabang',
  icon: 'M3 21h18M5 21V5a2 2 0 012-2h10a2 2 0 012 2v16M9 21V13a1 1 0 011-1h4a1 1 0 011 1v8M9 9h1m-1 4h1m4-4h1m-1 4h1',
}

// Trainer melihat 4 tab saja (M5.1.2): Absensi, Riwayat, Siswa read-only,
// dan Rekap Saya sebagai landing view. Objek tab di-reuse dari TABS.
const REKAP_TAB = {
  id: 'rekap',
  label: 'Rekap Saya',
  icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
}
const TRAINER_TABS = [
  TABS.find(t => t.id === 'absensi'),
  TABS.find(t => t.id === 'riwayat'),
  TABS.find(t => t.id === 'siswa'),
  REKAP_TAB,
]

export default function App() {
  const period = usePeriod()
  const [settings, setSettings] = useState(() => getSettings())
  const [authReady, setAuthReady] = useState(false)
  const [role, setRole] = useState(null)
  const [trainerId, setTrainerId] = useState(null)
  const [cabangId, setCabangId] = useState(null)
  const [currentUser, setCurrentUser] = useState(() => getCurrentUser())

  useEffect(() => {
  return subscribeAuth(user => {
    setCurrentUser(user)
    setRole(user?.role ?? null)
    setTrainerId(user?.trainerId ?? null)
    setCabangId(user?.cabangId ?? null)
  })
}, [])

useEffect(() => {
  let mounted = true

  bootstrapAuth()
    .catch(() => {
      // bootstrapAuth sudah membersihkan state auth
    })
    .finally(() => {
      if (mounted) setAuthReady(true)
    })

  return () => {
    mounted = false
  }
}, [])

  // <title> index.html mengikuti judul dari Settings (M-R6.4).
  useEffect(() => {
    document.title = settings.title || 'Afterschola'
  }, [settings.title])

  const [activeTab, setActiveTabState] = useState(() => getUiState().activeTab || 'overview')
  const [sidebarCollapsed, setSidebarCollapsedState] = useState(() => !!getUiState().sidebarCollapsed)
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)
  const [backupModalOpen, setBackupModalOpen] = useState(false)
  const [settingsModalOpen, setSettingsModalOpen] = useState(false)
  const [syncStatus, setSyncStatus] = useState(() => getSyncStatus())
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    const refreshSync = () => setSyncStatus(getSyncStatus())
    const unsubscribe = subscribeStore(refreshSync)
    // M-AUTH.3: hydrate ONLY when an identity is present. An anonymous
    // bootstrap must not pull protected records, and the listener below
    // is what calls hydrateServerData() the first time a login lands.
    return unsubscribe
  }, [])

  useEffect(() => {
    if (!currentUser) return
    let cancelled = false
    hydrateServerData().then(() => { if (!cancelled) setSyncStatus(getSyncStatus()) })
    return () => { cancelled = true }
  }, [currentUser?.id])

  // LP.B.3 — portable logo convergence (F-LP3; D-LP4): a device whose local
  // settings carry no logo reference (fresh login) — or a rotated-away
  // server id — adopts the current global id and warms the idb cache, so
  // every authenticated device renders the superadmin-picked logo with no
  // per-device import. Local idb-only picks (offline captures) are left
  // alone (R-LP5); offline/denied/no-logo-yet resolves silently.
  useEffect(() => {
    if (!currentUser) return
    let cancelled = false
    fetchLogoCurrent()
      .then(async current => {
        const stored = getSettings().logoEntry
        if (stored && stored.type === 'idb') return
        if (stored && stored.type === 'server' && stored.id === current.id) return
        const url = await loadPhotoDataUrl({ type: 'server', id: current.id })
        if (cancelled || !url) return
        if (getSettings().logoEntry && getSettings().logoEntry.type === 'idb') return
        persistSettings({ logoEntry: { type: 'server', id: current.id } })
        setSettings(getSettings())
      })
      .catch(() => {
        // No portable logo reachable — keep whatever is stored.
      })
    return () => { cancelled = true }
  }, [currentUser?.id])

  async function handleSync() {
    setSyncing(true)
    await syncPending()
    await hydrateServerData()
    setSyncStatus(getSyncStatus())
    setSyncing(false)
  }

  function setActiveTab(tabId) {
    setActiveTabState(tabId)
    setUiState({ activeTab: tabId })
    setMobileDrawerOpen(false)
  }

  function toggleSidebarCollapsed() {
    setSidebarCollapsedState(prev => {
      const next = !prev
      setUiState({ sidebarCollapsed: next })
      return next
    })
  }

  function handleAuthenticated() {
  // State auth diperbarui lewat subscribeAuth()
}

  // M5.1.2: trainer yang mendarat di tab admin-only (mis. direct load dengan
  // activeTab tersimpan 'keuangan') di-redirect ke dashboard trainer (rekap).
  useEffect(() => {
    if (role === 'superadmin') return
    const allowed = new Set((role === 'trainer' ? TRAINER_TABS : TABS).map(t => t.id))
    if (!allowed.has(activeTab)) {
      setActiveTab(role === 'trainer' ? 'rekap' : 'overview')
    }
  }, [role, activeTab])

  function handleRestored() {
    setBackupModalOpen(false)
    // Semua tab baca ulang lewat store.read() saat mount; cara paling
    // aman untuk memastikan setiap tab ter-refresh setelah restore.
    window.location.reload()
  }

  if (!authReady) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center font-sans text-slate-800">
      <p className="text-sm text-slate-500">Memeriksa sesi...</p>
    </div>
  )
}

if (!role) {
  return (
    <LoginPage onAuthenticated={handleAuthenticated} />
  )
}

// M-AUTH.4: server returned mustChangePassword=true. Block the
// dashboard until the user sets a new password. The changePassword()
// call in MustChangePasswordPage flips the flag via subscribeAuth and
// re-renders the dashboard automatically.
if (currentUser?.mustChangePassword) {
  return <MustChangePasswordPage />
}

  const visibleTabs = role === 'trainer' ? TRAINER_TABS : role === 'superadmin' ? [...TABS, CABANG_TAB] : TABS

  return (
    <div className="min-h-screen bg-slate-50 flex font-sans text-slate-800 animate-fadeIn">
      {/* Desktop sidebar */}
      <SidebarLayout
        variant="desktop"
        title={settings.title || 'Afterschola'}
        logoUrl={settings.logoUrl}
        logoEntry={settings.logoEntry}
        tabs={visibleTabs}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onSync={handleSync}
        syncing={syncing}
        syncPending={syncStatus.pending}
        onOpenBackup={() => setBackupModalOpen(true)}
        onOpenSettings={() => setSettingsModalOpen(true)}
        onLogout={async () => { await logout(); setActiveTab('overview') }}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={toggleSidebarCollapsed}
      />

      {/* Mobile drawer */}
      {mobileDrawerOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setMobileDrawerOpen(false)} />
          <SidebarLayout
            variant="drawer"
            title={settings.title || 'Afterschola'}
            logoUrl={settings.logoUrl}
            logoEntry={settings.logoEntry}
            tabs={visibleTabs}
            activeTab={activeTab}
            onSelectTab={setActiveTab}
            onSync={handleSync}
            syncing={syncing}
            syncPending={syncStatus.pending}
            onOpenBackup={() => setBackupModalOpen(true)}
            onOpenSettings={() => setSettingsModalOpen(true)}
            onLogout={async () => { await logout(); setActiveTab('overview') }}
            onClose={() => setMobileDrawerOpen(false)}
          />
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        {/* App header — sticky. Mobile shows hamburger; desktop shows the account menu on the right. */}
        <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
          <div className="px-4 md:px-6 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setMobileDrawerOpen(true)}
                aria-label="Buka menu"
                className="md:hidden text-slate-700 hover:text-slate-900 p-1 -ml-1"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <h1 className="md:hidden text-lg font-bold tracking-tight text-slate-800 truncate">
                {settings.title || 'Afterschola'}
              </h1>
            </div>
            <AccountMenu
              username={currentUser?.username || 'Akun'}
              syncPending={syncStatus.pending}
              syncing={syncing}
              onSync={handleSync}
              onOpenBackup={() => setBackupModalOpen(true)}
              onOpenSettings={() => setSettingsModalOpen(true)}
              onLogout={async () => { await logout(); setActiveTab('overview') }}
            />
          </div>
        </header>

        <main className="flex-1 w-full max-w-7xl mx-auto p-4 md:p-6">
          {role === 'trainer' && activeTab === 'rekap' && <TrainerDashboard trainerId={trainerId} />}
          {activeTab === 'overview' && <OverviewCards />}
          {activeTab === 'sekolah' && <SchoolList />}
          {activeTab === 'siswa' && (role === 'trainer' ? <StudentList readOnly /> : <StudentList />)}
          {activeTab === 'trainer' && <TrainerList />}
          {activeTab === 'absensi' && <AttendanceTab />}
          {activeTab === 'riwayat' && (role === 'trainer' ? <TrainerHistory trainerId={trainerId} /> : <AttendanceTab initialView="riwayat" />)}
          {activeTab === 'pembayaran' && <PaymentTable />}
          {activeTab === 'keuangan' && <FinanceReport />}
          {activeTab === 'aging' && <AgingReport />}
          {activeTab === 'cabang' && <BranchManager />}
        </main>
      </div>

      <Modal open={backupModalOpen} onClose={() => setBackupModalOpen(false)} title="Backup & Restore Data">
        <BackupRestorePanel onRestored={handleRestored} />
      </Modal>

      <SettingsModal open={settingsModalOpen} onClose={() => setSettingsModalOpen(false)} onSaved={() => setSettings(getSettings())} />
    </div>
  )
}
