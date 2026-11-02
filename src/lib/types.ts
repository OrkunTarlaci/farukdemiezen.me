export type AppointmentStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show'

export interface Service {
  id: string
  name: string
  description: string | null
  duration_minutes: number
  /** Kuruş cinsinden; null = fiyat belirlenmedi */
  price_minor: number | null
  sort_order: number
  is_active: boolean
}

export interface BusinessSettings {
  business_name: string
  timezone: string
  currency: string
  booking_interval_minutes: number
  minimum_booking_notice_minutes: number
  maximum_booking_horizon_days: number
  address: string | null
  contact_phone: string | null
  map_url: string | null
}

/** Yöneticinin düzenleyebildiği ayarlar (business_settings). */
export interface AdminSettings extends BusinessSettings {
  max_active_bookings_per_phone: number
}

export interface WorkingHours {
  weekday: number // 1 = Pazartesi ... 7 = Pazar
  is_closed: boolean
  opens_at: string // "HH:mm:ss"
  closes_at: string
  break_starts_at: string | null
  break_ends_at: string | null
}

export interface BlockedPeriod {
  id: string
  starts_at: string
  ends_at: string
  reason: string | null
}

export interface AppointmentRow {
  id: string
  reference_code: string
  service_id: string
  customer_first_name: string
  customer_last_name: string
  customer_phone: string
  customer_email: string | null
  customer_note: string | null
  starts_at: string
  ends_at: string
  status: AppointmentStatus
  created_at: string
  cancelled_at: string | null
  /** İptal nedeni ve müşteriye WhatsApp açıldı mı (0008). Tek randevu iptalinde de yazılır. */
  cancellation_reason?: string | null
  cancel_notice_opened_at?: string | null
  /** Randevu anındaki hizmet adı ve fiyatı (0005). Eski kayıtlarda fiyat null olabilir. */
  service_name: string | null
  price_minor: number | null
  /** Sunucunun Turnstile hostname'ine göre işaretlediği test kaydı (0006) */
  is_test: boolean
  services: { name: string; duration_minutes: number } | null
}

export type NotificationKind = 'booking_received' | 'confirmed' | 'cancelled' | 'rescheduled'
export type NotificationStatus = 'pending' | 'sending' | 'sent' | 'failed' | 'skipped'

/** SMS bildirim kaydı (0006). Telefon ve mesaj metni burada tutulmaz. */
export interface NotificationLog {
  id: number
  kind: NotificationKind
  status: NotificationStatus
  attempts: number
  provider: string | null
  error_code: string | null
  created_at: string
  sent_at: string | null
}

export interface BookingResult {
  reference_code: string
  starts_at: string
  ends_at: string
  service_name: string
  duration_minutes: number
  price_minor: number | null
  status: AppointmentStatus
  /** true: localhost'tan yapılan test rezervasyonu (gerçek randevu değildir) */
  is_test?: boolean
}
