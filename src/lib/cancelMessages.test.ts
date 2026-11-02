import { describe, expect, it } from 'vitest'
import { adminCancelMessage, businessWhatsAppLink, customerCancelRequestMessage, whenPhrase } from './cancelMessages'
import { zonedToInstant } from './time'

const TODAY = '2026-11-02'
const at = (date: string, hhmm: string) => zonedToInstant(date, hhmm).toISOString()

describe('tek randevu iptal mesajları', () => {
  it('günü bugün / yarın / tarih olarak, saati İstanbul saatiyle yazar', () => {
    expect(whenPhrase(at(TODAY, '17:00'), TODAY)).toBe('bugün saat 17:00')
    expect(whenPhrase(at('2026-11-03', '10:00'), TODAY)).toBe('yarın saat 10:00')
    expect(whenPhrase(at('2026-11-05', '09:30'), TODAY)).toBe('5 Kasım Perşembe saat 09:30')
    // 00:30 İstanbul = önceki gün UTC; gün kaymamalı
    expect(whenPhrase(at('2026-11-03', '00:30'), TODAY)).toBe('yarın saat 00:30')
  })

  it('müşterinin iptal isteği saati ve referansı içerir', () => {
    expect(customerCancelRequestMessage('Faruk', at(TODAY, '17:00'), 'FD-AB12', TODAY)).toBe(
      'Faruk Bey merhaba, bugün saat 17:00 için aldığım randevuyu iptal etmek istiyorum. (Referans: FD-AB12)',
    )
  })

  it('işletme mesajı nedeni yalnızca yazıldıysa ekler', () => {
    expect(adminCancelMessage(at(TODAY, '10:00'), '  Elektrik   kesintisi ', 'Faruk Demirezen', TODAY)).toBe(
      'Merhaba, bugün saat 10:00 için aldığınız randevuyu iptal etmek durumundayım.\nNedeni: Elektrik kesintisi\nAnlayışınız için teşekkür ederim.\nFaruk Demirezen',
    )
    expect(adminCancelMessage(at(TODAY, '10:00'), '   ', 'Faruk Demirezen', TODAY)).not.toContain('Nedeni')
    expect(adminCancelMessage(at(TODAY, '10:00'), null, 'Faruk Demirezen', TODAY)).not.toContain('Nedeni')
  })

  it('işletme telefonu cep numarasıysa WhatsApp bağlantısı verir, değilse null', () => {
    expect(businessWhatsAppLink('0532 111 22 33', 'a b')).toBe('https://wa.me/905321112233?text=a%20b')
    expect(businessWhatsAppLink('+90 (532) 111-2233', 'x')).toBe('https://wa.me/905321112233?text=x')
    expect(businessWhatsAppLink('0212 111 22 33', 'x')).toBeNull()
    expect(businessWhatsAppLink(null, 'x')).toBeNull()
  })
})
