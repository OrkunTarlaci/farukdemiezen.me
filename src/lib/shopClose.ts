// "Dükkanı Kapat": kapalı dönem ve etkilenen randevuların seçimi. Ağ çağrısı yapmaz.
import { isCancellable } from './bulkCancel'
import { addDays, zonedToInstant } from './time'
import type { AppointmentRow, BlockedPeriod } from './types'

export const DEFAULT_CLOSE_REASON = 'Dükkan kapalı'
/** blocked_periods.reason: panelde kapalı dönem listesinde görünür. */
export const SHOP_CLOSED_LABEL = 'Dükkan kapatıldı'
export const MAX_CLOSE_DAYS = 30

export interface ClosureRange {
  starts_at: string
  ends_at: string
}

/** Şu andan seçilen günün bitişine (İstanbul) kadar. Başlamış randevu kapsam dışında kalır. */
export function closureRange(now: Date, untilDate: string): ClosureRange {
  return { starts_at: now.toISOString(), ends_at: zonedToInstant(addDays(untilDate, 1), '00:00').toISOString() }
}

/** Dönem içinde başlayan, henüz sonuçlanmamış randevular. */
export function selectInClosure(appointments: AppointmentRow[], range: ClosureRange): AppointmentRow[] {
  const start = new Date(range.starts_at).getTime()
  const end = new Date(range.ends_at).getTime()
  return appointments
    .filter((a) => {
      const t = new Date(a.starts_at).getTime()
      return isCancellable(a) && t >= start && t < end
    })
    .sort((x, y) => x.starts_at.localeCompare(y.starts_at))
}

/** Şu anda süren kapalı dönemler. */
export function activeClosures(periods: BlockedPeriod[], now: Date): BlockedPeriod[] {
  const t = now.getTime()
  return periods.filter((p) => new Date(p.starts_at).getTime() <= t && t < new Date(p.ends_at).getTime())
}

/** Süren dönemlerin tamamını kapsayan aralık; dönem yoksa null. */
export function closureSpan(periods: BlockedPeriod[]): ClosureRange | null {
  if (periods.length === 0) return null
  return {
    starts_at: periods.map((p) => p.starts_at).sort()[0],
    ends_at: periods.map((p) => p.ends_at).sort().at(-1)!,
  }
}
