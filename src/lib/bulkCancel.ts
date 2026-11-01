// Toplu randevu iptali: hangi randevuların etkileneceği ve müşterilere gidecek WhatsApp mesajı.
// İptalin kendisi sunucuda, randevu başına admin_set_appointment_status ile yapılır (yetki, kilit,
// "zaten iptal" denetimi orada). Bu dosya yalnızca seçim ve metin üretir; ağ çağrısı yapmaz.
import type { AppointmentRow } from './types'
import { addDays, formatDateShort, zonedToInstant } from './time'

/** Toplu iptale girebilecek durumlar: henüz sonuçlanmamış randevular. */
export function isCancellable(a: Pick<AppointmentRow, 'status'>): boolean {
  return a.status === 'pending' || a.status === 'confirmed'
}

/** Seçilen İstanbul gününde, "HH:mm" saatinden (dahil) itibaren başlayan, iptal edilebilir randevular. */
export function selectFromTime(appointments: AppointmentRow[], date: string, fromHhmm: string): AppointmentRow[] {
  const from = zonedToInstant(date, fromHhmm).getTime()
  return appointments
    .filter((a) => isCancellable(a) && new Date(a.starts_at).getTime() >= from)
    .sort((x, y) => x.starts_at.localeCompare(y.starts_at))
}

export const MAX_REASON_LENGTH = 300

/** Yöneticinin yazdığı neden: tek satıra indirilir, kırpılır. Boşsa null. */
export function normalizeReason(reason: string): string | null {
  const r = reason.replace(/\s+/g, ' ').trim()
  return r ? r.slice(0, MAX_REASON_LENGTH) : null
}

/** "bugünkü" / "yarınki" / "5 Kasım Perşembe tarihli": müşterinin hangi randevusu olduğunu saat vermeden anlatır. */
function dayPhrase(date: string, today: string): string {
  if (date === today) return 'bugünkü'
  if (date === addDays(today, 1)) return 'yarınki'
  return `${formatDateShort(date)} tarihli`
}

/**
 * Herkese aynı giden iptal mesajı. Bilerek ad, soyad ve saat İÇERMEZ; neden bir kez yazılır.
 * Seçilen gün bugün değilse "bugünkü" yerine "yarınki" veya tarih yazılır (yanlış bilgi vermemek için).
 */
export function buildCancelMessage(reason: string, date: string, today: string): string {
  return [
    `Merhaba, ${dayPhrase(date, today)} berber randevunuz iptal edilmiştir.`,
    `İptal nedeni: ${normalizeReason(reason) ?? ''}`,
    'Anlayışınız için teşekkür ederiz.',
  ].join('\n')
}

/**
 * Normal WhatsApp'ta sohbeti mesaj hazır olarak açan bağlantı (wa.me). Gönderimi kişi kendisi onaylar;
 * otomatik gönderim yoktur. Telefon "+905XXXXXXXXX" biçiminde saklanır; wa.me yalnızca rakam ister.
 */
export function whatsAppLink(e164: string, message: string): string | null {
  const digits = e164.replace(/\D/g, '')
  if (!/^905\d{9}$/.test(digits)) return null
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
}
