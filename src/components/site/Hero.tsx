import { CalendarDays, Clock, MapPin, Play, ShieldCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import { siteConfig } from '../../config/site'
import { summarizeWorkingHours } from '../../lib/hours'
import { scrollToId } from '../../lib/nav'
import type { BusinessSettings, WorkingHours } from '../../lib/types'
import { Button } from '../ui/Button'

/** Fotoğraf yoksa gösterilen sade çizim: ustura ve tarak. Onaylı bir fotoğrafla değiştirilebilir. */
function Artwork() {
  const teeth = Array.from({ length: 30 }, (_, i) => 96 + i * 9.6)
  return (
    <svg viewBox="0 0 480 520" role="img" aria-label={siteConfig.hero.imageAlt} className="h-full w-full" preserveAspectRatio="xMidYMid slice">
      <defs>
        <radialGradient id="hero-glow" cx="62%" cy="38%" r="70%">
          <stop offset="0" stopColor="rgb(var(--accent))" stopOpacity="0.16" />
          <stop offset="1" stopColor="rgb(var(--bg))" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="480" height="520" fill="rgb(var(--surface))" />
      <rect width="480" height="520" fill="url(#hero-glow)" />
      <g fill="none" stroke="rgb(var(--accent))" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" strokeOpacity="0.85">
        <g transform="rotate(-24 240 200)">
          <path d="M96 176 L318 176 Q344 176 344 196 L96 196 Z" />
          <path d="M96 176 L96 196" />
          <rect x="318" y="182" width="118" height="26" rx="4" />
          <circle cx="330" cy="195" r="4" />
        </g>
        <rect x="90" y="340" width="300" height="34" rx="4" />
        {teeth.map((x) => <line key={x} x1={x} y1="374" x2={x} y2={x % 19.2 < 9.6 ? 404 : 396} />)}
      </g>
      <text x="240" y="468" textAnchor="middle" fontFamily="Inter, system-ui, sans-serif" fontSize="12" fontWeight="500" letterSpacing="6" fill="rgb(var(--fg))" fillOpacity="0.45">
        {siteConfig.name.toLocaleUpperCase('tr-TR')}
      </text>
    </svg>
  )
}

function Highlight({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 bg-surface p-4 sm:p-5 sm:[&:last-child:nth-child(odd)]:col-span-2 lg:[&:last-child:nth-child(odd)]:col-span-1">
      <span className="mt-0.5 text-accent" aria-hidden>{icon}</span>
      <div>
        <p className="text-sm font-semibold text-fg">{title}</p>
        <div className="mt-0.5 text-sm text-muted">{children}</div>
      </div>
    </div>
  )
}

// Tailwind sınıfları derleme anında taranır; bu yüzden tam adlar yazılır.
const LG_COLS: Record<number, string> = { 2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4' }

interface Props {
  settings: BusinessSettings | undefined
  workingHours: WorkingHours[] | undefined
}

export function Hero({ settings, workingHours }: Props) {
  const { hero, tagline } = siteConfig
  const img = hero.imageUrl
  const src = img ? (img.startsWith('http') ? img : `${import.meta.env.BASE_URL}${img.replace(/^\//, '')}`) : null
  const hours = workingHours && workingHours.length > 0 ? summarizeWorkingHours(workingHours) : null
  const addressLine = settings?.address?.split('\n')[0] ?? null
  const count = 2 + (hours ? 1 : 0) + (addressLine ? 1 : 0)

  return (
    <section aria-labelledby="hero-title" className="relative border-b border-line">
      <div className="container-page grid items-center gap-8 pb-8 pt-8 md:grid-cols-[1.05fr_1fr] md:gap-12 md:pb-12 md:pt-14">
        <div>
          <p className="eyebrow mb-4">{tagline}</p>
          <h1 id="hero-title" className="text-[2.1rem] font-bold leading-[1.08] sm:text-5xl lg:text-[3.4rem]">{hero.headline}</h1>
          <p className="mt-4 max-w-md text-base text-muted sm:text-lg">{hero.support}</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button size="lg" onClick={() => scrollToId('randevu')} icon={<CalendarDays className="h-5 w-5" aria-hidden />}>
              Randevu Al
            </Button>
            <Button size="lg" variant="secondary" onClick={() => scrollToId('hizmetler')} icon={<Play className="h-4 w-4" aria-hidden />}>
              Hizmetleri İncele
            </Button>
          </div>
        </div>
        <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl border border-line bg-surface md:aspect-[5/5.2]">
          {src ? (
            <img src={src} alt={hero.imageAlt} width={960} height={1000} className="h-full w-full object-cover" />
          ) : (
            <Artwork />
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-bg/60 via-transparent to-transparent" aria-hidden />
        </div>
      </div>

      <div className="container-page pb-10 md:pb-14">
        <div className={`grid gap-px overflow-hidden rounded-xl border border-line bg-line shadow-card sm:grid-cols-2 ${LG_COLS[count]}`}>
          <Highlight icon={<CalendarDays className="h-5 w-5" />} title="Online randevu">
            Hizmeti, günü ve saati kendiniz seçin.
          </Highlight>
          <Highlight icon={<ShieldCheck className="h-5 w-5" />} title="Gerçek müsaitlik">
            Yalnızca gerçekten boş olan saatler listelenir.
          </Highlight>
          {hours && (
            <Highlight icon={<Clock className="h-5 w-5" />} title="Çalışma saatleri">
              <ul>
                {hours.map((h) => <li key={h.days}><span className="text-fg/90">{h.days}</span> {h.hours}</li>)}
              </ul>
            </Highlight>
          )}
          {addressLine && (
            <Highlight icon={<MapPin className="h-5 w-5" />} title="Konum">
              <button type="button" onClick={() => scrollToId('konum')} className="text-left underline-offset-4 hover:text-fg hover:underline">
                {addressLine}
              </button>
            </Highlight>
          )}
        </div>
      </div>
    </section>
  )
}
