import { Check, Copy, MessageCircle } from 'lucide-react'
import { useState } from 'react'
import { ErrorPanel, Notice } from '../components/ui/feedback'
import { markCancelNoticeOpened, type CancelNotice } from '../lib/api'
import { buildCancelMessage, whatsAppLink } from '../lib/bulkCancel'
import { toAppError } from '../lib/errors'
import { formatTrPhone } from '../lib/phone'
import { dateOfInstant, formatDateShort, timeOfInstant } from '../lib/time'

/**
 * Toplu iptal edilen randevular (veritabanından). Mesaj, kayıtlı neden ile üretilir;
 * "WhatsApp'ta aç" işareti de veritabanına yazılır, böylece hangi müşteriye yazıldığı her cihazda görünür.
 */
export function CancelNotices({ notices, today, onChanged, showDate = false }: { notices: CancelNotice[]; today: string; onChanged: () => void; showDate?: boolean }) {
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [markError, setMarkError] = useState<string | null>(null)
  if (notices.length === 0) return null
  const openedCount = notices.filter((n) => n.cancel_notice_opened_at).length

  async function mark(id: string) {
    setMarkError(null)
    try { await markCancelNoticeOpened(id); onChanged() } catch (e) { setMarkError(toAppError(e).message) }
  }
  async function copy(n: CancelNotice, text: string) {
    try { await navigator.clipboard.writeText(text); setCopiedId(n.id); setTimeout(() => setCopiedId(null), 2000) } catch { /* kopyalanamadı */ }
  }

  return (
    <section aria-labelledby="notice-title" className="mb-6">
      <h2 id="notice-title" className="mb-2 text-base font-semibold">İptal edilenler: WhatsApp bildirimi</h2>
      <Notice>
        Normal WhatsApp hesabından otomatik mesaj göndermenin resmî bir yolu yok. <strong>"WhatsApp'ta aç"</strong> sohbeti mesaj
        yazılmış olarak açar; mesajı <strong>siz gönderirsiniz</strong>. Bu liste veritabanından gelir; telefondan da aynı görünür.
      </Notice>
      {markError && <div className="mt-3"><ErrorPanel message={markError} /></div>}
      <p className="mb-2 mt-4 text-sm text-muted">{openedCount} / {notices.length} müşteri için sohbet açıldı</p>
      <ul className="card divide-y divide-line">
        {notices.map((n) => {
          const text = buildCancelMessage(n.cancellation_reason, dateOfInstant(n.starts_at), today)
          const link = whatsAppLink(n.customer_phone, text)
          const opened = Boolean(n.cancel_notice_opened_at)
          return (
            <li key={n.id} className="flex flex-wrap items-center gap-3 p-3 sm:p-4">
              <span className="w-12 shrink-0 font-semibold tabular-nums">{timeOfInstant(n.starts_at)}</span>
              <span className="min-w-[10rem] flex-1">
                <span className="block truncate text-sm font-medium">{n.customer_first_name} {n.customer_last_name}</span>
                <span className="block truncate text-xs text-muted">{showDate && `${formatDateShort(dateOfInstant(n.starts_at))} · `}{formatTrPhone(n.customer_phone)} · Neden: {n.cancellation_reason}</span>
              </span>
              <button type="button" onClick={() => copy(n, text)} aria-label="Mesajı kopyala"
                className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-muted hover:bg-raised hover:text-fg">
                {copiedId === n.id ? <Check className="h-4 w-4 text-success" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
              </button>
              {link ? (
                <a href={link} target="_blank" rel="noopener noreferrer" onClick={() => { void mark(n.id) }}
                  className={`inline-flex min-h-[2.75rem] items-center gap-2 rounded-lg border px-4 text-sm font-medium ${opened ? 'border-line text-muted' : 'border-success bg-success/10 text-success hover:bg-success/20'}`}>
                  {opened ? <Check className="h-4 w-4" aria-hidden /> : <MessageCircle className="h-4 w-4" aria-hidden />}
                  {opened ? 'Açıldı' : "WhatsApp'ta aç"}
                </a>
              ) : (
                <span className="text-xs text-danger">Numara WhatsApp için uygun değil</span>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
