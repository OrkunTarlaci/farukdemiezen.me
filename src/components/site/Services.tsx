import { ArrowRight, Clock, Scissors } from 'lucide-react'
import { formatDuration, formatPrice } from '../../lib/time'
import type { BusinessSettings, Service } from '../../lib/types'
import { EmptyState, ErrorPanel, Spinner } from '../ui/feedback'

interface Props {
  services: Service[] | undefined
  settings: BusinessSettings | undefined
  loading: boolean
  error: string | null
  onRetry: () => void
  onBook: (serviceId: string) => void
}

/** Hizmetler veritabanından gelir (tek kaynak); ad, süre ve fiyat burada uydurulmaz. */
export function Services({ services, settings, loading, error, onRetry, onBook }: Props) {
  return (
    <section id="hizmetler" aria-labelledby="hizmetler-baslik" className="section border-b border-line">
      <div className="container-page">
        <div className="mb-8 max-w-xl">
          <p className="eyebrow mb-3">Hizmetler</p>
          <h2 id="hizmetler-baslik" className="section-title">Ne yaptırmak istersiniz?</h2>
          <p className="mt-2 text-sm text-muted">Süre ve fiyatlar günceldir; randevu alırken aynı bilgileri görürsünüz.</p>
        </div>

        {loading && <Spinner label="Hizmetler yükleniyor…" />}
        {error && <ErrorPanel message={error} onRetry={onRetry} />}
        {services && services.length === 0 && <EmptyState>Şu anda listelenen bir hizmet yok.</EmptyState>}

        {services && services.length > 0 && (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((s) => {
              const price = formatPrice(s.price_minor, settings?.currency ?? 'TRY')
              return (
                <li key={s.id} className="card flex flex-col p-5 transition-colors hover:border-fg/20">
                  <div className="flex items-start justify-between gap-4">
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-raised text-accent" aria-hidden>
                      <Scissors className="h-5 w-5" />
                    </span>
                    <p className={price ? 'text-lg font-semibold text-fg' : 'text-sm text-muted'}>
                      <span className="sr-only">Fiyat: </span>{price ?? 'Fiyat için sorunuz'}
                    </p>
                  </div>
                  <h3 className="mt-4 text-lg">{s.name}</h3>
                  {s.description && <p className="mt-1 text-sm text-muted">{s.description}</p>}
                  <div className="mt-auto flex items-center justify-between gap-3 pt-5">
                    <p className="flex items-center gap-1.5 text-sm text-muted">
                      <Clock className="h-4 w-4" aria-hidden />
                      <span className="sr-only">Süre: </span>{formatDuration(s.duration_minutes)}
                    </p>
                    <button
                      type="button"
                      onClick={() => onBook(s.id)}
                      aria-label={`${s.name} için randevu al`}
                      className="inline-flex min-h-[2.75rem] items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-accent hover:bg-raised"
                    >
                      Randevu Al <ArrowRight className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
