import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './print.css'
import App from './App'
import { PeriodProvider, readRaw, writeRaw, getKeys, getMigrationState, setMigrationState } from './lib/store'
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
    <PeriodProvider>
      <App />
    </PeriodProvider>
  </StrictMode>,
)