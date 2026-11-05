import { CalendarDays, CalendarRange, CalendarX, ChevronRight, Clock, ExternalLink, House, LogOut, Menu, Scissors, Search, Settings } from 'lucide-react'
import { Suspense, useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { Dialog } from '../components/ui/Dialog'
import { Spinner } from '../components/ui/feedback'
import { Monogram } from '../components/ui/Logo'
import { formatPrice } from '../lib/time'
import { usePendingCount } from './usePendingCount'

// `short` olanlar telefonda alt çubukta, diğerleri "Menü" sayfasındadır (`hint` orada görünür).
const NAV = [
  { to: '/admin', label: 'Ana Sayfa', short: 'Ana Sayfa', icon: House, end: true },
  { to: '/admin/gun', label: 'Randevular', short: 'Randevular', icon: CalendarDays },
  { to: '/admin/ara', label: 'Müşteri Ara', short: 'Ara', icon: Search },
  { to: '/admin/takvim', label: 'Haftalık Takvim', hint: 'Haftanın bütün randevuları', icon: CalendarRange },
  { to: '/admin/toplu-iptal', label: 'Toplu İptal', hint: 'Birden çok randevuyu birlikte iptal et', icon: CalendarX },
  { to: '/admin/hizmetler', label: 'Hizmet ve Fiyatlar', hint: 'Hizmet ekle, fiyat değiştir', icon: Scissors },
  { to: '/admin/saatler', label: 'Çalışma Saatleri', hint: 'Açılış, kapanış, tatil günleri', icon: Clock },
  { to: '/admin/ayarlar', label: 'Ayarlar', hint: 'Telefon, adres, randevu kuralları', icon: Settings },
] as const

const MORE = NAV.flatMap((n) => ('hint' in n ? [n] : []))

function PendingBadge({ count }: { count: number }) {
  if (count === 0) return null
  return (
    <span className="inline-flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-warning px-1 text-[0.6875rem] font-semibold tabular-nums text-bg">
      <span className="sr-only">, onay bekleyen: </span>{count}
    </span>
  )
}

const tabClass = (active: boolean) =>
  `relative flex min-h-[3.5rem] flex-1 flex-col items-center justify-center gap-1 text-xs font-medium ${active ? 'text-accent' : 'text-muted'}`

/** Telefon ve tablet: başparmağın ulaştığı alt çubuk. */
function BottomBar({ pending, onMore }: { pending: number; onMore: () => void }) {
  const { pathname } = useLocation()
  const inMore = MORE.some((n) => pathname.startsWith(n.to))
  return (
    <nav aria-label="Yönetim menüsü" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
      <div className="mx-auto flex max-w-xl">
        {NAV.filter((n) => 'short' in n).map(({ to, icon: Icon, ...rest }) => (
          <NavLink key={to} to={to} end={'end' in rest} className={({ isActive }) => tabClass(isActive)}>
            <span className="relative">
              <Icon className="h-5 w-5" aria-hidden />
              {to === '/admin' && <span className="absolute -right-3 -top-1.5"><PendingBadge count={pending} /></span>}
            </span>
            {'short' in rest && rest.short}
          </NavLink>
        ))}
        <button type="button" onClick={onMore} className={tabClass(inMore)}>
          <Menu className="h-5 w-5" aria-hidden />
          Menü
        </button>
      </div>
    </nav>
  )
}

function MoreSheet({ open, onClose, email, onSignOut }: { open: boolean; onClose: () => void; email: string; onSignOut: () => void }) {
  const row = 'flex min-h-[3.25rem] w-full items-center gap-3 px-1 text-base text-fg'
  return (
    <Dialog open={open} onClose={onClose} title="Menü" sheet>
      <ul className="divide-y divide-line">
        {MORE.map(({ to, label, hint, icon: Icon }) => (
          <li key={to}>
            <Link to={to} onClick={onClose} className={row}>
              <Icon className="h-5 w-5 text-muted" aria-hidden />
              <span className="min-w-0 flex-1 py-2">
                <span className="block">{label}</span>
                <span className="block text-xs text-muted">{hint}</span>
              </span>
              <ChevronRight className="h-4 w-4 text-subtle" aria-hidden />
            </Link>
          </li>
        ))}
        <li>
          <a href={import.meta.env.BASE_URL} target="_blank" rel="noopener noreferrer" className={row}>
            <ExternalLink className="h-5 w-5 text-muted" aria-hidden />
            <span className="flex-1">Siteyi aç</span>
          </a>
        </li>
        <li>
          <button type="button" onClick={onSignOut} className={row}>
            <LogOut className="h-5 w-5 text-muted" aria-hidden />
            <span className="flex-1 text-left">Çıkış yap</span>
          </button>
        </li>
      </ul>
      <p className="mt-3 truncate text-xs text-subtle">{email}</p>
    </Dialog>
  )
}

interface Props { email: string; onSignOut: () => void }

export function AdminLayout({ email, onSignOut }: Props) {
  const pending = usePendingCount()
  const [moreOpen, setMoreOpen] = useState(false)
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[15rem_1fr]">
      {/* Masaüstü kenar çubuğu */}
      <aside className="hidden border-r border-line bg-surface/60 lg:flex lg:min-h-screen lg:flex-col">
        <div className="flex h-16 items-center gap-3 border-b border-line px-5">
          <Monogram className="h-11 w-11" />
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
              <span className="flex-1">{label}</span>
              {to === '/admin' && <PendingBadge count={pending} />}
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
        <main className="mx-auto w-full max-w-6xl px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-5 sm:px-6 lg:px-8 lg:py-8">
          <Suspense fallback={<Spinner />}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      <BottomBar pending={pending} onMore={() => setMoreOpen(true)} />
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} email={email} onSignOut={onSignOut} />
    </div>
  )
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 sm:mb-6">
      <h1 className="text-xl sm:text-2xl">{title}</h1>
      {actions && <div className="flex gap-2 sm:row-span-2 sm:self-end">{actions}</div>}
      {description && <p className="col-span-2 col-start-1 mt-1 text-sm text-muted sm:col-span-1">{description}</p>}
    </div>
  )
}

type Tone = 'success' | 'warning' | 'danger' | 'accent'
const TONES: Record<Tone, string> = { success: 'text-success', warning: 'text-warning', danger: 'text-danger', accent: 'text-accent' }

/** Para: "Kazanılan" yalnızca Tamamlandı işaretlenenleri sayar; "Herkes gelirse" günün tüm randevularını. */
export function MoneyStat({ earnedMinor, allMinor, unknownPrice }: { earnedMinor: number; allMinor: number; unknownPrice: number }) {
  return (
    <div className="col-span-2 sm:col-span-1">
      <StatCard
        label="Kazanılan para"
        value={formatPrice(earnedMinor) ?? '—'}
        tone="accent"
        hint={unknownPrice ? `${unknownPrice} randevunun fiyatı kayıtlı değil` : `Herkes gelirse: ${formatPrice(allMinor)}`}
      />
    </div>
  )
}

export function StatCard({ label, value, tone, hint }: { label: string; value: number | string; tone?: Tone; hint?: string }) {
  return (
    <div className="card p-4">
      <p className={`text-2xl font-semibold tabular-nums ${tone ? TONES[tone] : 'text-fg'}`}>{value}</p>
      <p className="mt-1 text-sm text-muted">{label}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  )
}
