// create-booking Edge Function'ının çalışma ortamından bağımsız mantığı.
// Deno'ya özgü hiçbir şey içermez; böylece Node/Vitest ile test edilebilir (tests/functions).
//
// Akış: CORS/yöntem denetimi → girdi doğrulama → IP başına hız sınırı → Turnstile doğrulaması
//       → create_appointment (service_role). Turnstile başarısızsa veritabanına hiç gidilmez.
// Test randevusu: Cloudflare'in doğruladığı hostname testHostnames içindeyse (varsayılan localhost)
// randevu is_test=true kaydedilir. Bu karar istemciden gelen hiçbir değere dayanmaz.

import { corsHeaders, parseList } from '../_shared/http.ts'

export { parseList }

export const TURNSTILE_ACTION = 'booking'
const MAX_BODY_BYTES = 8_000

export interface BookingRequest {
  serviceId: string
  startsAt: string
  firstName: string
  lastName: string
  phone: string
  email: string | null
  note: string | null
  captchaToken: string
}

export interface TurnstileResult {
  success: boolean
  action?: string
  hostname?: string
  'error-codes'?: string[]
}

export interface RpcResult {
  data: unknown
  error: { message: string } | null
}

export interface Deps {
  /** TURNSTILE_SECRET_KEY tanımlı mı? */
  captchaConfigured: boolean
  verifyTurnstile: (token: string, remoteIp: string | null) => Promise<TurnstileResult>
  /** true = izin ver */
  bookingRateLimitHit: (clientIp: string | null) => Promise<boolean>
  createAppointment: (args: Record<string, unknown>) => Promise<RpcResult>
  /** Boşsa tüm kökenlere izin verilir (Turnstile hostname denetimi yine geçerlidir). */
  allowedOrigins: string[]
  /** Boşsa Turnstile hostname denetimi yapılmaz. */
  allowedHostnames: string[]
  /** Bu hostname'lerden gelen (Cloudflare'in doğruladığı) rezervasyonlar test olarak işaretlenir. */
  testHostnames?: string[]
  /** Randevu kaydedildikten sonra (ör. SMS kuyruğunu işlemek için). Hatası yanıtı etkilemez. */
  afterBooking?: (appointmentId: string) => Promise<void>
  /** Kişisel veri içermeyen teşhis kaydı (durum kodu ve hata kodu). */
  log?: (event: { status: number; code: string }) => void
}

export const DEFAULT_TEST_HOSTNAMES = ['localhost', '127.0.0.1']

// Veritabanından gelen ve istemciye aynen iletilebilen hata kodları → HTTP durumu
const DB_ERRORS: Record<string, number> = {
  slot_unavailable: 409,
  slot_invalid: 400,
  too_soon: 400,
  service_unavailable: 400,
  invalid_name: 400,
  invalid_phone: 400,
  invalid_email: 400,
  invalid_note: 400,
  too_many_bookings: 429,
  not_configured: 503,
  try_again: 503,
}

export function clientIpFrom(headers: Headers): string | null {
  const v =
    headers.get('cf-connecting-ip')?.trim() ||
    headers.get('x-real-ip')?.trim() ||
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    ''
  return v ? v.slice(0, 64) : null
}

const isStr = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max
const isOptStr = (v: unknown, max: number) => v === undefined || v === null || isStr(v, max)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Yalnızca biçim ve boyut denetimi; iş kuralları create_appointment'tadır. */
export function parseBookingRequest(body: unknown): BookingRequest | 'invalid_request' | 'captcha_required' {
  if (!body || typeof body !== 'object') return 'invalid_request'
  const b = body as Record<string, unknown>
  if (b.captchaToken === undefined || b.captchaToken === null || b.captchaToken === '') return 'captcha_required'
  if (
    !isStr(b.serviceId, 36) || !UUID_RE.test(b.serviceId) ||
    !isStr(b.startsAt, 40) || Number.isNaN(Date.parse(b.startsAt)) ||
    !isStr(b.firstName, 200) || !isStr(b.lastName, 200) || !isStr(b.phone, 40) ||
    !isOptStr(b.email, 254) || !isOptStr(b.note, 1000) ||
    !isStr(b.captchaToken, 2048)
  ) {
    return 'invalid_request'
  }
  return {
    serviceId: b.serviceId,
    startsAt: b.startsAt,
    firstName: b.firstName,
    lastName: b.lastName,
    phone: b.phone,
    email: (b.email as string | null | undefined) || null,
    note: (b.note as string | null | undefined) || null,
    captchaToken: b.captchaToken,
  }
}

/** Cloudflare siteverify çağrısı. Ağ hatasında istisna fırlatır. */
export async function verifyTurnstileWithCloudflare(
  secret: string,
  token: string,
  remoteIp: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<TurnstileResult> {
  const form = new URLSearchParams({ secret, response: token })
  if (remoteIp) form.set('remoteip', remoteIp)
  const res = await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: form,
  })
  if (!res.ok) throw new Error(`siteverify HTTP ${res.status}`)
  return (await res.json()) as TurnstileResult
}

export async function handleRequest(req: Request, deps: Deps): Promise<Response> {
  const origin = req.headers.get('origin')
  const cors = corsHeaders(origin, deps.allowedOrigins)
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
  const fail = (status: number, code: string) => { deps.log?.({ status, code }); return json(status, { error: code }) }

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'POST') return fail(405, 'invalid_request')
  if (deps.allowedOrigins.length > 0 && (!origin || !deps.allowedOrigins.includes(origin))) {
    return fail(403, 'forbidden')
  }
  if (!deps.captchaConfigured) return fail(503, 'captcha_not_configured')

  const declared = Number(req.headers.get('content-length') ?? '0')
  if (declared > MAX_BODY_BYTES) return fail(413, 'invalid_request')
  const raw = await req.text()
  if (raw.length > MAX_BODY_BYTES) return fail(413, 'invalid_request')
  let body: unknown
  try { body = JSON.parse(raw) } catch { return fail(400, 'invalid_request') }

  const input = parseBookingRequest(body)
  if (input === 'invalid_request') return fail(400, 'invalid_request')
  if (input === 'captcha_required') return fail(400, 'captcha_required')

  const ip = clientIpFrom(req.headers)

  // Hız sınırı Turnstile'dan önce: sınırı aşan istemci Cloudflare'e de istek yaptıramaz.
  try {
    if (!(await deps.bookingRateLimitHit(ip))) return fail(429, 'rate_limited')
  } catch {
    return fail(503, 'try_again')
  }

  let captcha: TurnstileResult
  try {
    captcha = await deps.verifyTurnstile(input.captchaToken, ip)
  } catch {
    return fail(503, 'captcha_unavailable')
  }
  const hostnameOk = deps.allowedHostnames.length === 0 || (captcha.hostname !== undefined && deps.allowedHostnames.includes(captcha.hostname))
  if (!captcha.success || captcha.action !== TURNSTILE_ACTION || !hostnameOk) {
    return fail(403, 'captcha_failed')
  }

  const isTest = captcha.hostname !== undefined && (deps.testHostnames ?? DEFAULT_TEST_HOSTNAMES).includes(captcha.hostname)

  const { data, error } = await deps.createAppointment({
    p_service_id: input.serviceId,
    p_starts_at: input.startsAt,
    p_first_name: input.firstName,
    p_last_name: input.lastName,
    p_phone: input.phone,
    p_email: input.email,
    p_note: input.note,
    p_is_test: isTest,
  })
  if (error) {
    const code = (error.message ?? '').trim()
    // Ham veritabanı hataları istemciye sızdırılmaz.
    if (Object.prototype.hasOwnProperty.call(DB_ERRORS, code)) return fail(DB_ERRORS[code], code)
    return fail(500, 'try_again')
  }

  // Randevu kimliği istemciye gönderilmez; yalnızca sunucu tarafı bildirim için kullanılır.
  const { id, ...result } = (data ?? {}) as { id?: string } & Record<string, unknown>
  if (id && deps.afterBooking) {
    try { await deps.afterBooking(id) } catch { /* SMS hatası randevu sonucunu değiştirmez */ }
  }
  deps.log?.({ status: 200, code: result.is_test ? 'booked_test' : 'booked' })
  return json(200, result)
}
