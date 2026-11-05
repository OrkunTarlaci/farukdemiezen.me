// Güvenilir cihaz değeri. Tek başına hiçbir şey sağlamaz: sunucu her istekte özetini, oturumdaki kullanıcıyı ve
// süreyi denetler (0012). Çıkışta silinmez; yalnızca bu cihazda tutulur, başka cihaza geçmez.
const KEY = 'panel-trusted-device'
export const DEVICE_HEADER = 'x-device-token'

export interface DeviceTrust { token: string; expiresAt: number }

export function readDeviceTrust(): DeviceTrust | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<DeviceTrust> | null
    return typeof v?.token === 'string' && typeof v.expiresAt === 'number' ? { token: v.token, expiresAt: v.expiresAt } : null
  } catch {
    return null
  }
}

export function saveDeviceTrust(trust: DeviceTrust): void {
  try { localStorage.setItem(KEY, JSON.stringify(trust)) } catch { /* depolama kapalıysa kod her girişte istenir */ }
}

export function clearDeviceTrust(): void {
  try { localStorage.removeItem(KEY) } catch { /* yok sayılır */ }
}

/** Başlık yalnızca veritabanı API'sine ve yönetici bildirim fonksiyonuna gider; Auth ve randevu fonksiyonuna gitmez. */
export function sendsDeviceHeader(url: string): boolean {
  return url.includes('/rest/v1/') || url.includes('/functions/v1/send-notifications')
}

export function deviceFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = input instanceof Request ? input.url : String(input)
  const trust = sendsDeviceHeader(url) ? readDeviceTrust() : null
  if (!trust) return fetch(input, init)
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
  headers.set(DEVICE_HEADER, trust.token)
  return fetch(input, { ...init, headers })
}
