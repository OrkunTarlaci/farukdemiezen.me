import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { formatDateLong, formatMonthYear, isoWeekday, WEEKDAY_SHORT } from '../../lib/time'

interface Props {
  today: string
  maxDate: string
  /** Rezerve edilebilir günler (en az bir uygun saati olanlar; sunucu hesaplar) */
  available: Set<string>
  value: string | undefined
  loading: boolean
  onSelect: (date: string) => void
}

const pad = (n: number) => String(n).padStart(2, '0')
const ym = (date: string) => ({ y: Number(date.slice(0, 4)), m: Number(date.slice(5, 7)) })

export function Calendar({ today, maxDate, available, value, loading, onSelect }: Props) {
  const [view, setView] = useState(() => ym(value ?? today))
  const jumped = useRef(false)

  // İlk uygun günün ayını göster (bu ay hiç uygun gün yoksa)
  useEffect(() => {
    if (jumped.current || value || available.size === 0) return
    jumped.current = true
    const prefix = `${view.y}-${pad(view.m)}`
    if (![...available].some((d) => d.startsWith(prefix))) {
      setView(ym([...available].sort()[0]))
    }
  }, [available, value, view])

  const first = `${view.y}-${pad(view.m)}-01`
  const daysInMonth = new Date(Date.UTC(view.y, view.m, 0)).getUTCDate()
  const blanks = isoWeekday(first) - 1
  const t = ym(today)
  const mx = ym(maxDate)
  const canPrev = view.y > t.y || (view.y === t.y && view.m > t.m)
  const canNext = view.y < mx.y || (view.y === mx.y && view.m < mx.m)
  const step = (delta: number) => {
    const d = new Date(Date.UTC(view.y, view.m - 1 + delta, 1))
    setView({ y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 })
  }
  const navBtn = 'inline-flex h-11 w-11 items-center justify-center rounded-lg border border-line text-fg hover:bg-raised disabled:opacity-30'

  return (
    <div className="max-w-md" aria-busy={loading}>
      <div className="mb-3 flex items-center justify-between">
        <button type="button" onClick={() => step(-1)} disabled={!canPrev} aria-label="Önceki ay" className={navBtn}>
          <ChevronLeft className="h-5 w-5" aria-hidden />
        </button>
        <p className="text-base font-medium capitalize" aria-live="polite">{formatMonthYear(view.y, view.m)}</p>
        <button type="button" onClick={() => step(1)} disabled={!canNext} aria-label="Sonraki ay" className={navBtn}>
          <ChevronRight className="h-5 w-5" aria-hidden />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs text-subtle" aria-hidden>
        {WEEKDAY_SHORT.map((d) => <div key={d} className="py-1">{d}</div>)}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: blanks }, (_, i) => <div key={`b${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1
          const date = `${view.y}-${pad(view.m)}-${pad(day)}`
          const isAvail = available.has(date)
          const selected = value === date
          const inRange = date >= today && date <= maxDate
          const label = formatDateLong(date) + (isAvail ? '' : inRange ? ' — müsait değil' : ' — seçilemez')
          return (
            <button
              key={date}
              type="button"
              disabled={!isAvail}
              aria-pressed={selected}
              aria-current={date === today ? 'date' : undefined}
              aria-label={label}
              onClick={() => onSelect(date)}
              className={[
                'relative flex h-11 items-center justify-center rounded-lg border text-sm transition-colors',
                selected
                  ? 'border-accent bg-accent font-semibold text-accent-fg'
                  : isAvail
                    ? 'border-line text-fg hover:border-accent/70 hover:bg-accent/[0.08]'
                    : 'border-transparent text-subtle/50 line-through decoration-subtle/30',
              ].join(' ')}
            >
              {day}
              {date === today && !selected && <span className="absolute bottom-1 h-0.5 w-3 rounded-full bg-accent" aria-hidden />}
            </button>
          )
        })}
      </div>

      {loading && <p role="status" className="mt-3 text-sm text-muted">Müsait günler yükleniyor…</p>}
      {!loading && available.size === 0 && (
        <p className="mt-3 text-sm text-muted">Şu anda rezervasyona açık gün bulunmuyor. Lütfen daha sonra tekrar deneyin.</p>
      )}
    </div>
  )
}
