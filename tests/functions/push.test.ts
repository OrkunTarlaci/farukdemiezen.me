import { describe, expect, it } from 'vitest'
import { isPushEndpoint, notifyNewBooking, parseVapidKeys, vapidAuthorization, type VapidKeys } from '../../supabase/functions/_shared/push'

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url')

async function makeKeys(): Promise<{ keys: VapidKeys; verifyKey: CryptoKey }> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey)
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))
  return { keys: { publicKey: b64(raw), privateKey: jwk.d! }, verifyKey: pair.publicKey }
}

describe('VAPID anahtarı', () => {
  it('"açık.gizli" biçimini okur; eksik veya bozuksa null döner', async () => {
    const { keys } = await makeKeys()
    expect(parseVapidKeys(`  ${keys.publicKey}.${keys.privateKey}\n`)).toEqual(keys)
    expect(parseVapidKeys(undefined)).toBeNull()
    expect(parseVapidKeys('')).toBeNull()
    expect(parseVapidKeys(keys.publicKey)).toBeNull()
    expect(parseVapidKeys(`${keys.publicKey}.kisa`)).toBeNull()
    expect(parseVapidKeys(`${keys.publicKey}.${keys.privateKey}.fazla`)).toBeNull()
  })

  it('bildirim servisinin doğrulayabileceği ES256 imza üretir', async () => {
    const { keys, verifyKey } = await makeKeys()
    const now = Date.UTC(2026, 10, 5)
    const header = await vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc', keys, now)
    const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header)!
    expect(m[4]).toBe(keys.publicKey)
    const claims = JSON.parse(Buffer.from(m[2], 'base64url').toString())
    expect(claims.aud).toBe('https://fcm.googleapis.com')
    expect(claims.exp).toBe(now / 1000 + 12 * 3600)
    expect(claims.sub).toMatch(/^https:\/\//)
    const ok = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' }, verifyKey, Buffer.from(m[3], 'base64url'), new TextEncoder().encode(`${m[1]}.${m[2]}`),
    )
    expect(ok).toBe(true)
  })
})

describe('yeni randevu bildirimi', () => {
  it('boş gönderir; geçersiz cihazı siler; bir cihazın hatası diğerlerini durdurmaz', async () => {
    const { keys } = await makeKeys()
    const statuses: Record<string, number | 'throw'> = {
      'https://fcm.googleapis.com/ok': 201, 'https://fcm.googleapis.com/gone': 410, 'https://web.push.apple.com/down': 500, 'https://web.push.apple.com/net': 'throw', 'https://fcm.googleapis.com/ok2': 201,
    }
    const removed: string[] = []
    const bodies: unknown[] = []
    const summary = await notifyNewBooking({
      keys,
      listEndpoints: async () => Object.keys(statuses),
      removeEndpoint: async (e) => { removed.push(e) },
      send: (async (url: string, init: RequestInit) => {
        bodies.push(init.body)
        const s = statuses[url]
        if (s === 'throw') throw new Error('ağ')
        return new Response(null, { status: s })
      }) as unknown as typeof fetch,
    })
    expect(summary).toEqual({ sent: 2, removed: 1, failed: 2 })
    expect(removed).toEqual(['https://fcm.googleapis.com/gone'])
    expect(bodies.every((b) => b === undefined)).toBe(true) // bildirimde veri yok
  })

  it('bilinmeyen adrese istek atmaz, kaydı siler', async () => {
    const { keys } = await makeKeys()
    const removed: string[] = []
    const called: string[] = []
    const summary = await notifyNewBooking({
      keys,
      listEndpoints: async () => ['https://169.254.169.254/latest', 'http://fcm.googleapis.com/x'],
      removeEndpoint: async (e) => { removed.push(e) },
      send: (async (url: string) => { called.push(url); return new Response(null, { status: 201 }) }) as unknown as typeof fetch,
    })
    expect(called).toEqual([])
    expect(removed).toHaveLength(2)
    expect(summary).toEqual({ sent: 0, removed: 2, failed: 0 })
  })

  it('yalnızca bilinen servisleri kabul eder', () => {
    for (const ok of ['https://fcm.googleapis.com/fcm/send/a', 'https://web.push.apple.com/a', 'https://wns2-db5p.notify.windows.com/w/a', 'https://updates.push.services.mozilla.com/wpush/v2/a']) {
      expect(isPushEndpoint(ok)).toBe(true)
    }
    for (const bad of ['https://fcm.googleapis.com.kotu.test/a', 'https://kotu.test/fcm.googleapis.com/', 'http://web.push.apple.com/a', 'bozuk']) {
      expect(isPushEndpoint(bad)).toBe(false)
    }
  })
})
