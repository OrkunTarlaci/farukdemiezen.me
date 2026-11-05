import { lazy, Suspense } from 'react'
import { Link, Navigate, Route, Routes } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { ErrorPanel, Spinner } from '../components/ui/feedback'
import { Logo } from '../components/ui/Logo'
import { AdminLayout } from './AdminLayout'
import { OverviewPage } from './pages/OverviewPage'
import { LoginForm } from './LoginForm'
import { MfaCard } from './MfaCard'
import { MfaForm } from './MfaForm'
import { SetPasswordForm } from './SetPasswordForm'
import { useAuth } from './useAuth'

// Formlu sayfalar (zod) ayrı parçalarda yüklenir.
const DayPage = lazy(() => import('./pages/DayPage').then((m) => ({ default: m.DayPage })))
const WeekPage = lazy(() => import('./pages/WeekPage').then((m) => ({ default: m.WeekPage })))
const SearchPage = lazy(() => import('./pages/SearchPage').then((m) => ({ default: m.SearchPage })))
const ServicesPage = lazy(() => import('./pages/ServicesPage').then((m) => ({ default: m.ServicesPage })))
const HoursPage = lazy(() => import('./pages/HoursPage').then((m) => ({ default: m.HoursPage })))
const BulkCancelPage = lazy(() => import('./pages/BulkCancelPage').then((m) => ({ default: m.BulkCancelPage })))
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })))

/** /admin — kimlik doğrulama kapısı. Veri koruması arayüzde değil, RLS'tedir; bu yalnızca deneyim katmanıdır. */
export function AdminPage() {
  const { state, signIn, signOut, verifyMfa, setPassword, recheck } = useAuth()

  if (state.status === 'admin') {
    return (
      <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><Spinner /></div>}>
        <Routes>
          <Route element={<AdminLayout email={state.email} onSignOut={() => { void signOut() }} />}>
            <Route index element={<OverviewPage />} />
            <Route path="gun" element={<DayPage />} />
            <Route path="takvim" element={<WeekPage />} />
            <Route path="ara" element={<SearchPage />} />
            <Route path="toplu-iptal" element={<BulkCancelPage />} />
            <Route path="hizmetler" element={<ServicesPage />} />
            <Route path="saatler" element={<HoursPage />} />
            <Route path="ayarlar" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Route>
        </Routes>
      </Suspense>
    )
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="mb-8 flex flex-col items-center gap-3">
        <Logo className="h-12 sm:h-14" />
        <p className="text-xs font-medium uppercase tracking-[0.28em] text-muted">Yönetim Paneli</p>
      </div>

      {state.status === 'loading' && <Spinner label="Oturum kontrol ediliyor…" />}

      {state.status === 'unconfigured' && (
        <div className="max-w-md">
          <ErrorPanel message="Arka uç yapılandırılmamış. .env dosyasında VITE_SUPABASE_URL ve VITE_SUPABASE_ANON_KEY değerlerini doldurun (README)." />
        </div>
      )}

      {state.status === 'signedOut' && <LoginForm onSignIn={signIn} />}

      {state.status === 'setPassword' && <SetPasswordForm onSave={setPassword} />}

      {state.status === 'mfaSetup' && (
        <div className="w-full max-w-md">
          <p className="mb-4 text-center text-sm text-muted">Panele girmeden önce iki adımlı girişi açmanız gerekiyor.</p>
          <MfaCard onEnabled={() => { void recheck() }} />
          <Button variant="ghost" className="w-full" onClick={() => { void signOut() }}>Çıkış yap</Button>
        </div>
      )}

      {state.status === 'mfa' && <MfaForm onVerify={verifyMfa} onCancel={() => { void signOut() }} />}

      {state.status === 'notAdmin' && (
        <div className="max-w-md space-y-4">
          <ErrorPanel message="Bu hesabın yönetici yetkisi yok." />
          <Button variant="secondary" onClick={() => { void signOut() }}>Çıkış yap</Button>
        </div>
      )}

      {state.status === 'error' && (
        <div className="max-w-md space-y-4">
          <ErrorPanel message={state.message} />
          <Button variant="secondary" onClick={() => { void signOut() }}>Çıkış yap</Button>
        </div>
      )}

      <Link to="/" className="mt-8 inline-flex min-h-[2.75rem] items-center text-sm text-muted underline underline-offset-4 hover:text-fg">
        Siteye dön
      </Link>
    </main>
  )
}
