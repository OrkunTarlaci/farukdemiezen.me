import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { EmptyState, ErrorPanel, Spinner, SuccessNote } from '../../components/ui/feedback'
import { Field, inputClass, selectClass } from '../../components/ui/Field'
import { createBlockedPeriod, deleteBlockedPeriod, fetchUpcomingBlocked, fetchWorkingHours, setHourlyAppointments, updateWorkingHours } from '../../lib/api'
import {
  blockedPeriodSchema, blockedRange, workingHoursSchema, type BlockedPeriodFormValues, type WorkingHoursFormValues,
} from '../../lib/adminValidation'
import { toAppError } from '../../lib/errors'
import { hourOptions } from '../../lib/hours'
import { dateOfInstant, formatDateShort, timeOfInstant, todayIstanbul } from '../../lib/time'
import type { BlockedPeriod, WorkingHours } from '../../lib/types'
import { useAsync } from '../../lib/useAsync'
import { PageHeader } from '../AdminLayout'

const DAY_NAMES = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']
const hhmm = (t: string | null) => (t ? t.slice(0, 5) : '')

function DayRow({ wh }: { wh: WorkingHours }) {
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const { register, handleSubmit, watch, formState: { errors, isSubmitting, isDirty }, reset } = useForm<WorkingHoursFormValues>({
    resolver: zodResolver(workingHoursSchema),
    defaultValues: {
      is_closed: wh.is_closed,
      opens_at: hhmm(wh.opens_at),
      closes_at: hhmm(wh.closes_at),
      has_break: Boolean(wh.break_starts_at),
      break_starts_at: hhmm(wh.break_starts_at),
      break_ends_at: hhmm(wh.break_ends_at),
    },
  })
  const closed = watch('is_closed')
  const hasBreak = watch('has_break')
  const id = `wh-${wh.weekday}`

  const submit = handleSubmit(async (v) => {
    setError(null); setSaved(false)
    try {
      const result = await updateWorkingHours(wh.weekday, {
        is_closed: v.is_closed,
        opens_at: v.opens_at,
        closes_at: v.closes_at,
        break_starts_at: !v.is_closed && v.has_break ? v.break_starts_at : null,
        break_ends_at: !v.is_closed && v.has_break ? v.break_ends_at : null,
      })
      await setHourlyAppointments()
      reset({ ...v, has_break: Boolean(result.break_starts_at) })
      setSaved(true)
    } catch (e) {
      setError(toAppError(e).message)
    }
  })

  return (
    <form onSubmit={submit} noValidate aria-labelledby={`${id}-title`} className="card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id={`${id}-title`} className="text-sm">{DAY_NAMES[wh.weekday - 1]}</h3>
        <label className="flex min-h-[2.75rem] items-center gap-2 text-sm text-muted">
          <input type="checkbox" {...register('is_closed')} className="h-4 w-4 accent-[rgb(var(--accent))]" />
          Kapalı
        </label>
      </div>
      {!closed && (
        <div className="mt-2 grid grid-cols-2 gap-3 lg:grid-cols-[1fr_1fr_auto_1fr_1fr] lg:items-end">
          <Field id={`${id}-open`} label="Açılış" error={errors.opens_at?.message}>
            {(p) => <select {...p} {...register('opens_at')} className={selectClass}>{hourOptions(hhmm(wh.opens_at)).map((h) => <option key={h}>{h}</option>)}</select>}
          </Field>
          <Field id={`${id}-close`} label="Kapanış" error={errors.closes_at?.message}>
            {(p) => <select {...p} {...register('closes_at')} className={selectClass}>{hourOptions(hhmm(wh.closes_at)).map((h) => <option key={h}>{h}</option>)}</select>}
          </Field>
          <label className="flex min-h-[2.75rem] items-center gap-2 text-sm text-muted col-span-2 lg:col-span-1">
            <input type="checkbox" {...register('has_break')} className="h-4 w-4 accent-[rgb(var(--accent))]" />
            Mola var
          </label>
          {hasBreak && (
            <>
              <Field id={`${id}-bs`} label="Mola başlangıcı" error={errors.break_starts_at?.message}>
                {(p) => <select {...p} {...register('break_starts_at')} className={selectClass}>{hourOptions(hhmm(wh.break_starts_at)).map((h) => <option key={h}>{h}</option>)}</select>}
              </Field>
              <Field id={`${id}-be`} label="Mola bitişi" error={errors.break_ends_at?.message}>
                {(p) => <select {...p} {...register('break_ends_at')} className={selectClass}>{hourOptions(hhmm(wh.break_ends_at)).map((h) => <option key={h}>{h}</option>)}</select>}
              </Field>
            </>
          )}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-3" aria-live="polite">
        <Button type="submit" size="sm" loading={isSubmitting} disabled={!isDirty}>Kaydet</Button>
        {saved && !isDirty && <span className="text-xs text-success">Kaydedildi</span>}
        {error && <div className="w-full"><ErrorPanel message={error} /></div>}
      </div>
    </form>
  )
}

function BlockedForm({ onSaved, onCancel }: { onSaved: () => void; onCancel: () => void }) {
  const today = todayIstanbul()
  const [error, setError] = useState<string | null>(null)
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<BlockedPeriodFormValues>({
    resolver: zodResolver(blockedPeriodSchema),
    defaultValues: { start_date: today, start_time: '12:00', end_date: today, end_time: '14:00', all_day: true, reason: '' },
  })
  const allDay = watch('all_day')

  const submit = handleSubmit(async (v) => {
    setError(null)
    const range = blockedRange(v)
    if (!range) return
    try {
      await createBlockedPeriod({ ...range, reason: v.reason || null })
      onSaved()
    } catch (e) {
      setError(toAppError(e).message)
    }
  })

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <label className="flex min-h-[2.75rem] items-center gap-3 text-sm">
        <input type="checkbox" {...register('all_day')} className="h-4 w-4 accent-[rgb(var(--accent))]" />
        Tüm gün (bitiş günü dahil)
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="bp-sd" label="Başlangıç tarihi" error={errors.start_date?.message}>
          {(p) => <input {...p} type="date" {...register('start_date')} className={inputClass} />}
        </Field>
        {!allDay && (
          <Field id="bp-st" label="Başlangıç saati" error={errors.start_time?.message}>
            {(p) => <input {...p} type="time" step={300} {...register('start_time')} className={inputClass} />}
          </Field>
        )}
        <Field id="bp-ed" label="Bitiş tarihi" error={errors.end_date?.message}>
          {(p) => <input {...p} type="date" {...register('end_date')} className={inputClass} />}
        </Field>
        {!allDay && (
          <Field id="bp-et" label="Bitiş saati" error={errors.end_time?.message}>
            {(p) => <input {...p} type="time" step={300} {...register('end_time')} className={inputClass} />}
          </Field>
        )}
      </div>
      <Field id="bp-reason" label="Açıklama" optionalLabel hint="Yalnızca yönetim panelinde görünür." error={errors.reason?.message}>
        {(p) => <input {...p} {...register('reason')} placeholder="örn. İzin" className={inputClass} />}
      </Field>
      <p className="text-xs text-muted">Saatler İstanbul saatidir. Bu dönemdeki saatler müşterilere kapanır; mevcut randevular iptal edilmez, gün görünümünde uyarı olarak işaretlenir.</p>
      {error && <ErrorPanel message={error} />}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" loading={isSubmitting}>Kapalı dönemi ekle</Button>
        <Button variant="ghost" onClick={onCancel} disabled={isSubmitting}>Vazgeç</Button>
      </div>
    </form>
  )
}

function formatRange(b: BlockedPeriod) {
  const s = new Date(b.starts_at)
  const e = new Date(b.ends_at)
  const sd = formatDateShort(dateOfInstant(s))
  const lastMoment = new Date(e.getTime() - 1)
  const allDay = timeOfInstant(s) === '00:00' && timeOfInstant(e) === '00:00'
  if (allDay) {
    const ed = formatDateShort(dateOfInstant(lastMoment))
    return sd === ed ? `${sd} · tüm gün` : `${sd} – ${ed} · tüm gün`
  }
  const ed = dateOfInstant(e) === dateOfInstant(s) ? '' : `${formatDateShort(dateOfInstant(e))} `
  return `${sd} ${timeOfInstant(s)} – ${ed}${timeOfInstant(e)}`
}

export function HoursPage() {
  const hours = useAsync(fetchWorkingHours, [])
  const blocked = useAsync(fetchUpcomingBlocked, [])
  const [adding, setAdding] = useState(false)
  const [toDelete, setToDelete] = useState<BlockedPeriod | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const inFlight = useRef(false)

  async function confirmDelete() {
    if (!toDelete || inFlight.current) return
    inFlight.current = true
    setDeleting(true); setDeleteError(null)
    try {
      await deleteBlockedPeriod(toDelete.id)
      setToDelete(null)
      setNotice('Kapalı dönem silindi; saatler yeniden müşterilere açıldı.')
      blocked.reload()
    } catch (e) {
      setDeleteError(toAppError(e).message)
    } finally {
      inFlight.current = false
      setDeleting(false)
    }
  }

  return (
    <div>
      <PageHeader title="Çalışma Saatleri" description="Randevular saat başı verilir: 11:00, 12:00 gibi. Son randevu kapanıştan önce biter; son randevu 19:00 olsun istiyorsanız kapanışı 20:00 seçin. Mevcut randevular değişmez." />

      <section aria-labelledby="haftalik" className="mb-10">
        <h2 id="haftalik" className="mb-3 text-base">Haftalık program</h2>
        {hours.loading && <Spinner label="Çalışma saatleri yükleniyor…" />}
        {hours.error && <ErrorPanel message={hours.error.message} onRetry={hours.reload} />}
        {hours.data && hours.data.length === 0 && <EmptyState>Çalışma saatleri tanımlı değil (seed.sql çalıştırılmamış olabilir).</EmptyState>}
        {hours.data && (
          <div className="space-y-3">
            {hours.data.map((wh) => <DayRow key={wh.weekday} wh={wh} />)}
          </div>
        )}
      </section>

      <section aria-labelledby="kapali-donemler">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="kapali-donemler" className="text-base">Tatil ve kapalı dönemler</h2>
            <p className="text-sm text-muted">Bitmemiş dönemler listelenir.</p>
          </div>
          <Button size="sm" onClick={() => { setNotice(null); setAdding(true) }} icon={<Plus className="h-4 w-4" aria-hidden />}>Kapalı dönem ekle</Button>
        </div>
        <div aria-live="polite" className="mb-3 empty:hidden">{notice && <SuccessNote>{notice}</SuccessNote>}</div>
        {blocked.loading && <Spinner label="Kapalı dönemler yükleniyor…" />}
        {blocked.error && <ErrorPanel message={blocked.error.message} onRetry={blocked.reload} />}
        {blocked.data && blocked.data.length === 0 && <EmptyState>Planlanmış kapalı dönem yok.</EmptyState>}
        {blocked.data && blocked.data.length > 0 && (
          <ul className="space-y-2">
            {blocked.data.map((b) => (
              <li key={b.id} className="card flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-fg">{formatRange(b)}</p>
                  {b.reason && <p className="truncate text-xs text-muted">{b.reason}</p>}
                </div>
                <Button variant="ghost" size="sm" onClick={() => { setDeleteError(null); setToDelete(b) }} aria-label={`${formatRange(b)} kapalı dönemini sil`} icon={<Trash2 className="h-4 w-4" aria-hidden />}>
                  Sil
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Dialog open={adding} onClose={() => setAdding(false)} title="Kapalı dönem ekle">
        {adding && <BlockedForm onCancel={() => setAdding(false)} onSaved={() => { setAdding(false); setNotice('Kapalı dönem eklendi.'); blocked.reload() }} />}
      </Dialog>

      <Dialog open={toDelete !== null} onClose={() => setToDelete(null)} title="Kapalı dönemi sil">
        {toDelete && (
          <div className="space-y-4">
            <p className="text-sm">{formatRange(toDelete)} dönemi silinsin mi? Bu saatler yeniden müşterilere açılır.</p>
            {deleteError && <ErrorPanel message={deleteError} />}
            <div className="flex flex-wrap gap-3">
              <Button variant="danger" loading={deleting} onClick={confirmDelete}>Evet, sil</Button>
              <Button variant="ghost" disabled={deleting} onClick={() => setToDelete(null)}>Vazgeç</Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  )
}
