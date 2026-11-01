import { Check, Copy, MessageCircle, RotateCw, XCircle } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { EmptyState, ErrorPanel, Notice, Spinner, SuccessNote } from '../../components/ui/feedback'
import { Field, inputClass } from '../../components/ui/Field'
import { cancelAppointments, fetchAppointmentsForDay, fetchCancelNotices, markCancelNoticeOpened, type CancelNotice } from '../../lib/api'
import { buildCancelMessage, MAX_REASON_LENGTH, normalizeReason, selectFromTime, whatsAppLink } from '../../lib/bulkCancel'
import { AppError, toAppError } from '../../lib/errors'
import { formatTrPhone } from '../../lib/phone'
import { dateOfInstant, formatDateLong, isValidDateString, minutesToHhmm, hhmmToMinutes, timeOfInstant } from '../../lib/time'
import type { AppointmentRow } from '../../lib/types'
import { useAsync } from '../../lib/useAsync'
import { useLiveAppointments } from '../../lib/useLiveAppointments'
import { useIstanbulToday } from '../../lib/useToday'
import { PageHeader } from '../AdminLayout'
import { StatusBadge, TestBadge } from '../StatusBadge'

/** Bugün için varsayılan başlangıç: şu anki İstanbul saati, yarım saate yuvarlanmış (aşağı). */
function defaultFromTime(): string {
  const m = hhmmToMinutes(timeOfInstant(new Date()))
  return minutesToHhmm(Math.floor(m / 30) * 30)
}

/** Son çalıştırmanın özeti (yalnızca bilgi). Kalıcı sonuç veritabanındadır ve aşağıdaki listeden okunur. */
interface LastRun {
  cancelled: number
  failed: { appointment: AppointmentRow; error: string }[]
}

/**
 * Toplu Randevu İptali: gün + başlangıç saati seçilir, etkilenecek randevular gösterilir, onaydan sonra
 * sunucuda tek işlemde, neden ile birlikte iptal edilir (0008). İptal edilenler ve WhatsApp bildirim
 * durumu veritabanından okunur; bilgisayarda yapılan iptal telefonda da aynı görünür.
 */
export function BulkCancelPage() {
  const today = useIstanbulToday()
  const [date, setDate] = useState(today)
  const [fromTime, setFromTime] = useState(defaultFromTime)
  const [reason, setReason] = useState('')
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [confirming, setConfirming] = useState(false)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastRun, setLastRun] = useState<LastRun | null>(null)
  const inFlight = useRef(false)

  const day = useAsync(async () => {
    const [appointments, notices] = await Promise.all([fetchAppointmentsForDay(date), fetchCancelNotices(date)])
    return { date, appointments, notices }
  }, [date])
  useLiveAppointments(day.reload) // başka cihazdaki iptal ve "WhatsApp açıldı" işaretleri
  const current = day.data && day.data.date === date ? day.data : undefined
  const validTime = /^\d{2}:\d{2}$/.test(fromTime)

  const candidates = useMemo(
    () => (current && validTime ? selectFromTime(current.appointments, date, fromTime) : []),
    [current, date, fromTime, validTime],
  )
  // Gün veya saat değişince elle çıkarılanlar sıfırlanır: her seçim baştan "hepsi" ile başlar.
  useEffect(() => { setExcluded(new Set()); setLastRun(null) }, [date, fromTime])

  const selected = candidates.filter((a) => !excluded.has(a.id))
  const cleanReason = normalizeReason(reason)
  const message = buildCancelMessage(reason, date, today)
  const canSubmit = selected.length > 0 && cleanReason !== null && !running && !day.loading

  function toggle(id: string) {
    setExcluded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function run() {
    if (inFlight.current || !cleanReason) return
    inFlight.current = true
    setRunning(true); setError(null)
    const targets = selected
    try {
      const results = await cancelAppointments(targets.map((a) => a.id), cleanReason)
      const byId = new Map(targets.map((a) => [a.id, a]))
      setLastRun({
        cancelled: results.filter((r) => r.ok).length,
        failed: results.filter((r) => !r.ok && byId.has(r.id))
          .map((r) => ({ appointment: byId.get(r.id)!, error: new AppError(r.code ?? 'unknown').message })),
      })
      setConfirming(false)
      setReason('')
    } catch (e) {
      setError(toAppError(e).message)
      setConfirming(false)
    } finally {
      inFlight.current = false
      setRunning(false)
      day.reload() // sonuç her zaman veritabanından yeniden okunur
    }
  }

  return (
    <div>
      <PageHeader
        title="Toplu Randevu İptali"
        description="Bir günün belirli saatinden sonraki randevularını tek seferde iptal edin. İptal edilen müşterilere WhatsApp mesajı hazırlanır."
      />

      <div className="card mb-5 grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
        <Field id="bulk-date" label="Tarih" required>
          {(p) => (
            <input {...p} type="date" value={date} min={today}
              onChange={(e) => { if (isValidDateString(e.target.value)) setDate(e.target.value) }}
              className={inputClass} />
          )}
        </Field>
        <Field id="bulk-from" label="Bu saatten itibaren" required hint="Bu saatte ve sonrasında başlayan randevular listelenir.">
          {(p) => <input {...p} type="time" step={300} value={fromTime} onChange={(e) => setFromTime(e.target.value)} className={inputClass} />}
        </Field>
        <div className="sm:col-span-2">
          <Field id="bulk-reason" label="İptal nedeni" required hint="Bir kez yazın; bütün müşterilere aynı neden gider.">
            {(p) => (
              <textarea {...p} rows={2} maxLength={MAX_REASON_LENGTH} value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Örn. Acil bir sağlık durumu nedeniyle"
                className={inputClass} />
            )}
          </Field>
        </div>
      </div>

      {day.error && <div className="mb-4"><ErrorPanel message={day.error.message} onRetry={day.reload} /></div>}
      {!current && day.loading && <Spinner label="Randevular yükleniyor…" />}

      {lastRun && (
        <div className="mb-4 space-y-2">
          {lastRun.cancelled > 0 && <SuccessNote>{lastRun.cancelled} randevu iptal edildi ve kaydedildi.</SuccessNote>}
          {lastRun.failed.length > 0 && (
            <>
              <ErrorPanel message={`${lastRun.failed.length} randevu iptal edilmedi; durumları değişmedi ve bunlara mesaj hazırlanmadı.`} />
              <ul className="space-y-1 text-sm">
                {lastRun.failed.map(({ appointment: a, error: err }) => (
                  <li key={a.id}><span className="tabular-nums">{timeOfInstant(a.starts_at)}</span> · {a.customer_first_name} {a.customer_last_name}: <span className="text-muted">{err}</span></li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {current && <Notices notices={current.notices} today={today} onChanged={day.reload} />}

      {current && (
        <section aria-labelledby="bulk-list-title" className="mb-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 id="bulk-list-title" className="text-base font-semibold">
              {formatDateLong(date)}{validTime ? `, ${fromTime} ve sonrası` : ''}
            </h2>
            <Button variant="secondary" size="sm" onClick={day.reload} aria-label="Listeyi yenile"
              icon={<RotateCw className={`h-4 w-4 ${day.loading ? 'animate-spin' : ''}`} aria-hidden />} />
          </div>

          {candidates.length === 0 ? (
            <EmptyState>Bu saatten sonra iptal edilecek (onay bekleyen veya onaylı) randevu yok.</EmptyState>
          ) : (
            <ul className="card divide-y divide-line">
              {candidates.map((a) => {
                const on = !excluded.has(a.id)
                return (
                  <li key={a.id}>
                    <label className="flex cursor-pointer items-center gap-3 p-3 sm:p-4">
                      <input type="checkbox" checked={on} onChange={() => toggle(a.id)} className="h-5 w-5 shrink-0 accent-[rgb(var(--accent))]" />
                      <span className="w-12 shrink-0 font-semibold tabular-nums">{timeOfInstant(a.starts_at)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {a.customer_first_name} {a.customer_last_name} {a.is_test && <TestBadge />}
                        </span>
                        <span className="block truncate text-xs text-muted">
                          {formatTrPhone(a.customer_phone)} · {a.service_name ?? a.services?.name ?? 'Hizmet'}
                        </span>
                      </span>
                      <StatusBadge status={a.status} compact />
                    </label>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      )}

      {candidates.length > 0 && (
        <div className="card mb-5 p-4 sm:p-5">
          <p className="mb-2 text-sm font-medium">Müşterilere gidecek mesaj</p>
          <p className="whitespace-pre-line rounded-lg border border-line bg-bg p-3 text-sm">
            {cleanReason ? message : 'İptal nedenini yazınca mesaj burada görünür.'}
          </p>
          <p className="mt-2 text-xs text-muted">Mesajda müşterinin adı ve randevu saati yer almaz.</p>
        </div>
      )}

      {error && <div className="mb-4"><ErrorPanel message={error} /></div>}

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="danger" disabled={!canSubmit} onClick={() => setConfirming(true)} icon={<XCircle className="h-4 w-4" aria-hidden />}>
          {selected.length > 0 ? `${selected.length} randevuyu iptal et` : 'Randevuları iptal et'}
        </Button>
        {candidates.length > 0 && !cleanReason && <span className="text-sm text-muted">Devam etmek için iptal nedenini yazın.</span>}
      </div>

      <Dialog open={confirming} onClose={() => { if (!running) setConfirming(false) }} title="Toplu iptali onaylayın">
        <p className="text-sm">
          <strong>{formatDateLong(date)}</strong> günü <strong>{selected.length}</strong> randevu iptal edilecek. Bu işlem geri alınamaz.
        </p>
        <p className="mt-3 text-sm text-muted">İptal nedeni: {cleanReason}</p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirming(false)} disabled={running}>Vazgeç</Button>
          <Button variant="danger" onClick={run} loading={running} disabled={running}>Evet, {selected.length} randevuyu iptal et</Button>
        </div>
      </Dialog>
    </div>
  )
}

/**
 * Seçili günün toplu iptal edilen randevuları (veritabanından). Mesaj, kayıtlı neden ile üretilir;
 * "WhatsApp'ta aç" işareti de veritabanına yazılır, böylece hangi müşteriye yazıldığı her cihazda görünür.
 */
function Notices({ notices, today, onChanged }: { notices: CancelNotice[]; today: string; onChanged: () => void }) {
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
                <span className="block truncate text-xs text-muted">{formatTrPhone(n.customer_phone)} · Neden: {n.cancellation_reason}</span>
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
