import { DoorClosed, DoorOpen } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button } from '../components/ui/Button'
import { Dialog } from '../components/ui/Dialog'
import { ErrorPanel, Spinner } from '../components/ui/feedback'
import { Field, inputClass } from '../components/ui/Field'
import { cancelInClosure, closeShop, deleteBlockedPeriod, fetchAppointmentsInRange, fetchCancelNoticesBetween, fetchUpcomingBlocked } from '../lib/api'
import { MAX_REASON_LENGTH, normalizeReason } from '../lib/bulkCancel'
import { toAppError } from '../lib/errors'
import { activeClosures, closureRange, closureSpan, DEFAULT_CLOSE_REASON, MAX_CLOSE_DAYS, selectInClosure, type ClosureRange } from '../lib/shopClose'
import { addDays, dateOfInstant, formatDateLong, formatDateShort, isValidDateString, timeOfInstant } from '../lib/time'
import { useAsync } from '../lib/useAsync'
import { useLiveAppointments } from '../lib/useLiveAppointments'
import { useIstanbulToday } from '../lib/useToday'
import { CancelNotices } from './CancelNotices'

const lastDayOf = (range: ClosureRange) => dateOfInstant(new Date(new Date(range.ends_at).getTime() - 1))

function appointmentsIn(range: ClosureRange) {
  return fetchAppointmentsInRange(dateOfInstant(range.starts_at), lastDayOf(range)).then((list) => selectInClosure(list, range))
}

/**
 * Tek düğmeyle dükkanı kapatır: yeni randevu alınmaz, kapanan süredeki randevular iptal edilir ve
 * müşterilere WhatsApp mesajları hazırlanır. Durum veritabanından okunur; her cihazda aynı görünür.
 */
export function ShopCloseCard({ onChanged }: { onChanged: () => void }) {
  const today = useIstanbulToday()
  const [dialog, setDialog] = useState<'close' | 'open' | null>(null)
  const [until, setUntil] = useState(today)
  const [reason, setReason] = useState(DEFAULT_CLOSE_REASON)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)

  const status = useAsync(async () => {
    const closures = activeClosures(await fetchUpcomingBlocked(), new Date())
    const span = closureSpan(closures)
    if (!span) return { closures, span, notices: [], remaining: [] }
    const [notices, remaining] = await Promise.all([fetchCancelNoticesBetween(span.starts_at, span.ends_at), appointmentsIn(span)])
    return { closures, span, notices, remaining }
  }, [])
  useLiveAppointments(status.reload)

  const affected = useAsync(() => appointmentsIn(closureRange(new Date(), until)), [until, dialog], dialog === 'close')
  const cleanReason = normalizeReason(reason)

  async function act(work: () => Promise<unknown>) {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true); setError(null)
    try {
      await work()
      setDialog(null)
    } catch (e) {
      setError(toAppError(e).message)
      setDialog(null)
    } finally {
      inFlight.current = false
      setBusy(false)
      status.reload() // kapalı dönem yazıldıysa iptal hatasında da kapalı görünür
      onChanged()
    }
  }

  const report = (r: { failed: number }) => {
    if (r.failed > 0) setError(`${r.failed} randevu iptal edilemedi. Durumlarını kontrol edin.`)
  }
  const close = () => act(async () => {
    if (cleanReason) report(await closeShop(closureRange(new Date(), until), cleanReason))
  })
  const cancelRemaining = () => act(async () => {
    if (status.data?.span) report(await cancelInClosure(status.data.span, cleanReason ?? DEFAULT_CLOSE_REASON))
  })
  const reopen = () => act(() => Promise.all((status.data?.closures ?? []).map((c) => deleteBlockedPeriod(c.id))))

  const data = status.data
  const closed = Boolean(data?.span)
  const count = affected.data?.length ?? 0

  return (
    <section aria-labelledby="dukkan" className={`card mb-4 p-4 sm:p-5 ${closed ? 'border-danger/50' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="dukkan" className="text-base font-semibold text-fg">{closed ? 'Dükkan kapalı' : 'Dükkan açık'}</h2>
          <p className="mt-0.5 text-sm text-muted">
            {data?.span
              ? `${formatDateLong(lastDayOf(data.span))} sonuna kadar yeni randevu alınmıyor.`
              : 'Kapatırsanız randevular iptal edilir, müşterilere WhatsApp mesajı hazırlanır.'}
          </p>
        </div>
        {data && (closed
          ? <Button variant="secondary" onClick={() => setDialog('open')} icon={<DoorOpen className="h-4 w-4" aria-hidden />}>Dükkanı Aç</Button>
          : <Button variant="danger" onClick={() => { setUntil(today); setReason(DEFAULT_CLOSE_REASON); setError(null); setDialog('close') }} icon={<DoorClosed className="h-4 w-4" aria-hidden />}>Dükkanı Kapat</Button>)}
      </div>

      {status.error && <div className="mt-3"><ErrorPanel message={status.error.message} onRetry={status.reload} /></div>}
      {error && <div className="mt-3"><ErrorPanel message={error} /></div>}

      {data && data.remaining.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/40 p-3">
          <p className="text-sm text-fg">Bu sürede hâlâ {data.remaining.length} açık randevu var.</p>
          <Button variant="danger" size="sm" loading={busy} onClick={() => { void cancelRemaining() }}>Onları da iptal et</Button>
        </div>
      )}

      {data && data.notices.length > 0 && <div className="mt-4"><CancelNotices notices={data.notices} today={today} onChanged={status.reload} showDate /></div>}

      <Dialog open={dialog === 'close'} onClose={() => { if (!busy) setDialog(null) }} title="Dükkanı kapat" sheet>
        <div className="space-y-4">
          <Field id="close-until" label="Ne zamana kadar kapalı?" required hint="Seçilen günün sonuna kadar kapalı kalır. Şu an başlamış randevu iptal edilmez.">
            {(p) => (
              <input {...p} type="date" value={until} min={today} max={addDays(today, MAX_CLOSE_DAYS)}
                onChange={(e) => { if (isValidDateString(e.target.value)) setUntil(e.target.value) }}
                className={inputClass} />
            )}
          </Field>
          <Field id="close-reason" label="Müşteriye yazılacak neden" required>
            {(p) => <input {...p} value={reason} maxLength={MAX_REASON_LENGTH} onChange={(e) => setReason(e.target.value)} className={inputClass} />}
          </Field>

          {affected.loading && <Spinner label="Randevular yükleniyor…" />}
          {affected.error && <ErrorPanel message={affected.error.message} onRetry={affected.reload} />}
          {affected.data && !affected.loading && (
            count === 0
              ? <p className="text-sm text-muted">İptal edilecek randevu yok.</p>
              : (
                <div>
                  <p className="text-sm font-medium text-fg">{count} randevu iptal edilecek. Bu işlem geri alınamaz.</p>
                  <ul className="mt-2 max-h-48 divide-y divide-line overflow-y-auto rounded-lg border border-line text-sm">
                    {affected.data.map((a) => (
                      <li key={a.id} className="flex gap-3 px-3 py-2">
                        <span className="shrink-0 tabular-nums text-muted">{formatDateShort(dateOfInstant(a.starts_at)).split(' ').slice(0, 2).join(' ')} {timeOfInstant(a.starts_at)}</span>
                        <span className="truncate">{a.customer_first_name} {a.customer_last_name}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => setDialog(null)} disabled={busy}>Vazgeç</Button>
            <Button variant="danger" onClick={() => { void close() }} loading={busy} disabled={busy || !cleanReason || !affected.data || affected.loading}>
              {count > 0 ? `Kapat ve ${count} randevuyu iptal et` : 'Dükkanı kapat'}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={dialog === 'open'} onClose={() => { if (!busy) setDialog(null) }} title="Dükkanı aç" sheet>
        <p className="text-sm">Müşteriler yeniden randevu alabilir. İptal edilen randevular geri gelmez.</p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={() => setDialog(null)} disabled={busy}>Vazgeç</Button>
          <Button onClick={() => { void reopen() }} loading={busy} disabled={busy}>Dükkanı aç</Button>
        </div>
      </Dialog>
    </section>
  )
}
