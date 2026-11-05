import { describe, expect, it } from 'vitest'
import { parseAuthHash } from './authLink'
import { sendsDeviceHeader } from './deviceToken'
import { hourOptions } from './hours'
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

describe('güvenilir cihaz başlığı', () => {
  it('yalnızca veritabanı ve yönetici fonksiyonu adreslerine gider', () => {
    const b = 'https://x.supabase.co'
    expect(sendsDeviceHeader(`${b}/rest/v1/rpc/is_admin`)).toBe(true)
    expect(sendsDeviceHeader(`${b}/functions/v1/send-notifications`)).toBe(true)
    expect(sendsDeviceHeader(`${b}/auth/v1/token`)).toBe(false)
    expect(sendsDeviceHeader(`${b}/functions/v1/create-booking`)).toBe(false)
    expect(sendsDeviceHeader('https://kotu.test/x')).toBe(false)
  })
})

describe('davet bağlantısı', () => {
  it('yalnızca davet ve sıfırlama bağlantısını kabul eder', () => {
    const t = 'access_token=a&refresh_token=b'
    expect(parseAuthHash(`#${t}&type=invite`)).toEqual({ kind: 'session', accessToken: 'a', refreshToken: 'b' })
    expect(parseAuthHash(`#${t}&type=recovery`)).toEqual({ kind: 'session', accessToken: 'a', refreshToken: 'b' })
    expect(parseAuthHash(`#${t}&type=magiclink`)).toBeNull()
    expect(parseAuthHash('#access_token=a&type=invite')).toBeNull()
    expect(parseAuthHash('#/admin')).toBeNull()
    expect(parseAuthHash('')).toBeNull()
    expect(parseAuthHash('#error=access_denied&error_code=otp_expired')).toEqual({ kind: 'error' })
  })
})

describe('çalışma saati seçenekleri', () => {
  it('yalnızca tam saatler sunar; eski yarım saat kaydı kaybolmaz', () => {
    expect(hourOptions().every((h) => h.endsWith(':00'))).toBe(true)
    expect(hourOptions()).toContain('11:00')
    expect(hourOptions()).toContain('22:00')
    expect(hourOptions('09:30')).toContain('09:30')
    expect(hourOptions('11:00').filter((h) => h === '11:00')).toHaveLength(1)
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
