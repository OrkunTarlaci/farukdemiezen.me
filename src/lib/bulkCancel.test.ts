import { describe, expect, it } from 'vitest'
import { buildCancelMessage, normalizeReason, selectFromTime, whatsAppLink } from './bulkCancel'
import { zonedToInstant } from './time'
import type { AppointmentRow } from './types'

const DATE = '2026-11-02'

function appt(id: string, from: string, status: AppointmentRow['status'] = 'confirmed'): AppointmentRow {
  return {
    id, reference_code: `FD-${id}`, service_id: 's', customer_first_name: 'Ali', customer_last_name: 'Yılmaz',
    customer_phone: '+905321112233', customer_email: null, customer_note: null,
    starts_at: zonedToInstant(DATE, from).toISOString(), ends_at: zonedToInstant(DATE, from).toISOString(),
    status, created_at: '2026-11-01T10:00:00Z', cancelled_at: status === 'cancelled' ? '2026-11-01T11:00:00Z' : null,
    service_name: 'Saç Kesimi', price_minor: 70000, is_test: false,
    services: { name: 'Saç Kesimi', duration_minutes: 30 },
  }
}

describe('toplu iptal seçimi', () => {
  it('seçilen saatten (dahil) sonraki, onay bekleyen ve onaylı randevuları saat sırasıyla verir', () => {
    const list = [
      appt('c', '17:00', 'pending'), appt('a', '14:30'), appt('b', '15:00'),
      appt('x', '16:00', 'cancelled'), appt('y', '15:30', 'completed'), appt('z', '18:00', 'no_show'),
    ]
    expect(selectFromTime(list, DATE, '15:00').map((a) => a.id)).toEqual(['b', 'c'])
  })
  it('saati İstanbul saatine göre karşılaştırır (UTC kayması yok)', () => {
    // 00:30 İstanbul = önceki gün 21:30 UTC
    expect(selectFromTime([appt('g', '00:30')], DATE, '00:00').map((a) => a.id)).toEqual(['g'])
    expect(selectFromTime([appt('g', '00:30')], DATE, '01:00')).toEqual([])
  })
})

describe('iptal mesajı', () => {
  const today = '2026-11-02'
  it('istenen biçimde; ad, soyad ve saat içermez', () => {
    const msg = buildCancelMessage('  Acil   hastane\nziyareti ', today, today)
    expect(msg).toBe(
      'Merhaba, bugünkü berber randevunuz iptal edilmiştir.\nİptal nedeni: Acil hastane ziyareti\nAnlayışınız için teşekkür ederiz.',
    )
    expect(msg).not.toMatch(/Ali|Yılmaz|\d{1,2}[:.]\d{2}/)
  })
  it('gün bugün değilse "bugünkü" demez', () => {
    expect(buildCancelMessage('İzin', '2026-11-03', today)).toMatch(/^Merhaba, yarınki berber randevunuz/)
    expect(buildCancelMessage('İzin', '2026-11-06', today)).toMatch(/^Merhaba, 6 Kasım Cuma tarihli berber randevunuz/)
  })
  it('boş neden geçersizdir; uzun neden kırpılır', () => {
    expect(normalizeReason('   ')).toBeNull()
    expect(normalizeReason('a'.repeat(500))).toHaveLength(300)
  })
})

describe('WhatsApp bağlantısı', () => {
  it('wa.me adresine yalnızca rakamlarla ve kodlanmış metinle gider', () => {
    expect(whatsAppLink('+905321112233', 'Merhaba\nİptal nedeni: A&B'))
      .toBe('https://wa.me/905321112233?text=Merhaba%0A%C4%B0ptal%20nedeni%3A%20A%26B')
  })
  it('Türkiye cep numarası değilse bağlantı üretmez', () => {
    expect(whatsAppLink('+12025550123', 'x')).toBeNull()
  })
})
