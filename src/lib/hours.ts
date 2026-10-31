import { WEEKDAY_SHORT } from './time'
import type { WorkingHours } from './types'

const hhmm = (t: string) => t.slice(0, 5)

/**
 * Çalışma saatlerini okunur satırlara özetler; aynı saatlere sahip ardışık günler birleştirilir.
 * Örn. [{ days: 'Pzt–Cmt', hours: '10:00–19:00' }, { days: 'Paz', hours: 'Kapalı' }]
 * Mola varsa ayrıca belirtilir. Veri veritabanından gelir; burada hiçbir saat varsayılmaz.
 */
export function summarizeWorkingHours(rows: WorkingHours[]): { days: string; hours: string }[] {
  const sorted = [...rows].sort((a, b) => a.weekday - b.weekday)
  const label = (w: WorkingHours) =>
    w.is_closed
      ? 'Kapalı'
      : `${hhmm(w.opens_at)}–${hhmm(w.closes_at)}${w.break_starts_at && w.break_ends_at ? ` (mola ${hhmm(w.break_starts_at)}–${hhmm(w.break_ends_at)})` : ''}`

  const groups: { from: number; to: number; hours: string }[] = []
  for (const w of sorted) {
    const hours = label(w)
    const last = groups[groups.length - 1]
    if (last && last.hours === hours && last.to === w.weekday - 1) last.to = w.weekday
    else groups.push({ from: w.weekday, to: w.weekday, hours })
  }
  return groups.map((g) => ({
    days: g.from === g.to ? WEEKDAY_SHORT[g.from - 1] : `${WEEKDAY_SHORT[g.from - 1]}–${WEEKDAY_SHORT[g.to - 1]}`,
    hours: g.hours,
  }))
}
