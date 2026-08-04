import { useState } from 'react'
import SchoolList from './features/schools/SchoolList.jsx'
import StudentList from './features/students/StudentList.jsx'
import TrainerList from './features/trainers/TrainerList.jsx'
import AttendanceForm from './features/attendance/AttendanceForm.jsx'
import PaymentTable from './features/payments/PaymentTable.jsx'
import FinanceReport from './features/reports/FinanceReport.jsx'
import OverviewCards from './features/overview/OverviewCards.jsx'

const TABS = [
  { id: 'overview', label: 'Overview', icon: 'M4 5a1 1 0 011-1h3a1 1 0 011 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h3a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1V5zM4 14a1 1 0 011-1h3a1 1 0 011 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1v-3zM14 14a1 1 0 011-1h3a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-3z' },
  { id: 'sekolah', label: 'Data Sekolah', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
  { id: 'siswa', label: 'Data Siswa', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a3 3 0 11-6 0 3 3 0 016 0z' },
  { id: 'trainer', label: 'Data Trainer', icon: 'M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
  { id: 'absensi', label: 'Data Absensi', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01' },
  { id: 'pembayaran', label: 'Data Pembayaran', icon: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z' },
  { id: 'keuangan', label: 'Data Keuangan', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
]

function App() {
  const [activeTab, setActiveTab] = useState('sekolah')

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-800 animate-fadeIn">
      <header className="bg-blue-900 text-white shadow-md border-b-4 border-yellow-400 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight text-yellow-300">Afterschola</h1>
          </div>
          <nav className="flex flex-wrap items-center gap-1">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold transition-all ${
                  activeTab === tab.id
                    ? 'bg-yellow-400 text-slate-900 shadow-md transform scale-105'
                    : 'text-white hover:bg-blue-800'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={tab.icon} />
                </svg>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </header>
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6">
        {activeTab === 'overview' && <OverviewCards />}
        {activeTab === 'sekolah' && <SchoolList />}
        {activeTab === 'siswa' && <StudentList />}
        {activeTab === 'trainer' && <TrainerList />}
        {activeTab === 'absensi' && <AttendanceForm />}
        {activeTab === 'pembayaran' && <PaymentTable />}
        {activeTab === 'keuangan' && <FinanceReport />}
      </main>
    </div>
  )
}

export default App
