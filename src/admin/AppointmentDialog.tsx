import { AlertTriangle, CalendarClock, Check, MessageCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '../components/ui/Button'
import { Dialog } from '../components/ui/Dialog'
import { ErrorPanel, Spinner, SuccessNote } from '../components/ui/feedback'
import { inputClass } from '../components/ui/Field'
import { siteConfig } from '../config/site'
import {
  cancelAppointments, deleteTestAppointment, markCancelNoticeOpened, fetchRescheduleSlots, rescheduleAppointment, setAppointmentStatus, triggerNotifications, type AdminStatusChange,
} from '../lib/api'
import { MAX_REASON_LENGTH, normalizeReason, whatsAppLink } from '../lib/bulkCancel'
import { adminCancelMessage } from '../lib/cancelMessages'
import { AppError, toAppError } from '../lib/errors'
import { ISSUE_LABELS, type AppointmentIssue } from '../lib/schedule'
import { dateOfInstant, formatDateLong, formatPrice, isValidDateString, timeOfInstant } from '../lib/time'
import type { AppointmentRow } from '../lib/types'
import { useAsync } from '../lib/useAsync'
import { NotificationPanel } from './NotificationPanel'
import { PhoneCell } from './PhoneCell'
import { StatusBadge, TestBadge } from './StatusBadge'

interface Props {
  appointment: AppointmentRow | null
  issues?: AppointmentIssue[]
  onClose: () => void
  /** Değişiklikten sonra listeyi sunucudan yeniden yüklemek için */
  onChanged: () => void
}

const DONE_MESSAGES: Record<AdminStatusChange, string> = {
  confirmed: 'Randevu onaylandı.',
  cancelled: 'Randevu iptal edildi.',
  completed: 'Randevu tamamlandı olarak işaretlendi.',
  no_show: 'Randevu “gelmedi” olarak işaretlendi.',
}

function Reschedule({ appointment, onDone, onCancel }: { appointment: AppointmentRow; onDone: (msg: string) => void; onCancel: () => void }) {
  const [date, setDate] = useState(dateOfInstant(appointment.starts_at))
  const [slot, setSlot] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const slots = useAsync(() => fetchRescheduleSlots(appointment.id, date), [appointment.id, date], isValidDateString(date))

  async function save() {
    if (!slot || saving) return
    setSaving(true); setError(null)
    try {
      await rescheduleAppointment(appointment.id, slot)
      onDone(`Randevu ${formatDateLong(dateOfInstant(slot))} ${timeOfInstant(slot)} saatine taşındı.`)
    } catch (e) {
      setError(toAppError(e).message)
      slots.reload()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-5 rounded-lg border border-line p-4">
      <p className="text-sm font-medium">Yeniden planla</p>
      <p className="mt-1 text-xs text-muted">Yalnızca çalışma saatlerine, kapalı dönemlere ve diğer randevulara uygun saatler listelenir. Süre aynı kalır.</p>
      <label className="mt-3 block text-sm">
        <span className="mb-1.5 block text-muted">Yeni tarih</span>
        <input type="date" value={date} onChange={(e) => { setDate(e.target.value); setSlot(null) }} className={inputClass} />
      </label>
      <div className="mt-3" aria-live="polite">
        {slots.loading && <Spinner label="Uygun saatler yükleniyor…" />}
        {slots.error && <ErrorPanel message={slots.error.message} onRetry={slots.reload} />}
        {slots.data && slots.data.length === 0 && <p className="text-sm text-muted">Bu gün için uygun saat yok.</p>}
        {slots.data && slots.data.length > 0 && (
          <ul className="grid grid-cols-4 gap-2 sm:grid-cols-5" aria-label="Uygun saatler">
            {slots.data.map((iso) => (
              <li key={iso}>
                <button
                  type="button"
                  aria-pressed={slot === iso}
                  onClick={() => setSlot(iso)}
                  className={`flex min-h-[2.5rem] w-full items-center justify-center rounded-md border text-sm tabular-nums ${slot === iso ? 'border-accent bg-accent text-accent-fg' : 'border-line hover:bg-raised'} ${iso === appointment.starts_at ? 'underline decoration-dotted' : ''}`}
                >
                  {timeOfInstant(iso)}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && <div className="mt-3"><ErrorPanel message={error} /></div>}
      <div className="mt-4 flex flex-wrap gap-3">
        <Button loading={saving} disabled={!slot || new Date(slot).getTime() === new Date(appointment.starts_at).getTime()} onClick={save}>
          Bu saate taşı
        </Button>
        <Button variant="ghost" disabled={saving} onClick={onCancel}>Vazgeç</Button>
      </div>
    </div>
  )
}

export function AppointmentDialog({ appointment: a, issues = [], onClose, onChanged }: Props) {
  const [confirmingCancel, setConfirmingCancel] = useState(false)
  const [rescheduling, setRescheduling] = useState(false)
  const [busy, setBusy] = useState<AdminStatusChange | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [smsNote, setSmsNote] = useState<string | null>(null)
  const [smsRefresh, setSmsRefresh] = useState(0)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  // İptal nedeni (isteğe bağlı) ve iptalden sonra müşteriye açılacak WhatsApp mesajı için.
  const [reason, setReason] = useState('')
  const [cancelledNow, setCancelledNow] = useState<{ reason: string | null } | null>(null)
  const [noticeOpened, setNoticeOpened] = useState(false)
  const inFlight = useRef(false)

  useEffect(() => {
    setConfirmingCancel(false); setRescheduling(false); setError(null); setBusy(null); setDone(null)
    setSmsNote(null); setConfirmingDelete(false)
    setReason(''); setCancelledNow(null); setNoticeOpened(false)
  }, [a?.id])

  /**
   * Durum değişikliği veritabanına kaydedildikten SONRA bildirim kuyruğunu işletir. SMS başarısız olsa da
   * randevu durumu değişmez; sonuç "SMS bildirimleri" bölümünde görünür.
   */
  async function notify(id: string) {
    setSmsNote(null)
    try { await triggerNotifications(id) } catch (e) { setSmsNote(toAppError(e).message) }
    setSmsRefresh((k) => k + 1)
  }

  /**
   * İptal / ret. Neden yazıldıysa 0008'deki admin_bulk_cancel ile tek randevu için neden de kaydedilir
   * (Toplu İptal sayfasındaki bildirim listesinde de görünür); yazılmadıysa eski yol kullanılır.
   * Yetki, kilit ve "zaten iptal" denetimi her iki yolda da sunucudadır.
   */
  async function cancel() {
    if (!a || inFlight.current) return
    const r = normalizeReason(reason)
    inFlight.current = true
    setBusy('cancelled'); setError(null); setDone(null)
    try {
      if (r) {
        const [res] = await cancelAppointments([a.id], r)
        if (!res?.ok) throw new AppError(res?.code ?? 'unknown')
      } else {
        await setAppointmentStatus(a.id, 'cancelled')
      }
      setDone(DONE_MESSAGES.cancelled)
      setConfirmingCancel(false)
      setCancelledNow({ reason: r })
      onChanged()
      void notify(a.id)
    } catch (e) {
      setError(toAppError(e).message)
      onChanged()
    } finally {
      inFlight.current = false
      setBusy(null)
    }
  }

  async function markNotice(id: string, hasReason: boolean) {
    setNoticeOpened(true)
    // "Açıldı" işareti yalnızca nedeni kayıtlı iptallerde veritabanına yazılabilir (0008).
    if (hasReason) { try { await markCancelNoticeOpened(id); onChanged() } catch { /* işaret kritik değil */ } }
  }

  async function removeTest() {
    if (!a || deleting) return
    setDeleting(true); setError(null)
    try {
      await deleteTestAppointment(a.id)
      onChanged()
      onClose()
    } catch (e) {
      setError(toAppError(e).message)
    } finally {
      setDeleting(false)
    }
  }

  async function change(status: AdminStatusChange) {
    if (!a || inFlight.current) return
    inFlight.current = true
    setBusy(status); setError(null); setDone(null)
    try {
      await setAppointmentStatus(a.id, status)
      // Başarı yalnızca sunucu onayladıktan sonra gösterilir; liste sunucudan yenilenir.
      setDone(DONE_MESSAGES[status])
      setConfirmingCancel(false)
      onChanged()
      if (status === 'confirmed' || status === 'cancelled') void notify(a.id)
    } catch (e) {
      setError(toAppError(e).message)
      onChanged() // olası eski veri (ör. başka sekmede değiştirilmiş) için listeyi tazele
    } finally {
      inFlight.current = false
      setBusy(null)
    }
  }

  const started = a ? new Date(a.starts_at).getTime() <= Date.now() : false
  const open = a ? a.status === 'pending' || a.status === 'confirmed' : false
  const price = a ? formatPrice(a.price_minor) : null

  const rows: [string, React.ReactNode][] = a
    ? [
        ['Tarih', formatDateLong(dateOfInstant(a.starts_at))],
        ['Saat', `${timeOfInstant(a.starts_at)} – ${timeOfInstant(a.ends_at)}`],
        ['Hizmet', a.service_name ?? a.services?.name ?? '—'],
        ['Fiyat', price ?? <span className="text-muted">Kayıtlı değil</span>],
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

  const disabled = busy !== null
  // Eski iptallerde mesaj yalnızca neden kayıtlıysa gösterilir (yönetici tarafından iptal edildiği bilinir).
  const isCancelled = Boolean(a && (cancelledNow || (a.status === 'cancelled' && a.cancellation_reason)))
  const noticeReason = cancelledNow ? cancelledNow.reason : a?.cancellation_reason ?? null
  const noticeText = a ? adminCancelMessage(a.starts_at, noticeReason, siteConfig.name) : ''
  const noticeLink = a && isCancelled ? whatsAppLink(a.customer_phone, noticeText) : null
  const noticeDone = noticeOpened || Boolean(a?.cancel_notice_opened_at)
  const draftText = a ? adminCancelMessage(a.starts_at, reason, siteConfig.name) : ''

  return (
    <Dialog open={Boolean(a)} onClose={onClose} title={a ? `${a.customer_first_name} ${a.customer_last_name}` : 'Randevu'}>
      {a && (
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-2"><StatusBadge status={a.status} />{a.is_test && <TestBadge />}</div>
          {a.is_test && (
            <p role="note" className="mb-4 rounded-lg border border-dashed border-fg/30 p-3 text-xs text-muted">
              Bu bir test randevusudur (yerel geliştirme ortamından oluşturuldu). Ciroya ve istatistiklere girmez.
            </p>
          )}

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

          {isCancelled && (
            <div className="mt-5 rounded-lg border border-line p-4">
              <p className="text-sm font-medium">Müşteriye WhatsApp mesajı</p>
              <p className="mt-2 whitespace-pre-line rounded-md bg-raised p-3 text-sm text-fg/90">{noticeText}</p>
              {noticeLink ? (
                <a href={noticeLink} target="_blank" rel="noopener noreferrer" onClick={() => { void markNotice(a.id, Boolean(noticeReason)) }}
                  className={`mt-3 inline-flex min-h-[2.75rem] items-center gap-2 rounded-lg border px-4 text-sm font-medium ${noticeDone ? 'border-line text-muted' : 'border-success bg-success/10 text-success hover:bg-success/20'}`}>
                  {noticeDone ? <Check className="h-4 w-4" aria-hidden /> : <MessageCircle className="h-4 w-4" aria-hidden />}
                  {noticeDone ? 'WhatsApp açıldı (tekrar aç)' : 'WhatsApp’ta aç ve gönder'}
                </a>
              ) : (
                <p className="mt-2 text-xs text-muted">Telefon numarası WhatsApp bağlantısı için uygun değil; mesajı kopyalayıp gönderebilirsiniz.</p>
              )}
              <p className="mt-2 text-xs text-muted">WhatsApp mesaj hazır olarak açılır; göndermek için WhatsApp’ta gönder tuşuna basın.</p>
            </div>
          )}

          {!confirmingCancel && !rescheduling && (
            <div className="mt-5 flex flex-wrap gap-2">
              {a.status === 'pending' && (
                <Button loading={busy === 'confirmed'} disabled={disabled} onClick={() => change('confirmed')}>Onayla</Button>
              )}
              {open && started && (
                <>
                  <Button variant="secondary" loading={busy === 'completed'} disabled={disabled} onClick={() => change('completed')}>Tamamlandı</Button>
                  <Button variant="secondary" loading={busy === 'no_show'} disabled={disabled} onClick={() => change('no_show')}>Gelmedi</Button>
                </>
              )}
              {open && !started && (
                <Button variant="secondary" disabled={disabled} onClick={() => setRescheduling(true)} icon={<CalendarClock className="h-4 w-4" aria-hidden />}>
                  Yeniden planla
                </Button>
              )}
              {open && (
                <Button variant="ghost" disabled={disabled} onClick={() => setConfirmingCancel(true)}>
                  {a.status === 'pending' ? 'Reddet / İptal Et' : 'İptal Et'}
                </Button>
              )}
              {a.status === 'completed' && (
                <Button variant="secondary" loading={busy === 'no_show'} disabled={disabled} onClick={() => change('no_show')}>“Gelmedi” olarak düzelt</Button>
              )}
              {a.status === 'no_show' && (
                <Button variant="secondary" loading={busy === 'completed'} disabled={disabled} onClick={() => change('completed')}>“Tamamlandı” olarak düzelt</Button>
              )}
            </div>
          )}

          {smsNote && <p role="status" className="mt-3 text-xs text-warning">{smsNote}</p>}

          <NotificationPanel appointmentId={a.id} refreshKey={smsRefresh} />

          {a.is_test && !confirmingDelete && (
            <div className="mt-5 border-t border-line pt-4">
              <Button variant="ghost" size="sm" onClick={() => setConfirmingDelete(true)}>Test randevusunu sil</Button>
            </div>
          )}
          {a.is_test && confirmingDelete && (
            <div role="alertdialog" aria-label="Silme onayı" className="mt-5 rounded-lg border border-danger/40 bg-danger/[0.08] p-4">
              <p className="text-sm">Bu test randevusu ve SMS kayıtları kalıcı olarak silinsin mi?</p>
              <div className="mt-3 flex flex-wrap gap-3">
                <Button variant="danger" loading={deleting} onClick={removeTest}>Evet, sil</Button>
                <Button variant="ghost" disabled={deleting} onClick={() => setConfirmingDelete(false)}>Vazgeç</Button>
              </div>
            </div>
          )}

          {rescheduling && (
            <Reschedule
              appointment={a}
              onCancel={() => setRescheduling(false)}
              onDone={(msg) => { setRescheduling(false); setDone(msg); onChanged(); void notify(a.id) }}
            />
          )}

          {confirmingCancel && (
            <div role="alertdialog" aria-label="İptal onayı" className="mt-5 rounded-lg border border-danger/40 bg-danger/[0.08] p-4">
              <p className="text-sm">Bu randevuyu {a.status === 'pending' ? 'reddetmek' : 'iptal etmek'} istediğinizden emin misiniz? İptal geri alınamaz ve saat yeniden müsait olur. Sonrasında müşteriye hazır WhatsApp mesajı açabilirsiniz.</p>
              <label className="mt-3 block text-sm">
                <span className="mb-1.5 block text-muted">Nedeni (isteğe bağlı, mesaja eklenir)</span>
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={MAX_REASON_LENGTH} rows={2}
                  placeholder="Örn. O saatte dükkân kapalı olacak" className={inputClass} />
              </label>
              <p className="mt-3 text-xs text-muted">Müşteriye gidecek mesaj:</p>
              <p className="mt-1 whitespace-pre-line rounded-md bg-bg/60 p-3 text-sm text-fg/90">{draftText}</p>
              <div className="mt-3 flex flex-wrap gap-3">
                <Button variant="danger" loading={busy === 'cancelled'} onClick={cancel}>{a.status === 'pending' ? 'Evet, reddet' : 'Evet, iptal et'}</Button>
                <Button variant="ghost" disabled={disabled} onClick={() => setConfirmingCancel(false)}>Vazgeç</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Dialog>
  )
}
