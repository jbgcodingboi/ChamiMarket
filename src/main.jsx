import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { startClock } from './store/clockStore.js'
import { runMigrations } from './utils/storage.js'

runMigrations()
startClock()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
