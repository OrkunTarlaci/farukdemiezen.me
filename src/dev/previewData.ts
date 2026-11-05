// YALNIZCA geliştirme önizlemesi (npm run dev + .env yok). Üretim derlemesine dahil edilmez:
// kullanılan yer `import.meta.env.DEV` ile korunur. Burada hiçbir randevu verisi yoktur ve
// randevu kaydı yapılmaz.
import type { BusinessSettings, Service, WorkingHours } from '../lib/types'

export const previewSettings: BusinessSettings = {
  business_name: 'Faruk Demirezen',
  timezone: 'Europe/Istanbul',
  currency: 'TRY',
  booking_interval_minutes: 30,
  minimum_booking_notice_minutes: 60,
  maximum_booking_horizon_days: 30,
  address: null,
  contact_phone: null,
  map_url: null,
}

export const previewServices: Service[] = [
  { id: 'preview-1', name: 'Saç Kesimi', description: 'Önizleme verisi.', duration_minutes: 30, price_minor: null, sort_order: 1, is_active: true },
  { id: 'preview-2', name: 'Sakal Kesimi', description: 'Önizleme verisi.', duration_minutes: 20, price_minor: null, sort_order: 2, is_active: true },
  { id: 'preview-3', name: 'Saç + Sakal', description: 'Önizleme verisi.', duration_minutes: 50, price_minor: null, sort_order: 3, is_active: true },
]

export const previewWorkingHours: WorkingHours[] = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
  weekday, is_closed: weekday === 7, opens_at: '09:00:00', closes_at: '20:00:00', break_starts_at: null, break_ends_at: null,
}))
