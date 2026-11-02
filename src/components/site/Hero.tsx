import { CalendarDays, Clock, MapPin, Play, ShieldCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import { siteConfig } from '../../config/site'
import { summarizeWorkingHours } from '../../lib/hours'
import { scrollToId } from '../../lib/nav'
import type { BusinessSettings, WorkingHours } from '../../lib/types'
import { Button } from '../ui/Button'

/** Fotoğraf yoksa gösterilen çizim: berber direği, makas ve ustura olan yuvarlak berber amblemi. */
function Artwork() {
  const accent = 'rgb(var(--accent))'
  const stripes = Array.from({ length: 12 }, (_, i) => 128 + i * 22)
  const ticks = Array.from({ length: 72 }, (_, i) => i * 5)
  return (
    <svg viewBox="40 40 400 400" role="img" aria-label={siteConfig.hero.imageAlt} className="h-full w-full" preserveAspectRatio="xMidYMid meet">
      <defs>
        <path id="hero-ring-top" d="M92 240 A148 148 0 0 1 388 240" />
        <path id="hero-ring-bottom" d="M82 240 A158 158 0 0 0 398 240" />
        <clipPath id="hero-pole-glass"><rect x="227" y="150" width="26" height="180" rx="3" /></clipPath>
      </defs>

      {/* Dış halkalar ve çentikler */}
      <g fill="none" stroke={accent}>
        <circle cx="240" cy="240" r="186" strokeOpacity="0.25" />
        <circle cx="240" cy="240" r="176" strokeWidth="2" strokeOpacity="0.9" />
        <circle cx="240" cy="240" r="134" strokeWidth="1.25" strokeOpacity="0.9" />
        <circle cx="240" cy="240" r="128" strokeOpacity="0.3" />
        {ticks.map((a) => (
          <line key={a} x1="240" y1="58" x2="240" y2={a % 15 === 0 ? 66 : 62} strokeOpacity="0.45" transform={`rotate(${a} 240 240)`} />
        ))}
      </g>

      {/* Halka yazısı */}
      <g fill={accent} fontFamily="Inter, system-ui, sans-serif" fontWeight="600" fontSize="15" letterSpacing="5">
        <text textAnchor="middle"><textPath href="#hero-ring-top" startOffset="50%">{siteConfig.name.toLocaleUpperCase('tr-TR')}</textPath></text>
        <text textAnchor="middle" fontSize="12" letterSpacing="6"><textPath href="#hero-ring-bottom" startOffset="50%">{siteConfig.tagline.toLocaleUpperCase('tr-TR')}</textPath></text>
      </g>
      {[84, 396].map((x) => (
        <path key={x} d={`M${x} 232 L${x + 2.4} 238 L${x + 8} 240 L${x + 2.4} 242 L${x} 248 L${x - 2.4} 242 L${x - 8} 240 L${x - 2.4} 238 Z`} fill={accent} />
      ))}

      {/* Makas (sağa yatık) */}
      <g transform="translate(240 240) rotate(-45)" fill="none" stroke={accent} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
        <path d="M2 -2 L104 -10 Q114 -9 106 -4 L4 4 Z" fill={accent} fillOpacity="0.18" />
        <path d="M2 2 L104 10 Q114 9 106 4 L4 -4 Z" fill={accent} fillOpacity="0.18" />
        <path d="M-2 -3 Q-24 -10 -40 -16" />
        <path d="M-2 3 Q-24 10 -40 16" />
        <ellipse cx="-56" cy="-20" rx="16" ry="11" transform="rotate(-12 -56 -20)" />
        <ellipse cx="-56" cy="20" rx="16" ry="11" transform="rotate(12 -56 20)" />
        <circle r="3.5" fill={accent} />
      </g>

      {/* Açık ustura (sola yatık) */}
      <g transform="translate(240 240) rotate(-135)" fill="none" stroke={accent} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
        <path d="M4 -4 L92 -6 Q112 -6 112 8 Q112 14 100 14 L4 6 Z" fill={accent} fillOpacity="0.18" />
        <path d="M10 -1 L96 -2" strokeOpacity="0.5" strokeWidth="1" />
        <rect x="-112" y="-7" width="110" height="14" rx="7" />
        <path d="M-104 0 L-14 0" strokeOpacity="0.5" strokeWidth="1" />
        <circle cx="-4" cy="0" r="3.5" fill={accent} />
      </g>

      {/* Berber direği */}
      <g stroke={accent} strokeWidth="2" strokeLinejoin="round">
        <circle cx="240" cy="128" r="9" fill={accent} />
        <path d="M222 150 L222 142 Q240 134 258 142 L258 150 Z" fill="rgb(var(--surface))" />
        <rect x="219" y="146" width="42" height="8" rx="2" fill="rgb(var(--surface))" />
        <rect x="227" y="150" width="26" height="180" rx="3" fill="rgb(var(--bg))" />
        <g clipPath="url(#hero-pole-glass)" stroke="none">
          {stripes.map((y) => <path key={y} d={`M227 ${y} L253 ${y - 18} L253 ${y - 8} L227 ${y + 10} Z`} fill={accent} />)}
          <rect x="231" y="150" width="4" height="180" fill="rgb(var(--fg))" fillOpacity="0.18" />
        </g>
        <rect x="227" y="150" width="26" height="180" rx="3" fill="none" />
        <rect x="219" y="326" width="42" height="8" rx="2" fill="rgb(var(--surface))" />
        <path d="M222 334 L258 334 L258 340 Q240 348 222 340 Z" fill="rgb(var(--surface))" />
        <circle cx="240" cy="352" r="6" fill={accent} />
      </g>
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
        <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-line bg-surface max-md:mx-auto max-md:max-w-[18rem] md:aspect-[5/5.2]">
          {src ? (
            <>
              <img src={src} alt={hero.imageAlt} width={960} height={1000} className="h-full w-full object-cover" />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-bg/60 via-transparent to-transparent" aria-hidden />
            </>
          ) : (
            <div className="h-full w-full bg-[radial-gradient(circle_at_50%_45%,rgb(var(--accent)/0.12),transparent_65%)] p-3 sm:p-6">
              <Artwork />
            </div>
          )}
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
