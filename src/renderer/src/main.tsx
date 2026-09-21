import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/globals.css'

if (!window.peakflow && import.meta.env.DEV) {
  const previewAccess = {
    allowed: true,
    message: 'Preview trial active',
    daysRemaining: 14,
    isLicensed: false,
    isToolLicensed: false,
    isSuiteLicense: false
  }

  window.peakflow = {
    invoke: async (channel: string) => {
      if (channel === 'security:check-access' || channel === 'security:check-tool-access') {
        return previewAccess
      }
      if (channel === 'tool:get-install-state') {
        return { installed: true }
      }
      if (channel === 'security:activate-license') {
        return { success: false, message: 'License activation is available in the desktop app.' }
      }
      return null
    },
    on: () => () => {},
    send: () => {}
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
