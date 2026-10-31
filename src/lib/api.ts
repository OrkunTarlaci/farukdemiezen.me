import { AppError, toAppError } from './errors'
import { getSupabase } from './supabase'
import { addDays, dayRange } from './time'
import type {
  AdminSettings, AppointmentRow, AppointmentStatus, BlockedPeriod, BookingResult, BusinessSettings, Service,
  WorkingHours,
} from './types'

async function client() {
  const c = await getSupabase()
  if (!c) throw new AppError('not_configured')
  return c
}

/** Supabase yanıtını denetler; hata varsa güvenli bir AppError fırlatır. */
function unwrap<T>(res: { data: T | null; error: unknown }): T {
  if (res.error) throw toAppError(res.error)
  return res.data as T
}

/** Yönetici yazma işlemleri: kısıt ihlali ve "satır yok" (RLS veya silinmiş kayıt) ayrıca ele alınır. */
function unwrapWrite<T>(res: { data: T | null; error: unknown }): T {
  if (res.error) {
    const e = res.error as { code?: string }
    if (e.code === '23514' || e.code === '22007' || e.code === '22P02') throw new AppError('invalid_input')
    if (e.code === 'PGRST116') throw new AppError('not_found_or_forbidden')
    throw toAppError(res.error)
  }
  return res.data as T
}

// ---------------- Herkese açık (müşteri) ----------------

export async function fetchServices(): Promise<Service[]> {
  const res = await (await client())
    .from('services')
    .select('id, name, description, duration_minutes, price_minor, sort_order, is_active')
    .eq('is_active', true)
    .order('sort_order')
  return unwrap(res) as Service[]
}

const SETTINGS_COLUMNS =
  'business_name, timezone, currency, booking_interval_minutes, minimum_booking_notice_minutes, maximum_booking_horizon_days, address, contact_phone, map_url'

export async function fetchSettings(): Promise<BusinessSettings> {
  const res = await (await client()).from('business_settings').select(SETTINGS_COLUMNS).eq('id', 1).single()
  return unwrap(res) as BusinessSettings
}

export async function fetchWorkingHours(): Promise<WorkingHours[]> {
  const res = await (await client())
    .from('working_hours')
    .select('weekday, is_closed, opens_at, closes_at, break_starts_at, break_ends_at')
    .order('weekday')
  return unwrap(res) as WorkingHours[]
}

// get_available_dates en fazla 92 günlük aralık kabul eder (p_to - p_from <= 92).
const MAX_DATE_RANGE_DAYS = 92

/** Aralıkta en az bir uygun saati olan günler (YYYY-MM-DD). Uzun aralıklar parçalara bölünür. */
export async function fetchAvailableDates(serviceId: string, from: string, to: string): Promise<string[]> {
  const c = await client()
  const chunks: { p_from: string; p_to: string }[] = []
  for (let start = from; start <= to; start = addDays(start, MAX_DATE_RANGE_DAYS + 1)) {
    const end = addDays(start, MAX_DATE_RANGE_DAYS)
    chunks.push({ p_from: start, p_to: end < to ? end : to })
  }
  const results = await Promise.all(chunks.map((ch) => c.rpc('get_available_dates', { p_service_id: serviceId, ...ch })))
  return results.flatMap((res) => (unwrap(res) as { day: string }[]).map((r) => r.day))
}

/** Seçilen gün için gerçekten alınabilir başlangıç anları (ISO, UTC). */
export async function fetchAvailableSlots(date: string, serviceId: string): Promise<string[]> {
  const res = await (await client()).rpc('get_available_slots', { p_date: date, p_service_id: serviceId })
  return (unwrap(res) as { slot_start: string }[]).map((r) => new Date(r.slot_start).toISOString())
}

export interface CreateAppointmentInput {
  serviceId: string
  startsAt: string
  firstName: string
  lastName: string
  phone: string
  email: string
  note: string
  /** Cloudflare Turnstile token'ı (tek kullanımlık) */
  captchaToken: string
}

/**
 * Edge Function hatasını güvenli bir AppError'a çevirir; gövdedeki { error: kod } okunur.
 * supabase-js sınıfları yerine `name` ile tanınır: böylece kütüphane ilk yüklemeye girmez.
 */
export async function toFunctionError(error: unknown): Promise<AppError> {
  const e = error as { name?: string; context?: unknown }
  if (e?.name === 'FunctionsFetchError') return new AppError('network')
  if (e?.name === 'FunctionsHttpError') {
    try {
      const body = (await (e.context as Response).json()) as { error?: unknown }
      if (typeof body?.error === 'string') return toAppError({ message: body.error })
    } catch { /* gövde JSON değil */ }
    return new AppError('try_again')
  }
  if (e?.name === 'FunctionsRelayError') return new AppError('try_again')
  return toAppError(error)
}

/**
 * Rezervasyonu create-booking Edge Function'ı üzerinden oluşturur: sunucu önce Turnstile token'ını
 * Cloudflare'de doğrular, sonra create_appointment'ı çağırır. Başarı yalnızca sunucu onaylarsa döner.
 */
export async function createAppointment(input: CreateAppointmentInput): Promise<BookingResult> {
  const { data, error } = await (await client()).functions.invoke<BookingResult>('create-booking', {
    body: {
      serviceId: input.serviceId,
      startsAt: input.startsAt,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
      email: input.email || null,
      note: input.note || null,
      captchaToken: input.captchaToken,
    },
  })
  if (error) throw await toFunctionError(error)
  if (!data?.reference_code) throw new AppError('try_again')
  return data
}

// ---------------- Yönetici ----------------
// Tüm yönetici okuma/yazma işlemleri RLS ve is_admin() ile veritabanında korunur (0001, 0004).

export async function checkIsAdmin(): Promise<boolean> {
  const res = await (await client()).rpc('is_admin')
  return unwrap(res) === true
}

const APPOINTMENT_COLUMNS =
  'id, reference_code, service_id, customer_first_name, customer_last_name, customer_phone, customer_email, customer_note, starts_at, ends_at, status, created_at, cancelled_at, services(name, duration_minutes)'

/** Yönetici listelerinde tek seferde en fazla bu kadar gün sorgulanır. */
export const MAX_ADMIN_RANGE_DAYS = 92
const MAX_ADMIN_ROWS = 1000

/** Istanbul günleri [from, to] (ikisi dahil) arasında başlayan randevular. */
export async function fetchAppointmentsInRange(
  from: string,
  to: string,
  filters: { status?: AppointmentStatus; serviceId?: string } = {},
): Promise<AppointmentRow[]> {
  if (to < from || addDays(from, MAX_ADMIN_RANGE_DAYS) < to) throw new AppError('invalid_range')
  let q = (await client())
    .from('appointments')
    .select(APPOINTMENT_COLUMNS)
    .gte('starts_at', dayRange(from).start)
    .lt('starts_at', dayRange(to).end)
  if (filters.status) q = q.eq('status', filters.status)
  if (filters.serviceId) q = q.eq('service_id', filters.serviceId)
  const res = await q.order('starts_at').limit(MAX_ADMIN_ROWS)
  return unwrap(res) as unknown as AppointmentRow[]
}

/** Yalnızca verilen Istanbul gününe ait randevular. */
export function fetchAppointmentsForDay(date: string): Promise<AppointmentRow[]> {
  return fetchAppointmentsInRange(date, date)
}

export async function fetchBlockedInRange(from: string, to: string): Promise<BlockedPeriod[]> {
  const res = await (await client())
    .from('blocked_periods')
    .select('id, starts_at, ends_at, reason')
    .lt('starts_at', dayRange(to).end)
    .gt('ends_at', dayRange(from).start)
    .order('starts_at')
  return unwrap(res) as BlockedPeriod[]
}

export function fetchBlockedForDay(date: string): Promise<BlockedPeriod[]> {
  return fetchBlockedInRange(date, date)
}

/** Bitmemiş kapalı dönemler (tatil, izin). */
export async function fetchUpcomingBlocked(): Promise<BlockedPeriod[]> {
  const res = await (await client())
    .from('blocked_periods')
    .select('id, starts_at, ends_at, reason')
    .gt('ends_at', new Date().toISOString())
    .order('starts_at')
    .limit(200)
  return unwrap(res) as BlockedPeriod[]
}

export async function createBlockedPeriod(input: { starts_at: string; ends_at: string; reason: string | null }): Promise<BlockedPeriod> {
  const res = await (await client()).from('blocked_periods').insert(input).select('id, starts_at, ends_at, reason').single()
  return unwrapWrite(res) as BlockedPeriod
}

export async function deleteBlockedPeriod(id: string): Promise<void> {
  const res = await (await client()).from('blocked_periods').delete().eq('id', id).select('id')
  const rows = unwrapWrite(res) as { id: string }[]
  if (rows.length === 0) throw new AppError('not_found_or_forbidden')
}

export async function setAppointmentStatus(id: string, status: 'confirmed' | 'cancelled'): Promise<void> {
  const res = await (await client()).rpc('admin_set_appointment_status', { p_id: id, p_status: status })
  unwrap(res)
}

const SERVICE_COLUMNS = 'id, name, description, duration_minutes, price_minor, sort_order, is_active'
export type ServiceInput = Omit<Service, 'id'>

/** Yönetici pasif hizmetleri de görür (RLS: is_active or is_admin()). */
export async function fetchAllServices(): Promise<Service[]> {
  const res = await (await client()).from('services').select(SERVICE_COLUMNS).order('sort_order').order('name')
  return unwrap(res) as Service[]
}

export async function createService(input: ServiceInput): Promise<Service> {
  const res = await (await client()).from('services').insert(input).select(SERVICE_COLUMNS).single()
  return unwrapWrite(res) as Service
}

export async function updateService(id: string, input: Partial<ServiceInput>): Promise<Service> {
  const res = await (await client()).from('services').update(input).eq('id', id).select(SERVICE_COLUMNS).single()
  return unwrapWrite(res) as Service
}

export async function updateWorkingHours(weekday: number, input: Omit<WorkingHours, 'weekday'>): Promise<WorkingHours> {
  const res = await (await client())
    .from('working_hours')
    .update(input)
    .eq('weekday', weekday)
    .select('weekday, is_closed, opens_at, closes_at, break_starts_at, break_ends_at')
    .single()
  return unwrapWrite(res) as WorkingHours
}

export async function fetchAdminSettings(): Promise<AdminSettings> {
  const res = await (await client())
    .from('business_settings')
    .select(`${SETTINGS_COLUMNS}, max_active_bookings_per_phone`)
    .eq('id', 1)
    .single()
  return unwrap(res) as AdminSettings
}

export type SettingsInput = Pick<
  AdminSettings,
  'booking_interval_minutes' | 'minimum_booking_notice_minutes' | 'maximum_booking_horizon_days' |
  'max_active_bookings_per_phone' | 'address' | 'contact_phone' | 'map_url'
>

export async function updateSettings(input: SettingsInput): Promise<AdminSettings> {
  const res = await (await client())
    .from('business_settings')
    .update(input)
    .eq('id', 1)
    .select(`${SETTINGS_COLUMNS}, max_active_bookings_per_phone`)
    .single()
  return unwrapWrite(res) as AdminSettings
}
