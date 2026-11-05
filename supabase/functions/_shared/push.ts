// Yöneticinin telefonuna "yeni randevu" bildirimi (Web Push). Çalışma ortamından bağımsızdır (WebCrypto).
// Bildirim BOŞ gönderilir: metin public/sw.js içinde sabittir. Bu yüzden şifreleme gerekmez ve bildirim
// servislerine (Google, Apple, Mozilla) müşteri bilgisi gitmez. Yalnızca VAPID imzası gerekir.

const SUBJECT = 'https://www.orkuntarlaci.me'
const TOKEN_SECONDS = 12 * 60 * 60

export interface VapidKeys {
  /** Sıkıştırılmamış P-256 açık anahtar, base64url (65 bayt) */
  publicKey: string
  /** Gizli sayı d, base64url (32 bayt) */
  privateKey: string
}

export interface PushDeps {
  keys: VapidKeys
  listEndpoints: () => Promise<string[]>
  removeEndpoint: (endpoint: string) => Promise<void>
  send?: typeof fetch
  now?: () => number
}

export interface PushSummary { sent: number; removed: number; failed: number }

const toB64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

function fromB64Url(s: string): Uint8Array {
  const raw = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

/** VAPID_KEYS gizli değeri: "<açık anahtar>.<gizli anahtar>". Eksik veya bozuksa null (bildirim atlanır). */
export function parseVapidKeys(value: string | undefined): VapidKeys | null {
  const [publicKey, privateKey, extra] = (value ?? '').trim().split('.')
  if (!publicKey || !privateKey || extra !== undefined) return null
  try {
    if (fromB64Url(publicKey).length !== 65 || fromB64Url(privateKey).length !== 32) return null
  } catch {
    return null
  }
  return { publicKey, privateKey }
}

/** Bildirim servisine kimliğimizi kanıtlayan ES256 imzalı "Authorization" başlığı. */
export async function vapidAuthorization(endpoint: string, keys: VapidKeys, nowMs: number): Promise<string> {
  const pub = fromB64Url(keys.publicKey)
  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', d: keys.privateKey, x: toB64Url(pub.slice(1, 33)), y: toB64Url(pub.slice(33, 65)), ext: true },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )
  const text = (o: unknown) => toB64Url(new TextEncoder().encode(JSON.stringify(o)))
  const unsigned = `${text({ typ: 'JWT', alg: 'ES256' })}.${text({
    aud: new URL(endpoint).origin,
    exp: Math.floor(nowMs / 1000) + TOKEN_SECONDS,
    sub: SUBJECT,
  })}`
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(unsigned))
  return `vapid t=${unsigned}.${toB64Url(new Uint8Array(signature))}, k=${keys.publicKey}`
}

/**
 * Kayıtlı bütün cihazlara bildirim gönderir. Bir cihazın hatası diğerlerini etkilemez. Servis adresin artık
 * geçersiz olduğunu söylerse (404/410: izin kapatıldı, telefon değişti) kayıt silinir.
 */
export async function notifyNewBooking(deps: PushDeps): Promise<PushSummary> {
  const send = deps.send ?? fetch
  const now = deps.now?.() ?? Date.now()
  const summary: PushSummary = { sent: 0, removed: 0, failed: 0 }
  for (const endpoint of await deps.listEndpoints()) {
    try {
      const res = await send(endpoint, {
        method: 'POST',
        headers: { Authorization: await vapidAuthorization(endpoint, deps.keys, now), TTL: '86400', Urgency: 'high', 'Content-Length': '0' },
      })
      if (res.ok) summary.sent++
      else if (res.status === 404 || res.status === 410) {
        await deps.removeEndpoint(endpoint)
        summary.removed++
      } else summary.failed++
    } catch {
      summary.failed++
    }
  }
  return summary
}
