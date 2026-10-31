import { MessageSquare, RotateCw } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../components/ui/Button'
import { ErrorPanel, Spinner } from '../components/ui/feedback'
import { fetchNotificationLogs, requeueNotification, triggerNotifications } from '../lib/api'
import { toAppError } from '../lib/errors'
import { dateOfInstant, formatDateShort, timeOfInstant } from '../lib/time'
import type { NotificationKind, NotificationLog, NotificationStatus } from '../lib/types'
import { useAsync } from '../lib/useAsync'

const KIND_LABELS: Record<NotificationKind, string> = {
  booking_received: 'Talep alındı',
  confirmed: 'Onaylandı',
  cancelled: 'İptal edildi',
  rescheduled: 'Yeniden planlandı',
}

const STATUS: Record<NotificationStatus, { label: string; cls: string }> = {
  pending: { label: 'Sırada', cls: 'border-line text-muted' },
  sending: { label: 'Gönderiliyor', cls: 'border-line text-muted' },
  sent: { label: 'Gönderildi', cls: 'border-success/40 text-success' },
  failed: { label: 'Başarısız', cls: 'border-danger/40 text-danger' },
  skipped: { label: 'Gönderilmedi', cls: 'border-warning/40 text-warning' },
}

/** Hata kodlarının yönetici için açıklaması (sağlayıcı anahtarı veya telefon gösterilmez). */
function explain(log: NotificationLog): string | null {
  if (log.status === 'skipped' && log.error_code === 'provider_not_configured') return 'SMS sağlayıcısı henüz yapılandırılmadı.'
  if (log.status === 'skipped' && log.error_code === 'appointment_not_found') return 'Randevu bulunamadı.'
  if (log.status === 'failed') return `Sağlayıcı hatası${log.error_code ? ` (${log.error_code})` : ''}.`
  return null
}

/** Randevunun SMS bildirimleri: durum, açıklama ve başarısız/atlanmış olanı yeniden gönderme. */
export function NotificationPanel({ appointmentId, refreshKey }: { appointmentId: string; refreshKey: number }) {
  const logs = useAsync(() => fetchNotificationLogs(appointmentId), [appointmentId, refreshKey])
  const [busy, setBusy] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function resend(id: number) {
    if (busy !== null) return
    setBusy(id); setError(null)
    try {
      await requeueNotification(id)
      await triggerNotifications(appointmentId)
    } catch (e) {
      setError(toAppError(e).message)
    } finally {
      setBusy(null)
      logs.reload()
    }
  }

  return (
    <section aria-labelledby={`sms-${appointmentId}`} className="mt-5">
      <h3 id={`sms-${appointmentId}`} className="flex items-center gap-2 text-sm text-muted">
        <MessageSquare className="h-4 w-4" aria-hidden /> SMS bildirimleri
      </h3>
      {logs.loading && <Spinner label="SMS kayıtları yükleniyor…" />}
      {logs.error && <div className="mt-2"><ErrorPanel message={logs.error.message} onRetry={logs.reload} /></div>}
      {logs.data && logs.data.length === 0 && <p className="mt-2 text-sm text-subtle">Bu randevu için SMS kaydı yok.</p>}
      {logs.data && logs.data.length > 0 && (
        <ul className="mt-2 divide-y divide-line overflow-hidden rounded-lg border border-line">
          {logs.data.map((l) => {
            const st = STATUS[l.status]
            const note = explain(l)
            const when = l.sent_at ?? l.created_at
            return (
              <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 text-fg">
                  {KIND_LABELS[l.kind]}
                  <span className="ml-2 text-xs text-subtle">{formatDateShort(dateOfInstant(when)).split(' ').slice(0, 2).join(' ')} {timeOfInstant(when)}</span>
                  {note && <span className="block text-xs text-muted">{note}</span>}
                </span>
                <span className={`rounded-md border px-1.5 py-0.5 text-xs ${st.cls}`}>{st.label}</span>
                {(l.status === 'failed' || l.status === 'skipped') && (
                  <Button variant="ghost" size="sm" loading={busy === l.id} disabled={busy !== null} onClick={() => resend(l.id)}
                    icon={<RotateCw className="h-3.5 w-3.5" aria-hidden />} aria-label={`${KIND_LABELS[l.kind]} SMS'ini yeniden gönder`}>
                    Yeniden gönder
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {error && <div className="mt-2"><ErrorPanel message={error} /></div>}
    </section>
  )
}
