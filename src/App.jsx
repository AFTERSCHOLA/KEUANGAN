import { useState, useEffect } from 'react'
import SchoolList from './features/schools/SchoolList.jsx'
import StudentList from './features/students/StudentList.jsx'
import TrainerList from './features/trainers/TrainerList.jsx'
import AttendanceTab from './features/attendance/index.jsx'
import PaymentTable from './features/payments/PaymentTable.jsx'
import FinanceReport from './features/reports/FinanceReport.jsx'
import OverviewCards from './features/overview/OverviewCards.jsx'
import Modal from './components/Modal.jsx'
import BackupRestorePanel from './components/BackupRestorePanel.jsx'
import SettingsModal from './components/SettingsModal.jsx'
import { MONTHS, MONTH_KEYS, academicYearLabel, defaultAcademicYear } from './lib/constants'
import { usePeriod, getUiState, setUiState, getSettings } from './lib/store'
import RolePicker from './features/auth/RolePicker.jsx'

const TABS = [
  { id: 'overview', label: 'Overview', icon: 'M4 5a1 1 0 011-1h3a1 1 0 011 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h3a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1V5zM4 14a1 1 0 011-1h3a1 1 0 011 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1v-3zM14 14a1 1 0 011-1h3a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-3z' },
  { id: 'sekolah', label: 'Data Sekolah', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
  { id: 'siswa', label: 'Data Siswa', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a3 3 0 11-6 0 3 3 0 016 0z' },
  { id: 'trainer', label: 'Data Trainer', icon: 'M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
  { id: 'absensi', label: 'Data Absensi', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01' },
  { id: 'riwayat', label: 'Riwayat Absensi', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
  { id: 'pembayaran', label: 'Data Pembayaran', icon: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z' },
  { id: 'keuangan', label: 'Data Keuangan', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
]

// Rentang tahun ajaran yang ditawarkan di dropdown. Selalu sertakan
// selectedYear kalau ternyata di luar rentang default (mis. test M1
// exit gate yang loncat ke 2027/2028).
function buildYearOptions(selectedYear) {
  const base = defaultAcademicYear()
  const years = new Set()
  for (let y = base - 1; y <= base + 4; y++) years.add(y)
  years.add(selectedYear)
  return Array.from(years).sort((a, b) => a - b)
}

function SidebarLogo({ logoUrl, size = 'w-12 h-12', iconSize = 'w-8 h-8' }) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt="Logo"
        className={`${size} rounded-full object-cover border-2 border-yellow-400 bg-white shadow-md shrink-0`}
        onError={e => { e.currentTarget.style.display = 'none' }}
      />
    )
  }
  return (
    <div className={`${size} rounded-full border-2 border-yellow-400 bg-blue-950 flex items-center justify-center text-white font-extrabold text-base shadow-inner shrink-0`}>
      <svg className={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l9-5-9-5-9 5 9 5z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l9-5-9-5-9 5 9 5zm0 0v6" />
      </svg>
    </div>
  )
}

export default function App() {
  const period = usePeriod()
  const [settings, setSettings] = useState(() => getSettings())
  const [role, setRole] = useState(() => getUiState().role || null)

  // <title> index.html mengikuti judul dari Settings (M-R6.4).
  useEffect(() => {
    document.title = settings.title || 'Afterschola'
  }, [settings.title])

  const [activeTab, setActiveTabState] = useState(() => getUiState().activeTab || 'overview')
  const [sidebarCollapsed, setSidebarCollapsedState] = useState(() => !!getUiState().sidebarCollapsed)
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)
  const [backupModalOpen, setBackupModalOpen] = useState(false)
  const [settingsModalOpen, setSettingsModalOpen] = useState(false)

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

  function handleRoleSelected({ role: selectedRole, trainerId }) {
    setRole(selectedRole)
    setUiState({ role: selectedRole, trainerId })
    setActiveTab('overview')
  }

  const yearOptions = buildYearOptions(period.selectedYear)

  function handleRestored() {
    setBackupModalOpen(false)
    // Semua tab baca ulang lewat store.read() saat mount; cara paling
    // aman untuk memastikan setiap tab ter-refresh setelah restore.
    window.location.reload()
  }

  const NavList = ({ onNavigate }) => (
    <nav className="flex-1 flex flex-col gap-1 px-3 py-4 overflow-y-auto">
      {TABS.map(tab => {
        const isActive = activeTab === tab.id
        if (tab.comingSoon) {
          return (
            <div
              key={tab.id}
              title="Segera hadir"
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold text-blue-300/40 cursor-not-allowed ${sidebarCollapsed ? 'justify-center' : ''}`}
            >
              <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={tab.icon} />
              </svg>
              {!sidebarCollapsed && (
                <span className="flex items-center gap-2">
                  {tab.label}
                  <span className="text-[9px] font-bold uppercase tracking-wide bg-blue-800 text-blue-300 px-1.5 py-0.5 rounded">Segera</span>
                </span>
              )}
            </div>
          )
        }
        return (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); onNavigate?.() }}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all ${sidebarCollapsed ? 'justify-center' : ''} ${
              isActive ? 'bg-yellow-400 text-slate-900 shadow-md' : 'text-white hover:bg-blue-800'
            }`}
            title={sidebarCollapsed ? tab.label : undefined}
          >
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={tab.icon} />
            </svg>
            {!sidebarCollapsed && tab.label}
          </button>
        )
      })}
    </nav>
  )

  const PeriodSelectors = () => (
    <div className={`px-3 ${sidebarCollapsed ? 'hidden' : 'flex flex-col gap-2'}`}>
      <div className="flex items-center gap-2 px-1">
        <label className="text-[10px] font-extrabold text-blue-300 uppercase tracking-wider">Tahun Ajaran</label>
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-[9px] font-bold text-slate-600">
          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
          </svg>
          Tersimpan lokal
        </span>
      </div>
      <select
        value={period.selectedYear}
        onChange={e => period.setSelectedYear(Number(e.target.value))}
        className="w-full rounded-lg bg-blue-800 text-white text-sm font-semibold px-2.5 py-2 border border-blue-700 focus:outline-none focus:ring-2 focus:ring-yellow-400"
      >
        {yearOptions.map(y => (
          <option key={y} value={y} className="text-slate-900">{academicYearLabel(y)}</option>
        ))}
      </select>
      <select
        value={period.selectedMonth}
        onChange={e => period.setSelectedMonth(Number(e.target.value))}
        className="w-full rounded-lg bg-blue-800 text-white text-sm font-semibold px-2.5 py-2 border border-blue-700 focus:outline-none focus:ring-2 focus:ring-yellow-400"
      >
        {MONTHS.map((name, i) => (
          <option key={name} value={Number(MONTH_KEYS[i])} className="text-slate-900">{name}</option>
        ))}
      </select>
    </div>
  )

  if (!role) {
    return (
      <div className="min-h-screen bg-slate-50 flex font-sans text-slate-800 animate-fadeIn">
        <RolePicker onSelect={handleRoleSelected} />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 flex font-sans text-slate-800 animate-fadeIn">
      {/* Desktop sidebar */}
      <aside className={`hidden md:flex flex-col bg-blue-900 border-r-4 border-yellow-400 shrink-0 transition-all ${sidebarCollapsed ? 'w-20' : 'w-64'}`}>
        <div className={`flex items-center gap-2 px-4 py-4 border-b border-blue-800 ${sidebarCollapsed ? 'justify-center' : 'justify-between'}`}>
          {!sidebarCollapsed && (
            <div className="flex items-center gap-2 min-w-0">
              <SidebarLogo logoUrl={settings.logoUrl} size="w-10 h-10" iconSize="w-6 h-6" />
              <h1 className="text-xl font-bold tracking-tight text-yellow-300 truncate">{settings.title || 'Afterschola'}</h1>
            </div>
          )}
          {sidebarCollapsed && <SidebarLogo logoUrl={settings.logoUrl} size="w-10 h-10" iconSize="w-6 h-6" />}
          <button
            onClick={toggleSidebarCollapsed}
            className="text-blue-300 hover:text-yellow-300 p-1"
            title={sidebarCollapsed ? 'Perluas sidebar' : 'Ciutkan sidebar'}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={sidebarCollapsed ? 'M9 5l7 7-7 7' : 'M15 19l-7-7 7-7'} />
            </svg>
          </button>
        </div>

        <div className="py-4 border-b border-blue-800">
          <PeriodSelectors />
        </div>

        <NavList />

        <div className="px-3 py-4 border-t border-blue-800">
          <button
            onClick={() => setBackupModalOpen(true)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold text-blue-200 hover:bg-blue-800 hover:text-white transition-all ${sidebarCollapsed ? 'justify-center' : ''}`}
            title={sidebarCollapsed ? 'Backup & Restore' : undefined}
          >
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
            </svg>
            {!sidebarCollapsed && 'Backup & Restore'}
          </button>
          <button
            onClick={() => setSettingsModalOpen(true)}
            className={`mt-1 w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold text-blue-200 hover:bg-blue-800 hover:text-white transition-all ${sidebarCollapsed ? 'justify-center' : ''}`}
            title={sidebarCollapsed ? 'Pengaturan' : undefined}
          >
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {!sidebarCollapsed && 'Pengaturan'}
          </button>
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileDrawerOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setMobileDrawerOpen(false)} />
          <aside className="relative w-64 bg-blue-900 border-r-4 border-yellow-400 flex flex-col animate-fadeIn">
            <div className="flex items-center justify-between px-4 py-4 border-b border-blue-800">
              <div className="flex items-center gap-2 min-w-0">
                <SidebarLogo logoUrl={settings.logoUrl} size="w-10 h-10" iconSize="w-6 h-6" />
                <h1 className="text-xl font-bold tracking-tight text-yellow-300 truncate">{settings.title || 'Afterschola'}</h1>
              </div>
              <button onClick={() => setMobileDrawerOpen(false)} className="text-blue-300 hover:text-yellow-300 p-1">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="py-4 border-b border-blue-800">
              <PeriodSelectors />
            </div>
            <NavList onNavigate={() => setMobileDrawerOpen(false)} />
            <div className="px-3 py-4 border-t border-blue-800">
              <button
                onClick={() => { setBackupModalOpen(true); setMobileDrawerOpen(false) }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold text-blue-200 hover:bg-blue-800 hover:text-white"
              >
                <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
                </svg>
                Backup & Restore
              </button>
              <button
                onClick={() => { setSettingsModalOpen(true); setMobileDrawerOpen(false) }}
                className="mt-1 w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold text-blue-200 hover:bg-blue-800 hover:text-white"
              >
                <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Pengaturan
              </button>
            </div>
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar with hamburger */}
        <header className="md:hidden bg-blue-900 text-white shadow-md border-b-4 border-yellow-400 sticky top-0 z-40">
          <div className="px-4 py-3 flex items-center justify-between">
            <button onClick={() => setMobileDrawerOpen(true)} className="text-white p-1">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <h1 className="text-lg font-bold tracking-tight text-yellow-300 truncate">{settings.title || 'Afterschola'}</h1>
            <div className="w-8" />
          </div>
        </header>

        <main className="flex-1 w-full max-w-7xl mx-auto p-4 md:p-6">
          {activeTab === 'overview' && <OverviewCards />}
          {activeTab === 'sekolah' && <SchoolList />}
          {activeTab === 'siswa' && <StudentList />}
          {activeTab === 'trainer' && <TrainerList />}
          {activeTab === 'absensi' && <AttendanceTab />}
          {activeTab === 'riwayat' && <AttendanceTab initialView="riwayat" />}
          {activeTab === 'pembayaran' && <PaymentTable />}
          {activeTab === 'keuangan' && <FinanceReport />}
        </main>
      </div>

      <Modal open={backupModalOpen} onClose={() => setBackupModalOpen(false)} title="Backup & Restore Data">
        <BackupRestorePanel onRestored={handleRestored} />
      </Modal>

      <SettingsModal open={settingsModalOpen} onClose={() => setSettingsModalOpen(false)} onSaved={() => setSettings(getSettings())} />
    </div>
  )
}
