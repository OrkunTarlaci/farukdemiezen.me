import { describe, expect, it } from 'vitest'
import {
  addDays, dateOfInstant, msUntilNextIstanbulMidnight, dayRange, formatDateLong, formatDuration, formatPrice,
  isoWeekday, isValidDateString, timeOfInstant, todayIstanbul, zonedToInstant,
} from './time'

describe('Istanbul saat dilimi', () => {
  it('gece yarısı sınırında doğru günü verir (UTC+3)', () => {
    // 31 Ekim 23:59 Istanbul = 20:59 UTC
    expect(dateOfInstant('2026-10-31T20:59:00Z')).toBe('2026-10-31')
    expect(timeOfInstant('2026-10-31T20:59:00Z')).toBe('23:59')
    // 21:00 UTC = 1 Kasım 00:00 Istanbul
    expect(dateOfInstant('2026-10-31T21:00:00Z')).toBe('2026-11-01')
    expect(timeOfInstant('2026-10-31T21:00:00Z')).toBe('00:00')
  })

  it('todayIstanbul, tarayıcı saat diliminden bağımsızdır', () => {
    expect(todayIstanbul(new Date('2026-10-31T22:30:00Z'))).toBe('2026-11-01')
    expect(todayIstanbul(new Date('2026-10-31T12:00:00Z'))).toBe('2026-10-31')
  })

  it('gün aralığı Istanbul gününe karşılık gelir', () => {
    expect(dayRange('2026-10-31')).toEqual({
      start: '2026-10-30T21:00:00.000Z',
      end: '2026-10-31T21:00:00.000Z',
    })
    expect(dayRange('2026-11-01').start).toBe('2026-10-31T21:00:00.000Z')
  })

  it('duvar saatini doğru ana çevirir', () => {
    expect(zonedToInstant('2026-10-31', '10:00').toISOString()).toBe('2026-10-31T07:00:00.000Z')
    expect(zonedToInstant('2026-11-01', '00:00').toISOString()).toBe('2026-10-31T21:00:00.000Z')
    // gidiş-dönüş
    const t = zonedToInstant('2026-12-31', '23:30')
    expect(dateOfInstant(t)).toBe('2026-12-31')
    expect(timeOfInstant(t)).toBe('23:30')
  })
})

describe('İstanbul gün devri', () => {
  it('bir sonraki İstanbul gece yarısına kalan süreyi hesaplar (cihaz saat diliminden bağımsız)', () => {
    // 1 Kasım 23:59:30 İstanbul = 20:59:30 UTC → 30 sn kaldı
    expect(msUntilNextIstanbulMidnight(new Date('2026-11-01T20:59:30Z'))).toBe(30_000)
    // tam gece yarısı: bir sonraki gün başına 24 saat
    expect(msUntilNextIstanbulMidnight(new Date('2026-11-01T21:00:00Z'))).toBe(24 * 3600_000)
    // UTC'de hâlâ 1 Kasım ama İstanbul'da 2 Kasım 01:00
    expect(msUntilNextIstanbulMidnight(new Date('2026-11-01T22:00:00Z'))).toBe(23 * 3600_000)
  })
})

describe('tarih yardımcıları', () => {
  it('addDays ay ve yıl sınırlarını geçer', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
  it('isoWeekday Pazartesi=1, Pazar=7', () => {
    expect(isoWeekday('2026-10-31')).toBe(6) // Cumartesi
    expect(isoWeekday('2026-11-01')).toBe(7) // Pazar
    expect(isoWeekday('2026-11-02')).toBe(1)
  })
  it('geçersiz tarihleri yakalar', () => {
    expect(isValidDateString('2026-02-30')).toBe(false)
    expect(isValidDateString('2026-13-01')).toBe(false)
    expect(isValidDateString('31-10-2026')).toBe(false)
    expect(isValidDateString('2026-10-31')).toBe(true)
  })
})

describe('Türkçe biçimlendirme', () => {
  it('uzun tarih', () => {
    expect(formatDateLong('2026-10-31')).toBe('31 Ekim 2026 Cumartesi')
    expect(formatDateLong('2026-11-01')).toBe('1 Kasım 2026 Pazar')
  })
  it('süre', () => {
    expect(formatDuration(30)).toBe('30 dk')
    expect(formatDuration(60)).toBe('1 sa')
    expect(formatDuration(90)).toBe('1 sa 30 dk')
  })
  it('fiyat: kuruş → TL, null → null', () => {
    expect(formatPrice(null)).toBeNull()
    expect(formatPrice(70000)).toBe('700 TL')
    expect(formatPrice(125000)).toBe('1.250 TL')
    expect(formatPrice(35050)).toBe('350,50 TL')
    expect(formatPrice(0)).toBe('0 TL')
  })
})
