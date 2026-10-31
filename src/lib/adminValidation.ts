import { z } from 'zod'
import { hhmmToMinutes, isValidDateString, zonedToInstant } from './time'

// Yönetici formlarının istemci doğrulaması. Veritabanındaki CHECK kısıtlarının aynısıdır
// (0001, 0004); yetkili kaynak veritabanıdır, burası yalnızca anında geri bildirim içindir.

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

/** "350", "350,50", "1.250,00" → kuruş; boş → null. Geçersizse NaN. */
export function parsePriceToMinor(input: string): number | null {
  const v = input.trim().replace(/\s|₺|TL/gi, '')
  if (v === '') return null
  const normalized = v.includes(',') ? v.replace(/\./g, '').replace(',', '.') : v
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(normalized)) return Number.NaN
  return Math.round(Number(normalized) * 100)
}

export function minorToPriceInput(minor: number | null): string {
  if (minor == null) return ''
  return minor % 100 === 0 ? String(minor / 100) : (minor / 100).toFixed(2).replace('.', ',')
}

export const serviceSchema = z.object({
  name: z.string().trim().min(1, 'Hizmet adı gerekli.').max(80, 'En fazla 80 karakter.'),
  description: z.string().trim().max(300, 'En fazla 300 karakter.'),
  duration_minutes: z.coerce.number({ message: 'Süre girin.' }).int('Tam sayı girin.').min(5, 'En az 5 dakika.').max(480, 'En fazla 480 dakika.'),
  price: z.string().refine((v) => !Number.isNaN(parsePriceToMinor(v)), 'Geçerli bir fiyat girin (örn. 350 veya 350,50) ya da boş bırakın.'),
  sort_order: z.coerce.number({ message: 'Sıra girin.' }).int('Tam sayı girin.').min(0, 'En az 0.').max(1000, 'En fazla 1000.'),
  is_active: z.boolean(),
})
export type ServiceFormValues = z.input<typeof serviceSchema>

export const workingHoursSchema = z
  .object({
    is_closed: z.boolean(),
    opens_at: z.string().regex(TIME_RE, 'SS:DD biçiminde girin.'),
    closes_at: z.string().regex(TIME_RE, 'SS:DD biçiminde girin.'),
    has_break: z.boolean(),
    break_starts_at: z.string(),
    break_ends_at: z.string(),
  })
  .superRefine((v, ctx) => {
    if (v.is_closed) return
    if (hhmmToMinutes(v.opens_at) >= hhmmToMinutes(v.closes_at)) {
      ctx.addIssue({ code: 'custom', path: ['closes_at'], message: 'Kapanış açılıştan sonra olmalı.' })
    }
    if (!v.has_break) return
    if (!TIME_RE.test(v.break_starts_at)) ctx.addIssue({ code: 'custom', path: ['break_starts_at'], message: 'SS:DD biçiminde girin.' })
    if (!TIME_RE.test(v.break_ends_at)) ctx.addIssue({ code: 'custom', path: ['break_ends_at'], message: 'SS:DD biçiminde girin.' })
    if (!TIME_RE.test(v.break_starts_at) || !TIME_RE.test(v.break_ends_at)) return
    const bs = hhmmToMinutes(v.break_starts_at)
    const be = hhmmToMinutes(v.break_ends_at)
    if (bs >= be) ctx.addIssue({ code: 'custom', path: ['break_ends_at'], message: 'Mola bitişi başlangıcından sonra olmalı.' })
    if (bs < hhmmToMinutes(v.opens_at) || be > hhmmToMinutes(v.closes_at)) {
      ctx.addIssue({ code: 'custom', path: ['break_starts_at'], message: 'Mola çalışma saatleri içinde olmalı.' })
    }
  })
export type WorkingHoursFormValues = z.infer<typeof workingHoursSchema>

export const blockedPeriodSchema = z
  .object({
    start_date: z.string().refine(isValidDateString, 'Geçerli bir tarih seçin.'),
    start_time: z.string(),
    end_date: z.string().refine(isValidDateString, 'Geçerli bir tarih seçin.'),
    end_time: z.string(),
    all_day: z.boolean(),
    reason: z.string().trim().max(200, 'En fazla 200 karakter.'),
  })
  .superRefine((v, ctx) => {
    if (!v.all_day) {
      if (!TIME_RE.test(v.start_time)) ctx.addIssue({ code: 'custom', path: ['start_time'], message: 'Saat seçin.' })
      if (!TIME_RE.test(v.end_time)) ctx.addIssue({ code: 'custom', path: ['end_time'], message: 'Saat seçin.' })
    }
    const r = blockedRange(v)
    if (r && r.ends_at <= r.starts_at) ctx.addIssue({ code: 'custom', path: ['end_date'], message: 'Bitiş başlangıçtan sonra olmalı.' })
  })
export type BlockedPeriodFormValues = z.infer<typeof blockedPeriodSchema>

/** Form değerlerini Istanbul saatine göre [başlangıç, bitiş) ISO aralığına çevirir. Tüm gün: bitiş günü dahil. */
export function blockedRange(v: Pick<BlockedPeriodFormValues, 'start_date' | 'start_time' | 'end_date' | 'end_time' | 'all_day'>) {
  if (!isValidDateString(v.start_date) || !isValidDateString(v.end_date)) return null
  if (v.all_day) {
    const [y, m, d] = v.end_date.split('-').map(Number)
    const next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
    return { starts_at: zonedToInstant(v.start_date, '00:00').toISOString(), ends_at: zonedToInstant(next, '00:00').toISOString() }
  }
  if (!TIME_RE.test(v.start_time) || !TIME_RE.test(v.end_time)) return null
  return {
    starts_at: zonedToInstant(v.start_date, v.start_time).toISOString(),
    ends_at: zonedToInstant(v.end_date, v.end_time).toISOString(),
  }
}

const optionalText = (max: number) =>
  z.string().trim().max(max, `En fazla ${max} karakter.`)

export const settingsSchema = z.object({
  booking_interval_minutes: z.coerce.number({ message: 'Sayı girin.' }).int('Tam sayı girin.').min(5, 'En az 5.').max(120, 'En fazla 120.'),
  minimum_booking_notice_minutes: z.coerce.number({ message: 'Sayı girin.' }).int('Tam sayı girin.').min(0, 'En az 0.').max(10080, 'En fazla 10080 (7 gün).'),
  maximum_booking_horizon_days: z.coerce.number({ message: 'Sayı girin.' }).int('Tam sayı girin.').min(1, 'En az 1.').max(365, 'En fazla 365.'),
  max_active_bookings_per_phone: z.coerce.number({ message: 'Sayı girin.' }).int('Tam sayı girin.').min(1, 'En az 1.').max(20, 'En fazla 20.'),
  address: optionalText(300),
  contact_phone: optionalText(40),
  map_url: optionalText(500).refine((v) => v === '' || /^https:\/\/\S+$/.test(v), 'https:// ile başlayan bir bağlantı girin veya boş bırakın.'),
})
export type SettingsFormValues = z.input<typeof settingsSchema>
