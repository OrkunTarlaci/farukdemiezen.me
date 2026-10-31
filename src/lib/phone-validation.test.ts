import { describe, expect, it } from 'vitest'
import { formatTrPhone, normalizeTrPhone } from './phone'
import { customerSchema } from './validation'

describe('telefon', () => {
  it('geçerli biçimleri normalize eder', () => {
    for (const v of ['0532 111 22 33', '532-111-22-33', '+90 532 111 22 33', '905321112233', '00905321112233', '(0532) 111 2233']) {
      expect(normalizeTrPhone(v)).toBe('+905321112233')
    }
  })
  it('geçersizleri reddeder', () => {
    for (const v of ['', '0212 111 22 33', '12345', 'abc', '0532 111 22', '+1 555 123 4567', '053211122334']) {
      expect(normalizeTrPhone(v)).toBeNull()
    }
  })
  it('okunabilir biçime çevirir', () => {
    expect(formatTrPhone('+905321112233')).toBe('0532 111 22 33')
  })
})

describe('müşteri formu doğrulaması', () => {
  const ok = { firstName: 'Ali', lastName: 'Yılmaz', phone: '0532 111 22 33', email: '', note: '' }
  it('geçerli veriyi kabul eder', () => {
    expect(customerSchema.safeParse(ok).success).toBe(true)
    expect(customerSchema.safeParse({ ...ok, email: 'ali@example.com', note: 'Merhaba' }).success).toBe(true)
  })
  it('zorunlu alanları ister', () => {
    expect(customerSchema.safeParse({ ...ok, firstName: '  ' }).success).toBe(false)
    expect(customerSchema.safeParse({ ...ok, lastName: '' }).success).toBe(false)
    expect(customerSchema.safeParse({ ...ok, phone: '' }).success).toBe(false)
  })
  it('geçersiz telefon, e-posta ve uzun notu reddeder', () => {
    expect(customerSchema.safeParse({ ...ok, phone: '0212 111 22 33' }).success).toBe(false)
    expect(customerSchema.safeParse({ ...ok, email: 'gecersiz' }).success).toBe(false)
    expect(customerSchema.safeParse({ ...ok, note: 'x'.repeat(301) }).success).toBe(false)
  })
  it('notu sunucu gibi kırptıktan sonra sayar', () => {
    expect(customerSchema.safeParse({ ...ok, note: `${'x'.repeat(300)}   ` }).success).toBe(true)
  })
})
