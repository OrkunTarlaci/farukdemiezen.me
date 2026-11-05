import { describe, expect, it } from 'vitest'
import { IDLE_LIMIT_MS, isIdleExpired } from './idle'
import { needsMfaStep } from './mfa'

describe('iki adımlı giriş', () => {
  it('yalnızca açık olup geçilmemişse kod ister', () => {
    expect(needsMfaStep({ currentLevel: 'aal1', nextLevel: 'aal2' })).toBe(true)
    expect(needsMfaStep({ currentLevel: 'aal2', nextLevel: 'aal2' })).toBe(false)
    expect(needsMfaStep({ currentLevel: 'aal1', nextLevel: 'aal1' })).toBe(false)
    expect(needsMfaStep(null)).toBe(false)
  })
})

describe('boşta oturum', () => {
  it('süre dolunca kapanır, kayıt yoksa kapanmaz', () => {
    const now = 1_000_000_000_000
    expect(isIdleExpired(now - IDLE_LIMIT_MS - 1, now)).toBe(true)
    expect(isIdleExpired(now - IDLE_LIMIT_MS, now)).toBe(false)
    expect(isIdleExpired(null, now)).toBe(false)
  })
})
