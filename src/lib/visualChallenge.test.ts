import { describe, expect, it } from 'vitest'
import { captchaTokenFor, resolveVerificationMode } from './verification'
import { GRID_SIZE, generateChallenge, isCorrectSelection } from './visualChallenge'

/** Tekrarlanabilir sözde-rastgele üreteç (testler için). */
function seeded(seed: number) {
  let s = seed
  return () => { s = (s * 1664525 + 1013904223) % 2 ** 32; return s / 2 ** 32 }
}

describe('doğrulama modu', () => {
  it('site anahtarı varsa her ortamda gerçek Turnstile kullanılır', () => {
    expect(resolveVerificationMode('0x4AAA', false)).toBe('turnstile')
    expect(resolveVerificationMode('0x4AAA', true)).toBe('turnstile')
  })
  it('geçici görsel test yalnızca geliştirmede; üretimde dürüst "kullanılamıyor" durumu', () => {
    expect(resolveVerificationMode(null, true)).toBe('dev-visual')
    expect(resolveVerificationMode(null, false)).toBe('unavailable')
  })
  it('geçici test sunucuya güvenlik belgesi göndermez', () => {
    expect(captchaTokenFor({ kind: 'local' })).toBe('')
    expect(captchaTokenFor({ kind: 'token', token: 'abc' })).toBe('abc')
  })
})

describe('görsel seçme testi', () => {
  it('9 görsel üretir; 2–4 tanesi hedef nesnedir', () => {
    for (let seed = 1; seed < 200; seed++) {
      const c = generateChallenge(seeded(seed))
      expect(c.tiles).toHaveLength(GRID_SIZE)
      const n = c.tiles.filter((t) => t.category === c.target).length
      expect(n).toBeGreaterThanOrEqual(2)
      expect(n).toBeLessThanOrEqual(4)
      expect(new Set(c.tiles.map((t) => t.id)).size).toBe(GRID_SIZE)
    }
  })

  it('yalnızca tam doğru seçimi kabul eder', () => {
    const c = generateChallenge(seeded(42))
    const targets = c.tiles.filter((t) => t.category === c.target).map((t) => t.id)
    const other = c.tiles.find((t) => t.category !== c.target)!.id
    expect(isCorrectSelection(c, new Set(targets))).toBe(true)
    expect(isCorrectSelection(c, new Set(targets.slice(1)))).toBe(false) // eksik
    expect(isCorrectSelection(c, new Set([...targets, other]))).toBe(false) // fazla
    expect(isCorrectSelection(c, new Set())).toBe(false)
  })
})
