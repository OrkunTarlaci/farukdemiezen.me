import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

// Kısa yönetici adresi: "#admin" (ve "#admin/...") HashRouter'ın beklediği "#/admin" biçimine çevrilir.
// Router'dan önce çalışır; adres çubuğu da düzeltilir, geçmişe yeni kayıt eklenmez.
function normalizeAdminHash() {
  const { hash } = window.location
  if (hash === '#admin' || hash.startsWith('#admin/')) {
    window.history.replaceState(window.history.state, '', `#/${hash.slice(1)}`)
  }
}
normalizeAdminHash()
window.addEventListener('hashchange', normalizeAdminHash)

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
