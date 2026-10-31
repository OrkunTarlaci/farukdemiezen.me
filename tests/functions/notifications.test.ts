// SMS bildirim mantığı: mesaj metni, sağlayıcı hatası, yinelenen gönderim ve yönetici tetiklemeli işleme.
// Gerçek SMS sağlayıcısı burada yoktur; sağlayıcı taklit edilir.
import { describe, expect, it, vi } from 'vitest'
import {
  disabledProvider, maskPhone, processNotifications, renderMessage, type MessageData, type NotificationDeps,
  type QueuedNotification, type SmsProvider,
} from '../../supabase/functions/_shared/notifications.ts'
import { handleSendRequest, type SendDeps } from '../../supabase/functions/send-notifications/handler.ts'

const data: MessageData = {
  businessName: 'Faruk Demirezen Erkek Kuaförü',
  serviceName: 'Sakal Kesimi',
  startsAt: '2026-11-02T10:30:00.000Z', // İstanbul 13.30
  priceMinor: 50000,
  referenceCode: 'FD-ABC234',
  contactPhone: '0212 000 00 00',
}

describe('SMS metni', () => {
  it('talep mesajı bunun yalnızca bir talep olduğunu, hizmeti, tarihi, saati ve fiyatı söyler', () => {
    const m = renderMessage('booking_received', data)
    expect(m).toContain('Faruk Demirezen Erkek Kuaförü:')
    expect(m).toContain('Randevu talebiniz alındı')
    expect(m).toContain('Hizmet: Sakal Kesimi')
    expect(m).toContain('Tarih: 2 Kasım 2026')
    expect(m).toContain('Saat: 13.30')
    expect(m).toContain('Fiyat: 500 TL')
    expect(m).toContain('onayından sonra kesinleşir')
  })
  it('onay, iptal ve yeniden planlama mesajları durumu açıkça belirtir; fiyat yoksa yazılmaz', () => {
    expect(renderMessage('confirmed', data)).toContain('Randevunuz onaylandı')
    expect(renderMessage('cancelled', data)).toContain('iptal edildi')
    expect(renderMessage('rescheduled', data)).toContain('2 Kasım 2026 saat 13.30 olarak güncellendi')
    expect(renderMessage('booking_received', { ...data, priceMinor: null })).not.toContain('Fiyat')
  })
  it('telefon maskelenir', () => {
    expect(maskPhone('+905321112233')).toBe('+90********33')
  })
})

function makeDeps(provider: SmsProvider, queue: QueuedNotification[]) {
  const finished: { id: number; status: string; error: string | null }[] = []
  let pending = [...queue]
  const deps: NotificationDeps = {
    provider,
    // Gerçek claim gibi: alınan kayıt bir daha verilmez
    claim: vi.fn(async () => { const out = pending; pending = []; return out }),
    load: vi.fn(async (id) => (id === 'missing' ? null : { phone: '+905321112233', data })),
    finish: vi.fn(async (id, status, _p, _m, error) => { finished.push({ id, status, error }) }),
  }
  return { deps, finished }
}

const q = (id: number, appointment_id = 'a1', kind: QueuedNotification['kind'] = 'booking_received'): QueuedNotification => ({ id, appointment_id, kind })

describe('bildirim kuyruğu işleme', () => {
  it('başarılı gönderimi "sent" yapar ve yeniden çalıştırıldığında aynı SMS\'i tekrar göndermez', async () => {
    const send = vi.fn(async () => ({ ok: true as const, messageId: 'M1' }))
    const { deps, finished } = makeDeps({ name: 'fake', configured: true, send }, [q(1)])
    expect(await processNotifications(deps, 'a1')).toEqual({ sent: 1, failed: 0, skipped: 0 })
    expect(await processNotifications(deps, 'a1')).toEqual({ sent: 0, failed: 0, skipped: 0 })
    expect(send).toHaveBeenCalledTimes(1)
    expect(finished).toEqual([{ id: 1, status: 'sent', error: null }])
  })

  it('sağlayıcı hatası ve istisna "failed" olur; diğer bildirimler yine işlenir', async () => {
    let n = 0
    const send = vi.fn(async () => {
      n++
      if (n === 1) return { ok: false as const, error: 'provider_401', retryable: false }
      if (n === 2) throw new Error('network')
      return { ok: true as const, messageId: 'M3' }
    })
    const { deps, finished } = makeDeps({ name: 'fake', configured: true, send }, [q(1), q(2), q(3)])
    expect(await processNotifications(deps, null)).toEqual({ sent: 1, failed: 2, skipped: 0 })
    expect(finished.map((f) => f.status)).toEqual(['failed', 'failed', 'sent'])
    expect(finished[1].error).toBe('exception:Error') // ayrıntı (telefon/metin) loglanmaz
  })

  it('sağlayıcı yapılandırılmamışsa hiçbir şey göndermez ve kaydı "skipped" yapar', async () => {
    const { deps, finished } = makeDeps(disabledProvider, [q(1)])
    expect(await processNotifications(deps, 'a1')).toEqual({ sent: 0, failed: 0, skipped: 1 })
    expect(finished[0]).toEqual({ id: 1, status: 'skipped', error: 'provider_not_configured' })
  })

  it('randevu bulunamazsa gönderim yapılmaz', async () => {
    const send = vi.fn(async () => ({ ok: true as const, messageId: 'x' }))
    const { deps, finished } = makeDeps({ name: 'fake', configured: true, send }, [q(1, 'missing')])
    await processNotifications(deps, null)
    expect(send).not.toHaveBeenCalled()
    expect(finished[0].status).toBe('skipped')
  })
})

describe('send-notifications fonksiyonu', () => {
  const base = (over: Partial<SendDeps> = {}): SendDeps => ({
    isAdmin: vi.fn(async () => true),
    process: vi.fn(async () => ({ sent: 0, failed: 0, skipped: 1 })),
    provider: { name: 'none', configured: false },
    allowedOrigins: ['http://localhost:5173'],
    ...over,
  })
  const req = (body: unknown, headers: Record<string, string> = {}) =>
    new Request('https://x/functions/v1/send-notifications', {
      method: 'POST',
      headers: { origin: 'http://localhost:5173', authorization: 'Bearer jwt', 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    })

  it('yönetici olmayan çağrıyı reddeder ve kuyruğu işlemez', async () => {
    const d = base({ isAdmin: vi.fn(async () => false) })
    const r = await handleSendRequest(req({}), d)
    expect(r.status).toBe(403)
    expect(d.process).not.toHaveBeenCalled()
  })

  it('durum sorgusunda yalnızca sağlayıcı adı ve yapılandırma durumunu döndürür', async () => {
    const r = await handleSendRequest(req({ statusOnly: true }), base())
    expect(await r.json()).toEqual({ provider: { name: 'none', configured: false } })
  })

  it('geçersiz randevu kimliğini reddeder, geçerli kimlikle kuyruğu işler', async () => {
    const d = base()
    expect((await handleSendRequest(req({ appointmentId: 'x; drop' }), d)).status).toBe(400)
    const id = '3f1c2e4a-1b2c-4d5e-8f90-123456789abc'
    const r = await handleSendRequest(req({ appointmentId: id }), d)
    expect(r.status).toBe(200)
    expect(d.process).toHaveBeenCalledWith(id)
  })

  it('izin verilmeyen kökeni reddeder', async () => {
    expect((await handleSendRequest(req({}, { origin: 'https://kotu.example' }), base())).status).toBe(403)
  })
})
