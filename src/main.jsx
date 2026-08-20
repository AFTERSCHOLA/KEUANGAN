import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './print.css'
import App from './App'
import { BranchProvider, PeriodProvider, readRaw, writeRaw, getKeys, getMigrationState, setMigrationState } from './lib/store'
import { migrateIds } from './lib/constants'

migrateIds({
  read: readRaw,
  write: writeRaw,
  getKeys,
  getMigrationState,
  setMigrationState,
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BranchProvider>
      <PeriodProvider>
        <App />
      </PeriodProvider>
    </BranchProvider>
  </StrictMode>,
)