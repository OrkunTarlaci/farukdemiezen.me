import { describe, expect, it } from 'vitest'
import { decodeKey, needsInstallFirst } from './push'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1'
const IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15'
const ANDROID = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36'

describe('telefon bildirimi', () => {
  it('iPhone ve iPad ana ekrana eklenmeden bildirim istemez', () => {
    expect(needsInstallFirst(IPHONE, 5, false)).toBe(true)
    expect(needsInstallFirst(IPHONE, 5, true)).toBe(false)
    expect(needsInstallFirst(IPAD, 5, false)).toBe(true)
    expect(needsInstallFirst(IPAD, 0, false)).toBe(false) // gerçek Mac
    expect(needsInstallFirst(ANDROID, 5, false)).toBe(false)
  })

  it('açık anahtarı baytlara çevirir (base64url, dolgusuz)', () => {
    expect(Array.from(decodeKey('BAD_-w'))).toEqual([4, 0, 255, 251])
  })
})
