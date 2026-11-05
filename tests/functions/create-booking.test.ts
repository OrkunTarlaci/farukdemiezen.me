// create-booking Edge Function mantığı: Turnstile doğrulanmadan create_appointment ÇAĞRILMAMALI.
// Deno çalışma ortamı ve gerçek Cloudflare/Supabase burada yoktur; bağımlılıklar taklit edilir.
import { describe, expect, it, vi } from 'vitest'
import {
  clientIpFrom, handleRequest, parseBookingRequest, verifyTurnstileWithCloudflare, type Deps,
} from '../../supabase/functions/create-booking/handler.ts'

const ORIGIN = 'https://kullanici.github.io'
const valid = {
  serviceId: '3f1c2e4a-1b2c-4d5e-8f90-123456789abc',
  startsAt: '2026-11-04T07:00:00.000Z',
  firstName: 'Ali',
  lastName: 'Yılmaz',
  phone: '0532 111 22 33',
  email: '',
  note: '',
  captchaToken: 'tok',
}

function deps(over: Partial<Deps> = {}): Deps & { calls: Record<string, ReturnType<typeof vi.fn>> } {
  const verifyTurnstile = vi.fn(async () => ({ success: true, action: 'booking', hostname: 'kullanici.github.io' }))
  const bookingRateLimitHit = vi.fn(async () => true)
  const bookingGlobalLimitHit = vi.fn(async () => true)
  const createAppointment = vi.fn(async () => ({ data: { reference_code: 'FD-ABC234', status: 'pending' }, error: null }))
  const d: Deps = {
    captchaConfigured: true,
    verifyTurnstile, bookingRateLimitHit, bookingGlobalLimitHit, createAppointment,
    allowedOrigins: [ORIGIN],
    allowedHostnames: ['kullanici.github.io'],
    ...over,
  }
  return Object.assign(d, {
    calls: {
      verifyTurnstile: d.verifyTurnstile as never, bookingRateLimitHit: d.bookingRateLimitHit as never,
      bookingGlobalLimitHit: d.bookingGlobalLimitHit as never, createAppointment: d.createAppointment as never,
    },
  })
}

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request('https://x.supabase.co/functions/v1/create-booking', {
    method: 'POST',
    headers: { origin: ORIGIN, 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7, 10.0.0.1', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}
const errorOf = async (r: Response) => ((await r.json()) as { error: string }).error

describe('create-booking: genel hız sınırı CAPTCHA sonrası', () => {
  it('geçersiz CAPTCHA genel sayacı artırmaz', async () => {
    const d = deps({ verifyTurnstile: vi.fn(async () => ({ success: false })) })
    for (let i = 0; i < 100; i++) expect((await handleRequest(post(valid), d)).status).toBe(403)
    expect(d.calls.bookingGlobalLimitHit).not.toHaveBeenCalled()
    expect(d.calls.createAppointment).not.toHaveBeenCalled()
  })

  it('yanlış action veya hostname de genel sayacı artırmaz', async () => {
    for (const result of [{ success: true, action: 'baska', hostname: 'kullanici.github.io' }, { success: true, action: 'booking', hostname: 'kotu.test' }]) {
      const d = deps({ verifyTurnstile: vi.fn(async () => result) })
      expect((await handleRequest(post(valid), d)).status).toBe(403)
      expect(d.calls.bookingGlobalLimitHit).not.toHaveBeenCalled()
    }
  })

  it('IP sınırına takılan istek ne Turnstile ne genel sayaca ulaşır', async () => {
    const d = deps({ bookingRateLimitHit: vi.fn(async () => false) })
    expect((await handleRequest(post(valid), d)).status).toBe(429)
    expect(d.calls.verifyTurnstile).not.toHaveBeenCalled()
    expect(d.calls.bookingGlobalLimitHit).not.toHaveBeenCalled()
  })

  it('genel sınır doluysa geçerli CAPTCHA ile de randevu oluşturmaz', async () => {
    const d = deps({ bookingGlobalLimitHit: vi.fn(async () => false) })
    const r = await handleRequest(post(valid), d)
    expect(r.status).toBe(429)
    expect(await errorOf(r)).toBe('rate_limited')
    expect(d.calls.verifyTurnstile).toHaveBeenCalledOnce()
    expect(d.calls.createAppointment).not.toHaveBeenCalled()
  })

  it('genel sayaç hatasında kapalı kalır', async () => {
    const d = deps({ bookingGlobalLimitHit: vi.fn(async () => { throw new Error('db') }) })
    const r = await handleRequest(post(valid), d)
    expect(r.status).toBe(503)
    expect(d.calls.createAppointment).not.toHaveBeenCalled()
  })
})

describe('create-booking: CAPTCHA zorunluluğu', () => {
  it('geçerli Turnstile sonucuyla rezervasyonu oluşturur', async () => {
    const d = deps()
    const r = await handleRequest(post(valid), d)
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ reference_code: 'FD-ABC234', status: 'pending' })
    expect(r.headers.get('access-control-allow-origin')).toBe(ORIGIN)
    expect(d.calls.verifyTurnstile).toHaveBeenCalledWith('tok', '203.0.113.7')
    expect(d.calls.createAppointment).toHaveBeenCalledWith({
      p_service_id: valid.serviceId, p_starts_at: valid.startsAt, p_first_name: 'Ali', p_last_name: 'Yılmaz',
      p_phone: '0532 111 22 33', p_email: null, p_note: null, p_is_test: false,
    })
  })

  it('test işaretini yalnızca Cloudflare tarafından doğrulanan hostname belirler', async () => {
    const d = deps({
      allowedHostnames: ['kullanici.github.io', 'localhost'],
      verifyTurnstile: vi.fn(async () => ({ success: true, action: 'booking', hostname: 'localhost' })),
    })
    await handleRequest(post({ ...valid, is_test: false, isTest: false }), d)
    expect(d.calls.createAppointment).toHaveBeenCalledWith(expect.objectContaining({ p_is_test: true }))
    // İstemci "test" dese bile gerçek hostname'den gelen istek test sayılmaz
    const real = deps()
    await handleRequest(post({ ...valid, is_test: true, isTest: true }), real)
    expect(real.calls.createAppointment).toHaveBeenCalledWith(expect.objectContaining({ p_is_test: false }))
  })

  it('randevu kimliğini istemciye göndermez; kayıttan sonra bildirim kancasını çağırır; kanca hatası sonucu bozmaz', async () => {
    const afterBooking = vi.fn(async () => { throw new Error('sms down') })
    const d = deps({
      afterBooking,
      createAppointment: vi.fn(async () => ({ data: { id: 'appt-1', reference_code: 'FD-ABC234', status: 'pending', is_test: false }, error: null })),
    })
    const r = await handleRequest(post(valid), d)
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ reference_code: 'FD-ABC234', status: 'pending', is_test: false })
    expect(afterBooking).toHaveBeenCalledWith('appt-1')
  })

  it('kayıt başarısızsa bildirim kancası çağrılmaz', async () => {
    const afterBooking = vi.fn(async () => undefined)
    const d = deps({ afterBooking, createAppointment: vi.fn(async () => ({ data: null, error: { message: 'slot_unavailable' } })) })
    await handleRequest(post(valid), d)
    expect(afterBooking).not.toHaveBeenCalled()
  })

  it('token yoksa 400 captcha_required; veritabanına gidilmez', async () => {
    const d = deps()
    const r = await handleRequest(post({ ...valid, captchaToken: '' }), d)
    expect(r.status).toBe(400)
    expect(await errorOf(r)).toBe('captcha_required')
    expect(d.calls.verifyTurnstile).not.toHaveBeenCalled()
    expect(d.calls.createAppointment).not.toHaveBeenCalled()
  })

  it('başarısız, yanlış action veya yanlış hostname sonuçlarını reddeder', async () => {
    for (const result of [
      { success: false, 'error-codes': ['invalid-input-response'] },
      { success: true, action: 'login', hostname: 'kullanici.github.io' },
      { success: true, action: 'booking', hostname: 'kotu-site.example' },
      { success: true, action: 'booking' },
    ]) {
      const d = deps({ verifyTurnstile: vi.fn(async () => result) })
      const r = await handleRequest(post(valid), d)
      expect(r.status).toBe(403)
      expect(await errorOf(r)).toBe('captcha_failed')
      expect(d.calls.createAppointment).not.toHaveBeenCalled()
    }
  })

  it('Cloudflare ulaşılamazsa rezervasyon yapılmaz (503)', async () => {
    const d = deps({ verifyTurnstile: vi.fn(async () => { throw new Error('down') }) })
    const r = await handleRequest(post(valid), d)
    expect(r.status).toBe(503)
    expect(await errorOf(r)).toBe('captcha_unavailable')
    expect(d.calls.createAppointment).not.toHaveBeenCalled()
  })

  it('gizli anahtar tanımlı değilse hiçbir rezervasyon kabul edilmez', async () => {
    const d = deps({ captchaConfigured: false })
    const r = await handleRequest(post(valid), d)
    expect(r.status).toBe(503)
    expect(await errorOf(r)).toBe('captcha_not_configured')
    expect(d.calls.verifyTurnstile).not.toHaveBeenCalled()
    expect(d.calls.createAppointment).not.toHaveBeenCalled()
  })
})

describe('create-booking: hız sınırı, köken ve girdi', () => {
  it('hız sınırı aşılınca 429 döner ve Turnstile çağrılmaz', async () => {
    const d = deps({ bookingRateLimitHit: vi.fn(async () => false) })
    const r = await handleRequest(post(valid), d)
    expect(r.status).toBe(429)
    expect(await errorOf(r)).toBe('rate_limited')
    expect(d.calls.verifyTurnstile).not.toHaveBeenCalled()
  })

  it('izin verilmeyen kökeni reddeder, OPTIONS ön isteğine CORS başlıklarıyla yanıt verir', async () => {
    const d = deps()
    const bad = await handleRequest(post(valid, { origin: 'https://kotu-site.example' }), d)
    expect(bad.status).toBe(403)
    expect(d.calls.createAppointment).not.toHaveBeenCalled()
    const pre = await handleRequest(new Request('https://x/create-booking', { method: 'OPTIONS', headers: { origin: ORIGIN } }), d)
    expect(pre.status).toBe(204)
    expect(pre.headers.get('access-control-allow-origin')).toBe(ORIGIN)
    expect(pre.headers.get('access-control-allow-methods')).toContain('POST')
  })

  it('POST dışı yöntem, bozuk JSON, büyük gövde ve hatalı alanları reddeder', async () => {
    const d = deps()
    expect((await handleRequest(new Request('https://x/f', { method: 'GET', headers: { origin: ORIGIN } }), d)).status).toBe(405)
    expect((await handleRequest(post('{bozuk'), d)).status).toBe(400)
    expect((await handleRequest(post({ ...valid, note: 'x'.repeat(9000) }), d)).status).toBe(413)
    expect((await handleRequest(post({ ...valid, serviceId: 'drop table' }), d)).status).toBe(400)
    expect((await handleRequest(post({ ...valid, startsAt: 'yarın' }), d)).status).toBe(400)
    expect((await handleRequest(post({ ...valid, phone: 5321112233 }), d)).status).toBe(400)
    expect(d.calls.createAppointment).not.toHaveBeenCalled()
  })

  it('veritabanı hata kodlarını iletir, ham hataları gizler', async () => {
    const taken = deps({ createAppointment: vi.fn(async () => ({ data: null, error: { message: 'slot_unavailable' } })) })
    const r1 = await handleRequest(post(valid), taken)
    expect(r1.status).toBe(409)
    expect(await errorOf(r1)).toBe('slot_unavailable')

    const raw = deps({ createAppointment: vi.fn(async () => ({ data: null, error: { message: 'relation "x" does not exist' } })) })
    const r2 = await handleRequest(post(valid), raw)
    expect(r2.status).toBe(500)
    expect(await errorOf(r2)).toBe('try_again')
  })
})

describe('yardımcılar', () => {
  it('istemci IP önceliği: cf-connecting-ip > x-real-ip > x-forwarded-for ilk değer', () => {
    expect(clientIpFrom(new Headers({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2' }))).toBe('1.1.1.1')
    expect(clientIpFrom(new Headers({ 'x-forwarded-for': '1.1.1.1', 'x-real-ip': '3.3.3.3' }))).toBe('3.3.3.3')
    expect(clientIpFrom(new Headers({ 'x-real-ip': '3.3.3.3', 'cf-connecting-ip': '4.4.4.4' }))).toBe('4.4.4.4')
    expect(clientIpFrom(new Headers())).toBeNull()
  })

  it('boş e-posta ve notu null yapar', () => {
    const p = parseBookingRequest(valid)
    expect(p).toMatchObject({ email: null, note: null })
  })

  it('siteverify isteğini doğru biçimde gönderir', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response(JSON.stringify({ success: true, action: 'booking' }), { status: 200 }))
    const r = await verifyTurnstileWithCloudflare('gizli', 'tok', '203.0.113.7', fetchImpl as unknown as typeof fetch)
    expect(r.success).toBe(true)
    const [url, init] = fetchImpl.mock.calls[0]
    expect(String(url)).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify')
    const form = init?.body as URLSearchParams
    expect(form.get('secret')).toBe('gizli')
    expect(form.get('response')).toBe('tok')
    expect(form.get('remoteip')).toBe('203.0.113.7')
  })

  it('siteverify HTTP hatasında istisna fırlatır', async () => {
    const fetchImpl = vi.fn(async () => new Response('x', { status: 500 }))
    await expect(verifyTurnstileWithCloudflare('g', 't', null, fetchImpl as unknown as typeof fetch)).rejects.toThrow()
  })
})
