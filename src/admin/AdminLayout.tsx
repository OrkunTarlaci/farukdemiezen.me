import { CalendarDays, CalendarRange, Clock, LayoutDashboard, LogOut, Scissors, Search, Settings } from 'lucide-react'
import { Suspense, type ReactNode } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { Spinner } from '../components/ui/feedback'
import { Monogram } from '../components/ui/Logo'

const NAV = [
  { to: '/admin', label: 'Genel Bakış', icon: LayoutDashboard, end: true },
  { to: '/admin/gun', label: 'Günlük Randevular', icon: CalendarDays },
  { to: '/admin/takvim', label: 'Takvim', icon: CalendarRange },
  { to: '/admin/ara', label: 'Ara ve Filtrele', icon: Search },
  { to: '/admin/hizmetler', label: 'Hizmetler', icon: Scissors },
  { to: '/admin/saatler', label: 'Çalışma Saatleri', icon: Clock },
  { to: '/admin/ayarlar', label: 'Ayarlar', icon: Settings },
] as const

interface Props { email: string; onSignOut: () => void }

export function AdminLayout({ email, onSignOut }: Props) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[15rem_1fr]">
      {/* Masaüstü kenar çubuğu */}
      <aside className="hidden border-r border-line bg-surface/60 lg:flex lg:min-h-screen lg:flex-col">
        <div className="flex h-16 items-center gap-3 border-b border-line px-5">
          <Monogram className="h-8 w-8" />
          <span className="text-sm font-semibold">Yönetim Paneli</span>
        </div>
        <nav aria-label="Yönetim menüsü" className="flex-1 space-y-1 p-3">
          {NAV.map(({ to, label, icon: Icon, ...rest }) => (
            <NavLink
              key={to}
              to={to}
              end={'end' in rest}
              className={({ isActive }) => [
                'flex min-h-[2.75rem] items-center gap-3 rounded-lg px-3 text-sm transition-colors',
                isActive ? 'bg-raised font-medium text-fg shadow-[inset_2px_0_0_0_rgb(var(--accent))]' : 'text-muted hover:bg-raised/60 hover:text-fg',
              ].join(' ')}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-line p-3">
          <p className="truncate px-3 pb-2 text-xs text-subtle" title={email}>{email}</p>
          <button
            type="button"
            onClick={onSignOut}
            className="flex min-h-[2.75rem] w-full items-center gap-3 rounded-lg px-3 text-sm text-muted hover:bg-raised hover:text-fg"
          >
            <LogOut className="h-4 w-4" aria-hidden /> Çıkış Yap
          </button>
        </div>
      </aside>

      <div className="min-w-0">
        {/* Mobil / tablet üst çubuk ve kaydırılabilir menü */}
        <header className="sticky top-0 z-20 border-b border-line bg-bg/90 backdrop-blur-md lg:hidden">
          <div className="flex h-14 items-center justify-between gap-3 px-4">
            <span className="flex items-center gap-2.5">
              <Monogram className="h-7 w-7" />
              <span className="text-sm font-semibold">Yönetim Paneli</span>
            </span>
            <button
              type="button"
              onClick={onSignOut}
              className="inline-flex h-11 items-center gap-2 rounded-lg px-3 text-sm text-muted hover:bg-raised hover:text-fg"
            >
              <LogOut className="h-4 w-4" aria-hidden /> Çıkış
            </button>
          </div>
          <nav aria-label="Yönetim menüsü" className="-mb-px flex gap-1 overflow-x-auto px-2 [scrollbar-width:none]">
            {NAV.map(({ to, label, icon: Icon, ...rest }) => (
              <NavLink
                key={to}
                to={to}
                end={'end' in rest}
                className={({ isActive }) => [
                  'flex min-h-[2.75rem] shrink-0 items-center gap-2 border-b-2 px-3 text-sm',
                  isActive ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg',
                ].join(' ')}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {label}
              </NavLink>
            ))}
          </nav>
        </header>

        <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Suspense fallback={<Spinner />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  )
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-xl sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

type Tone = 'success' | 'warning' | 'danger' | 'accent'
const TONES: Record<Tone, string> = { success: 'text-success', warning: 'text-warning', danger: 'text-danger', accent: 'text-accent' }

export function StatCard({ label, value, tone, hint }: { label: string; value: number | string; tone?: Tone; hint?: string }) {
  return (
    <div className="card p-4">
      <p className={`text-2xl font-semibold tabular-nums ${tone ? TONES[tone] : 'text-fg'}`}>{value}</p>
      <p className="mt-1 text-xs text-muted">{label}</p>
      {hint && <p className="mt-1 text-[0.7rem] text-subtle">{hint}</p>}
    </div>
  )
}
