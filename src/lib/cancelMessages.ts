// Tek randevu için WhatsApp mesaj metinleri. Mesajlar normal WhatsApp'ta (wa.me) hazır olarak açılır;
// gönder tuşuna kişi kendisi basar. Ağ çağrısı yapmaz.
import { normalizeReason, whatsAppLink } from './bulkCancel'
import { normalizeTrPhone } from './phone'
import { addDays, dateOfInstant, formatDateShort, timeOfInstant, todayIstanbul } from './time'

/** "bugün saat 17:00" / "yarın saat 17:00" / "5 Kasım Perşembe saat 17:00" (İstanbul saatiyle) */
export function whenPhrase(startsAt: string, today: string = todayIstanbul()): string {
  const date = dateOfInstant(startsAt)
  const day = date === today ? 'bugün' : date === addDays(today, 1) ? 'yarın' : formatDateShort(date)
  return `${day} saat ${timeOfInstant(startsAt)}`
}

/** Müşterinin işletmeye gönderdiği iptal isteği. Referans kodu, doğru randevunun bulunması içindir. */
export function customerCancelRequestMessage(ownerName: string, startsAt: string, referenceCode: string, today?: string): string {
  return `${ownerName} Bey merhaba, ${whenPhrase(startsAt, today)} için aldığım randevuyu iptal etmek istiyorum. (Referans: ${referenceCode})`
}

/** İşletmenin, reddettiği veya iptal ettiği randevu için müşteriye gönderdiği mesaj. Neden isteğe bağlıdır. */
export function adminCancelMessage(startsAt: string, reason: string | null | undefined, signature: string, today?: string): string {
  const r = reason ? normalizeReason(reason) : null
  return [
    `Merhaba, ${whenPhrase(startsAt, today)} için aldığınız randevuyu iptal etmek durumundayım.`,
    ...(r ? [`Nedeni: ${r}`] : []),
    'Anlayışınız için teşekkür ederim.',
    signature,
  ].join('\n')
}

/** Ayarlardaki işletme telefonu (serbest metin, örn. "0532 111 22 33") cep numarasıysa WhatsApp bağlantısı. */
export function businessWhatsAppLink(contactPhone: string | null | undefined, message: string): string | null {
  const e164 = contactPhone ? normalizeTrPhone(contactPhone) : null
  return e164 ? whatsAppLink(e164, message) : null
}
