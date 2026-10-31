import { describe, expect, it } from 'vitest'
import {
  blockedPeriodSchema, blockedRange, minorToPriceInput, parsePriceToMinor, serviceSchema, settingsSchema, workingHoursSchema,
} from './adminValidation'

describe('fiyat dönüşümü', () => {
  it('TL girdisini kuruşa çevirir, boşu null yapar', () => {
    expect(parsePriceToMinor('350')).toBe(35000)
    expect(parsePriceToMinor('350,50')).toBe(35050)
    expect(parsePriceToMinor('1.250,00')).toBe(125000)
    expect(parsePriceToMinor('350 ₺')).toBe(35000)
    expect(parsePriceToMinor('')).toBeNull()
  })
  it('geçersiz fiyatı reddeder (negatif, harf, çok ondalık)', () => {
    for (const v of ['-5', 'abc', '10,999', '1e5']) expect(parsePriceToMinor(v)).toBeNaN()
  })
  it('kuruşu forma geri çevirir', () => {
    expect(minorToPriceInput(35000)).toBe('350')
    expect(minorToPriceInput(35050)).toBe('350,50')
    expect(minorToPriceInput(null)).toBe('')
  })
})

describe('hizmet formu', () => {
  const ok = { name: 'Saç Kesimi', description: '', duration_minutes: '30', price: '', sort_order: '1', is_active: true }
  it('geçerli hizmeti kabul eder', () => {
    expect(serviceSchema.safeParse(ok).success).toBe(true)
  })
  it('geçersiz süre, fiyat ve adı reddeder', () => {
    expect(serviceSchema.safeParse({ ...ok, duration_minutes: '0' }).success).toBe(false)
    expect(serviceSchema.safeParse({ ...ok, duration_minutes: '481' }).success).toBe(false)
    expect(serviceSchema.safeParse({ ...ok, duration_minutes: '12.5' }).success).toBe(false)
    expect(serviceSchema.safeParse({ ...ok, price: '-10' }).success).toBe(false)
    expect(serviceSchema.safeParse({ ...ok, name: '   ' }).success).toBe(false)
  })
})

describe('çalışma saati formu', () => {
  const ok = { is_closed: false, opens_at: '10:00', closes_at: '19:00', has_break: false, break_starts_at: '', break_ends_at: '' }
  it('kapanış açılıştan sonra olmalı', () => {
    expect(workingHoursSchema.safeParse(ok).success).toBe(true)
    expect(workingHoursSchema.safeParse({ ...ok, closes_at: '09:00' }).success).toBe(false)
  })
  it('mola çalışma saatleri içinde ve geçerli olmalı', () => {
    expect(workingHoursSchema.safeParse({ ...ok, has_break: true, break_starts_at: '13:00', break_ends_at: '14:00' }).success).toBe(true)
    expect(workingHoursSchema.safeParse({ ...ok, has_break: true, break_starts_at: '14:00', break_ends_at: '13:00' }).success).toBe(false)
    expect(workingHoursSchema.safeParse({ ...ok, has_break: true, break_starts_at: '09:00', break_ends_at: '10:30' }).success).toBe(false)
    expect(workingHoursSchema.safeParse({ ...ok, has_break: true, break_starts_at: '', break_ends_at: '' }).success).toBe(false)
  })
  it('kapalı günde saatler denetlenmez', () => {
    expect(workingHoursSchema.safeParse({ ...ok, is_closed: true, closes_at: '09:00' }).success).toBe(true)
  })
})

describe('kapalı dönem formu (Istanbul saati)', () => {
  const ok = { start_date: '2026-11-10', start_time: '12:00', end_date: '2026-11-10', end_time: '15:00', all_day: false, reason: 'İzin' }
  it('saat aralığını UTC anlara çevirir', () => {
    expect(blockedRange(ok)).toEqual({ starts_at: '2026-11-10T09:00:00.000Z', ends_at: '2026-11-10T12:00:00.000Z' })
  })
  it('tüm gün seçiminde bitiş gününü dahil eder', () => {
    expect(blockedRange({ ...ok, all_day: true, end_date: '2026-11-11' })).toEqual({
      starts_at: '2026-11-09T21:00:00.000Z', ends_at: '2026-11-11T21:00:00.000Z',
    })
  })
  it('bitiş başlangıçtan önceyse reddeder', () => {
    expect(blockedPeriodSchema.safeParse(ok).success).toBe(true)
    expect(blockedPeriodSchema.safeParse({ ...ok, end_time: '11:00' }).success).toBe(false)
    expect(blockedPeriodSchema.safeParse({ ...ok, start_date: '2026-02-30' }).success).toBe(false)
  })
})

describe('ayarlar formu', () => {
  const ok = {
    business_name: 'Faruk Demirezen',
    booking_interval_minutes: '30', minimum_booking_notice_minutes: '60', maximum_booking_horizon_days: '30',
    max_active_bookings_per_phone: '3', address: '', contact_phone: '', map_url: '',
  }
  it('geçerli ayarları kabul eder', () => {
    expect(settingsSchema.safeParse(ok).success).toBe(true)
    expect(settingsSchema.safeParse({ ...ok, map_url: 'https://maps.google.com/?q=x' }).success).toBe(true)
  })
  it('güvensiz bağlantıyı ve sınır dışı değerleri reddeder', () => {
    expect(settingsSchema.safeParse({ ...ok, map_url: 'javascript:alert(1)' }).success).toBe(false)
    expect(settingsSchema.safeParse({ ...ok, map_url: 'http://x.com' }).success).toBe(false)
    expect(settingsSchema.safeParse({ ...ok, booking_interval_minutes: '0' }).success).toBe(false)
    expect(settingsSchema.safeParse({ ...ok, maximum_booking_horizon_days: '366' }).success).toBe(false)
    expect(settingsSchema.safeParse({ ...ok, max_active_bookings_per_phone: '0' }).success).toBe(false)
    expect(settingsSchema.safeParse({ ...ok, business_name: '  ' }).success).toBe(false)
  })
})
