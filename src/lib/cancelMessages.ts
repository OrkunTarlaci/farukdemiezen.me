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

// Saatin okunuşundaki son kelimeye göre bulunma eki: 10:00 "on" → 'daki, 17:00 "on yedi" → 'deki,
// 14:45 "kırk beş" → 'teki, 16:40 "kırk" → 'taki.
const UNIT_SUFFIX = ['', 'deki', 'deki', 'teki', 'teki', 'teki', 'daki', 'deki', 'deki', 'daki']
const TENS_SUFFIX = ['daki', 'daki', 'deki', 'daki', 'taki', 'deki']

/** "17:00" → "17:00'deki" */
export function timeWithLocative(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const n = m || h
  return `${hhmm}'${n % 10 ? UNIT_SUFFIX[n % 10] : TENS_SUFFIX[Math.floor(n / 10)]}`
}

/** "yarın saat 10:00'daki" */
function atPhrase(startsAt: string, today?: string): string {
  const time = timeOfInstant(startsAt)
  return whenPhrase(startsAt, today).replace(new RegExp(`${time}$`), timeWithLocative(time))
}

/** Müşterinin işletmeye gönderdiği iptal isteği. Referans kodu, doğru randevunun bulunması içindir. */
export function customerCancelRequestMessage(ownerName: string, startsAt: string, referenceCode: string, today?: string): string {
  return `${ownerName} Bey merhaba, ${atPhrase(startsAt, today)} berber randevumu iptal etmek istiyorum. (Referans: ${referenceCode})`
}

/** İşletmenin, reddettiği veya iptal ettiği randevu için müşteriye gönderdiği mesaj. Neden isteğe bağlıdır. */
export function adminCancelMessage(startsAt: string, reason: string | null | undefined, signature: string, today?: string): string {
  const r = reason ? normalizeReason(reason) : null
  return [
    `Merhaba, ${atPhrase(startsAt, today)} berber randevunuzu iptal etmek durumundayım.`,
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
