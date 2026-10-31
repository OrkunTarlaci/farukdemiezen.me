import { lazy, Suspense } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Spinner } from './components/ui/feedback'
import { HomePage } from './pages/HomePage'

// Yönetici paneli yalnızca /admin açıldığında yüklenir; müşteri sitesi daha küçük kalır.
const AdminPage = lazy(() => import('./admin/AdminPage').then((m) => ({ default: m.AdminPage })))

// HashRouter: GitHub Pages sunucu tarafı yönlendirme yapmadığından, /#/admin gibi adresler
// doğrudan açıldığında ve sayfa yenilendiğinde de sorunsuz çalışır.
export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route
          path="/admin/*"
          element={
            <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><Spinner /></div>}>
              <AdminPage />
            </Suspense>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  )
}
