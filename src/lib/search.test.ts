import { describe, expect, it } from 'vitest'
import { matchesQuery } from './search'
import type { AppointmentRow } from './types'

const a = {
  id: '1', reference_code: 'FD-ABC234', service_id: 's', customer_first_name: 'İsmail', customer_last_name: 'Çelik',
  customer_phone: '+905321112233', customer_email: null, customer_note: null, starts_at: '', ends_at: '',
  status: 'pending', created_at: '', cancelled_at: null, services: null,
} as AppointmentRow

describe('randevu araması', () => {
  it('ad ve soyadı Türkçe büyük/küçük harf duyarsız eşler', () => {
    expect(matchesQuery(a, 'ismail')).toBe(true)
    expect(matchesQuery(a, 'ÇELİK')).toBe(true)
    expect(matchesQuery(a, 'ahmet')).toBe(false)
  })
  it('telefonu her biçimde ve referans kodunu eşler', () => {
    expect(matchesQuery(a, '0532 111 22 33')).toBe(true)
    expect(matchesQuery(a, '+90 532 111 2233')).toBe(true)
    expect(matchesQuery(a, '2233')).toBe(true)
    expect(matchesQuery(a, '0533 111 22 33')).toBe(false)
    expect(matchesQuery(a, 'fd-abc')).toBe(true)
  })
  it('boş arama her şeyi eşler', () => {
    expect(matchesQuery(a, '  ')).toBe(true)
  })
})
