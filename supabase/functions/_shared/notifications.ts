// SMS bildirimleri: mesaj metni, sağlayıcı arayüzü ve kuyruk işleme. Çalışma ortamından bağımsızdır
// (Deno'ya özgü kod yok); Node/Vitest ile test edilir. create-booking ve send-notifications kullanır.
//
// Akış: veritabanı bildirimi randevu değişikliğiyle aynı transaction'da kuyruğa yazar (0006) →
// claim_notifications kaydı "sending" yapar (başka işlem alamaz) → sağlayıcıya gönderilir →
// finish_notification sonucu yazar. Gönderim başarısız olsa da randevu DEĞİŞMEZ.
// Telefon numarası ve mesaj metni loglanmaz ve kuyrukta saklanmaz.

export type NotificationKind = 'booking_received' | 'confirmed' | 'cancelled' | 'rescheduled'

export interface QueuedNotification {
  id: number
  appointment_id: string
  kind: NotificationKind
}

export interface MessageData {
  businessName: string
  serviceName: string
  startsAt: string // ISO
  priceMinor: number | null
  referenceCode: string
  contactPhone: string | null
}

const TZ = 'Europe/Istanbul'

function dateTr(iso: string): string {
  return new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso))
}

function timeTr(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso))
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00'
  return `${get('hour')}.${get('minute')}`
}

function priceTr(minor: number | null): string | null {
  if (minor == null) return null
  const major = minor / 100
  return `${new Intl.NumberFormat('tr-TR', { minimumFractionDigits: Number.isInteger(major) ? 0 : 2, maximumFractionDigits: 2 }).format(major)} TL`
}

/**
 * Bilgilendirme mesajı (ticari/pazarlama içeriği YOKTUR). Durum açıkça belirtilir:
 * "talep alındı" mesajı randevunun henüz onaylanmadığını söyler.
 */
export function renderMessage(kind: NotificationKind, d: MessageData): string {
  const head = `${d.businessName}:`
  const when = `${dateTr(d.startsAt)} saat ${timeTr(d.startsAt)}`
  const price = priceTr(d.priceMinor)
  const contact = d.contactPhone ? ` Bilgi: ${d.contactPhone}` : ''
  switch (kind) {
    case 'booking_received':
      return `${head} Randevu talebiniz alındı. Hizmet: ${d.serviceName}. Tarih: ${dateTr(d.startsAt)}. Saat: ${timeTr(d.startsAt)}.${price ? ` Fiyat: ${price}.` : ''} Talebiniz işletme onayından sonra kesinleşir. Ref: ${d.referenceCode}`
    case 'confirmed':
      return `${head} Randevunuz onaylandı. ${d.serviceName}, ${when}. Ref: ${d.referenceCode}`
    case 'cancelled':
      return `${head} ${when} tarihli randevunuz iptal edildi.${contact} Ref: ${d.referenceCode}`
    case 'rescheduled':
      return `${head} Randevunuz ${when} olarak güncellendi. Hizmet: ${d.serviceName}. Ref: ${d.referenceCode}`
  }
}

/** Telefonu loglarda göstermek gerekirse yalnızca son 2 hane: +90*******33 */
export function maskPhone(e164: string): string {
  return e164.length > 4 ? `${e164.slice(0, 3)}${'*'.repeat(Math.max(0, e164.length - 5))}${e164.slice(-2)}` : '***'
}

export type SendResult =
  | { ok: true; messageId: string | null }
  | { ok: false; error: string; retryable: boolean }

export interface SmsProvider {
  /** Kuyruk kaydına yazılan ad (ör. "iletimerkezi"); yapılandırılmamışsa "none" */
  name: string
  configured: boolean
  send(toE164: string, text: string): Promise<SendResult>
}

/** Sağlayıcı seçilip gizli anahtarlar girilene kadar kullanılır: hiçbir şey göndermez. */
export const disabledProvider: SmsProvider = {
  name: 'none',
  configured: false,
  send: async () => ({ ok: false, error: 'provider_not_configured', retryable: false }),
}

export interface NotificationDeps {
  claim: (appointmentId: string | null) => Promise<QueuedNotification[]>
  load: (appointmentId: string) => Promise<{ phone: string; data: MessageData } | null>
  finish: (id: number, status: 'sent' | 'failed' | 'skipped', provider: string, messageId: string | null, error: string | null) => Promise<void>
  provider: SmsProvider
}

export interface ProcessSummary { sent: number; failed: number; skipped: number }

/**
 * Kuyruktaki bildirimleri gönderir. Her kayıt tek başına ele alınır; birinin hatası diğerlerini
 * ve randevuyu etkilemez. Sağlayıcı yoksa kayıt "skipped" olur (panelde görünür, sonra yeniden gönderilebilir).
 */
export async function processNotifications(deps: NotificationDeps, appointmentId: string | null): Promise<ProcessSummary> {
  const summary: ProcessSummary = { sent: 0, failed: 0, skipped: 0 }
  const items = await deps.claim(appointmentId)
  for (const n of items) {
    try {
      if (!deps.provider.configured) {
        await deps.finish(n.id, 'skipped', deps.provider.name, null, 'provider_not_configured')
        summary.skipped++
        continue
      }
      const target = await deps.load(n.appointment_id)
      if (!target) {
        await deps.finish(n.id, 'skipped', deps.provider.name, null, 'appointment_not_found')
        summary.skipped++
        continue
      }
      const result = await deps.provider.send(target.phone, renderMessage(n.kind, target.data))
      if (result.ok) {
        await deps.finish(n.id, 'sent', deps.provider.name, result.messageId, null)
        summary.sent++
      } else {
        await deps.finish(n.id, 'failed', deps.provider.name, null, result.error)
        summary.failed++
      }
    } catch (e) {
      // Ayrıntı (telefon, metin) loglanmaz; yalnızca hata türü.
      await deps.finish(n.id, 'failed', deps.provider.name, null, `exception:${(e as Error)?.name ?? 'Error'}`).catch(() => undefined)
      summary.failed++
    }
  }
  return summary
}
