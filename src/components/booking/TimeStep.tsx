import { useEffect } from 'react'
import { fetchAvailableSlots } from '../../lib/api'
import { formatDateLong, timeOfInstant } from '../../lib/time'
import { useAsync } from '../../lib/useAsync'
import { EmptyState, ErrorPanel, Spinner } from '../ui/feedback'

interface Props {
  date: string
  serviceId: string
  value: string | undefined
  onSelect: (slotIso: string | undefined) => void
  /** Kullanıcı bir saate dokundu: seçilir ve sonraki adıma geçilir. */
  onPick: (slotIso: string) => void
}

const REFRESH_MS = 20_000

export function TimeStep({ date, serviceId, value, onSelect, onPick }: Props) {
  const { data, error, loading, reload, refresh } = useAsync(() => fetchAvailableSlots(date, serviceId), [date, serviceId])

  // Sayfa açık kalsa da alınan saat listeden düşer (başka cihazda alınan randevu dahil).
  useEffect(() => {
    const tick = () => { if (document.visibilityState === 'visible') refresh() }
    const timer = setInterval(tick, REFRESH_MS)
    document.addEventListener('visibilitychange', tick)
    window.addEventListener('focus', tick)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', tick)
      window.removeEventListener('focus', tick)
    }
  }, [refresh])

  // Seçili saat artık listede yoksa (başkası aldı) seçimi temizle
  useEffect(() => {
    if (data && value && !data.includes(value)) onSelect(undefined)
  }, [data, value, onSelect])

  return (
    <div>
      <p className="mb-4 text-sm text-muted">{formatDateLong(date)} için müsait saatler</p>
      {loading && <Spinner label="Müsait saatler yükleniyor…" />}
      {error && <ErrorPanel message={error.message} onRetry={reload} />}
      {!loading && !error && data && data.length === 0 && (
        <EmptyState>Bu gün için müsait saat kalmadı. Lütfen başka bir gün seçin.</EmptyState>
      )}
      {!loading && data && data.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6" aria-label="Müsait saatler">
          {data.map((iso) => {
            const selected = value === iso
            return (
              <li key={iso}>
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onPick(iso)}
                  className={[
                    'flex min-h-[2.75rem] w-full items-center justify-center rounded-lg border text-sm tabular-nums transition-colors',
                    selected
                      ? 'border-accent bg-accent font-semibold text-accent-fg'
                      : 'border-line text-fg hover:border-accent/70 hover:bg-accent/[0.08]',
                  ].join(' ')}
                >
                  {timeOfInstant(iso)}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
