import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { PeriodProvider } from './lib/store'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <PeriodProvider>
      <App />
    </PeriodProvider>
  </StrictMode>,
)