// Tüm tarih/saat işlemleri burada toplanır. Tarayıcının yerel saat dilimine ASLA güvenilmez;
// her şey Europe/Istanbul'a göre hesaplanır. Tarihler "YYYY-MM-DD" metni olarak taşınır.

export const TIMEZONE = 'Europe/Istanbul'

const partsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

interface Parts { year: number; month: number; day: number; hour: number; minute: number; second: number }

function zonedParts(date: Date): Parts {
  const o: Record<string, number> = {}
  for (const p of partsFormatter.formatToParts(date)) {
    if (p.type !== 'literal') o[p.type] = Number(p.value)
  }
  return o as unknown as Parts
}

/** Verilen anda Istanbul'un UTC'den farkı (dakika). */
function offsetMinutes(date: Date): number {
  const p = zonedParts(date)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000)
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Istanbul'daki "bugün" (YYYY-MM-DD). */
export function todayIstanbul(now: Date = new Date()): string {
  const p = zonedParts(now)
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`
}

/** Bir anın (ISO metni veya Date) Istanbul'daki takvim günü. */
export function dateOfInstant(instant: string | Date): string {
  return todayIstanbul(typeof instant === 'string' ? new Date(instant) : instant)
}

/** Bir anın Istanbul'daki saati, "HH:mm". */
export function timeOfInstant(instant: string | Date): string {
  const p = zonedParts(typeof instant === 'string' ? new Date(instant) : instant)
  return `${pad(p.hour)}:${pad(p.minute)}`
}

/** Istanbul duvar saatini (tarih + "HH:mm") gerçek ana (UTC Date) çevirir. */
export function zonedToInstant(date: string, hhmm: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = hhmm.split(':').map(Number)
  const naive = Date.UTC(y, m - 1, d, hh, mm)
  let guess = naive - offsetMinutes(new Date(naive)) * 60000
  guess = naive - offsetMinutes(new Date(guess)) * 60000
  return new Date(guess)
}

/** Istanbul gününün [başlangıç, bitiş) aralığı (UTC ISO). Bitiş, ertesi günün 00:00'ıdır. */
export function dayRange(date: string): { start: string; end: string } {
  return {
    start: zonedToInstant(date, '00:00').toISOString(),
    end: zonedToInstant(addDays(date, 1), '00:00').toISOString(),
  }
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + n))
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`
}

/** ISO hafta günü: 1 = Pazartesi ... 7 = Pazar */
export function isoWeekday(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return wd === 0 ? 7 : wd
}

export function isValidDateString(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const [y, m, d] = s.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d
}

/** "HH:mm" veya "HH:mm:ss" -> dakika */
export function hhmmToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

export function minutesToHhmm(min: number): string {
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`
}

// ---- Türkçe biçimlendirme (sabit saat dilimi: gün hesabı UTC üzerinden yapılır) ----

function utcNoon(date: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 12))
}

/** "31 Ekim 2026 Cumartesi" */
export function formatDateLong(date: string): string {
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric', weekday: 'long',
  }).format(utcNoon(date))
}

/** "31 Ekim Cumartesi" */
export function formatDateShort(date: string): string {
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'UTC', day: 'numeric', month: 'long', weekday: 'long',
  }).format(utcNoon(date))
}

export function formatMonthYear(year: number, month1: number): string {
  return new Intl.DateTimeFormat('tr-TR', { timeZone: 'UTC', month: 'long', year: 'numeric' })
    .format(new Date(Date.UTC(year, month1 - 1, 1, 12)))
}

export const WEEKDAY_SHORT = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']

/** Fiyat: kuruş -> "700 TL" (veritabanı kuruş tutar: 70000 = 700 TL); null -> null */
export function formatPrice(minor: number | null | undefined, currency = 'TRY'): string | null {
  if (minor == null) return null
  const major = minor / 100
  const amount = new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: Number.isInteger(major) ? 0 : 2, maximumFractionDigits: 2,
  }).format(major)
  return currency === 'TRY' ? `${amount} TL` : `${amount} ${currency}`
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} dk`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h} sa ${m} dk` : `${h} sa`
}
