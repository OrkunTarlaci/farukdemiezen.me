import { CalendarDays, Clock, MapPin, Play, ShieldCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import { siteConfig } from '../../config/site'
import { summarizeWorkingHours } from '../../lib/hours'
import { scrollToId } from '../../lib/nav'
import type { BusinessSettings, WorkingHours } from '../../lib/types'
import { Button } from '../ui/Button'
import { Monogram } from '../ui/Logo'

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
            <div className="h-full w-full p-12 sm:p-20">
              <Monogram className="h-full w-full" decorative={false} />
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
