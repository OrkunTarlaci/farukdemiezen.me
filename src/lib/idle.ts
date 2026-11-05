// Panelde uzun süre işlem yapılmazsa oturumu kapatır. Son hareket zamanı tarayıcıda tutulur; uygulama
// kapatılıp açılsa da süre geçerlidir. Süre, günlük kullanımda tekrar giriş istemeyecek kadar uzundur.
const KEY = 'panel-last-activity'
export const IDLE_LIMIT_MS = 24 * 60 * 60 * 1000

export function isIdleExpired(last: number | null, now: number, limit = IDLE_LIMIT_MS): boolean {
  return last !== null && now - last > limit
}

export function readActivity(): number | null {
  try {
    const v = Number(localStorage.getItem(KEY))
    return Number.isFinite(v) && v > 0 ? v : null
  } catch {
    return null
  }
}

export function touchActivity(now = Date.now()): void {
  try { localStorage.setItem(KEY, String(now)) } catch { /* depolama kapalıysa süre sayılmaz */ }
}
