export type AppointmentStatus = 'pending' | 'confirmed' | 'cancelled'

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
  services: { name: string; duration_minutes: number } | null
}

export interface BookingResult {
  reference_code: string
  starts_at: string
  ends_at: string
  service_name: string
  duration_minutes: number
  price_minor: number | null
  status: AppointmentStatus
}
