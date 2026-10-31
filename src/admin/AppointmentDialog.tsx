import { AlertTriangle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '../components/ui/Button'
import { Dialog } from '../components/ui/Dialog'
import { ErrorPanel, SuccessNote } from '../components/ui/feedback'
import { setAppointmentStatus } from '../lib/api'
import { toAppError } from '../lib/errors'
import { ISSUE_LABELS, type AppointmentIssue } from '../lib/schedule'
import { dateOfInstant, formatDateLong, timeOfInstant } from '../lib/time'
import type { AppointmentRow } from '../lib/types'
import { PhoneCell } from './PhoneCell'
import { StatusBadge } from './StatusBadge'

interface Props {
  appointment: AppointmentRow | null
  issues?: AppointmentIssue[]
  onClose: () => void
  /** Durum değiştiğinde listeyi sunucudan yeniden yüklemek için */
  onChanged: () => void
}

export function AppointmentDialog({ appointment: a, issues = [], onClose, onChanged }: Props) {
  const [confirmingCancel, setConfirmingCancel] = useState(false)
  const [busy, setBusy] = useState<'confirm' | 'cancel' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const inFlight = useRef(false)

  useEffect(() => { setConfirmingCancel(false); setError(null); setBusy(null); setDone(null) }, [a?.id])

  async function change(status: 'confirmed' | 'cancelled') {
    if (!a || inFlight.current) return
    inFlight.current = true
    setBusy(status === 'confirmed' ? 'confirm' : 'cancel')
    setError(null)
    setDone(null)
    try {
      await setAppointmentStatus(a.id, status)
      // Başarı yalnızca sunucu onayladıktan sonra gösterilir; liste sunucudan yenilenir.
      setDone(status === 'confirmed' ? 'Randevu onaylandı.' : 'Randevu iptal edildi.')
      setConfirmingCancel(false)
      onChanged()
    } catch (e) {
      setError(toAppError(e).message)
      onChanged() // olası eski veri (ör. başka sekmede iptal edilmiş) için listeyi tazele
    } finally {
      inFlight.current = false
      setBusy(null)
    }
  }

  const rows: [string, React.ReactNode][] = a
    ? [
        ['Tarih', formatDateLong(dateOfInstant(a.starts_at))],
        ['Saat', `${timeOfInstant(a.starts_at)} – ${timeOfInstant(a.ends_at)}`],
        ['Hizmet', a.services?.name ?? '—'],
        ['Telefon', <PhoneCell key="p" e164={a.customer_phone} />],
        ['E-posta', a.customer_email ? <span className="break-all">{a.customer_email}</span> : '—'],
        ['Not', a.customer_note ? <span className="whitespace-pre-wrap break-words">{a.customer_note}</span> : '—'],
        ['Referans', <span key="r" className="font-mono">{a.reference_code}</span>],
        ['Oluşturulma', `${formatDateLong(dateOfInstant(a.created_at))} ${timeOfInstant(a.created_at)}`],
        ...(a.cancelled_at
          ? ([['İptal zamanı', `${formatDateLong(dateOfInstant(a.cancelled_at))} ${timeOfInstant(a.cancelled_at)}`]] as [string, string][])
          : []),
      ]
    : []

  return (
    <Dialog open={Boolean(a)} onClose={onClose} title={a ? `${a.customer_first_name} ${a.customer_last_name}` : 'Randevu'}>
      {a && (
        <div>
          <div className="mb-4"><StatusBadge status={a.status} /></div>

          {issues.length > 0 && (
            <div role="note" className="mb-4 rounded-lg border border-warning/40 bg-warning/[0.08] p-3 text-sm">
              <p className="flex items-center gap-2 font-medium text-warning"><AlertTriangle className="h-4 w-4" aria-hidden /> Dikkat</p>
              <ul className="mt-1 list-disc pl-6 text-fg/90">{issues.map((i) => <li key={i}>{ISSUE_LABELS[i]}</li>)}</ul>
            </div>
          )}

          <dl className="overflow-hidden rounded-lg border border-line">
            {rows.map(([k, v]) => (
              <div key={k} className="grid grid-cols-[6.5rem_1fr] items-center gap-3 border-b border-line px-3 py-2 text-sm last:border-b-0">
                <dt className="text-muted">{k}</dt>
                <dd className="min-w-0 text-fg">{v}</dd>
              </div>
            ))}
          </dl>

          <div aria-live="polite" className="mt-4 space-y-3 empty:hidden">
            {error && <ErrorPanel message={error} />}
            {done && <SuccessNote>{done}</SuccessNote>}
          </div>

          {a.status !== 'cancelled' && !confirmingCancel && (
            <div className="mt-5 flex flex-wrap gap-3">
              {a.status === 'pending' && (
                <Button loading={busy === 'confirm'} disabled={busy !== null} onClick={() => change('confirmed')}>Onayla</Button>
              )}
              <Button variant="secondary" disabled={busy !== null} onClick={() => setConfirmingCancel(true)}>Randevuyu İptal Et</Button>
            </div>
          )}

          {confirmingCancel && (
            <div role="alertdialog" aria-label="İptal onayı" className="mt-5 rounded-lg border border-danger/40 bg-danger/[0.08] p-4">
              <p className="text-sm">Bu randevuyu iptal etmek istediğinizden emin misiniz? İptal geri alınamaz ve saat yeniden müsait olur.</p>
              <div className="mt-3 flex flex-wrap gap-3">
                <Button variant="danger" loading={busy === 'cancel'} onClick={() => change('cancelled')}>Evet, iptal et</Button>
                <Button variant="ghost" disabled={busy !== null} onClick={() => setConfirmingCancel(false)}>Vazgeç</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Dialog>
  )
}
