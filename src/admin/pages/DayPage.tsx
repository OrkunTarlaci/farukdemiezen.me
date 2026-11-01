import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, RotateCw } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { EmptyState, ErrorPanel, Spinner } from '../../components/ui/feedback'
import { fetchAppointmentsForDay, fetchBlockedForDay, fetchSettings, fetchWorkingHours } from '../../lib/api'
import { appointmentIssues, buildDaySchedule, type AppointmentIssue } from '../../lib/schedule'
import { addDays, formatDateLong, formatPrice, isoWeekday, isValidDateString } from '../../lib/time'
import { useLiveAppointments } from '../../lib/useLiveAppointments'
import { useIstanbulToday } from '../../lib/useToday'
import { summarizeAppointments } from '../../lib/stats'
import { useAsync } from '../../lib/useAsync'
import { AppointmentDialog } from '../AppointmentDialog'
import { PageHeader, StatCard } from '../AdminLayout'
import { ScheduleList } from '../ScheduleList'

/** Seçili günün randevuları: özet kartları, dikkat gerektirenler ve kronolojik çizelge. */
export function DayPage() {
  const today = useIstanbulToday()
  const [date, setDate] = useState(today)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Gece yarısı: yönetici "bugün"ü görüyorsa ekran kendiliğinden yeni güne geçer. Başka bir gün
  // seçilmişse seçim korunur. (Önceki günün randevuları sunucuda 00:00'da silinir.)
  const prevToday = useRef(today)
  useEffect(() => {
    if (prevToday.current === today) return
    setDate((d) => (d === prevToday.current ? today : d))
    setSelectedId(null)
    prevToday.current = today
  }, [today])

  // Her yanıt kendi tarihini taşır: ekranda başlıktaki tarihle eşleşmeyen veri asla gösterilmez.
  const day = useAsync(async () => {
    const [appointments, blocked] = await Promise.all([fetchAppointmentsForDay(date), fetchBlockedForDay(date)])
    return { date, appointments, blocked }
  }, [date])
  const config = useAsync(async () => {
    const [settings, workingHours] = await Promise.all([fetchSettings(), fetchWorkingHours()])
    return { settings, workingHours }
  }, [])

  // Canlı güncelleme: Realtime + 30 sn yoklama + sekmeye dönünce yenileme
  useLiveAppointments(day.reload)

  const current = day.data && day.data.date === date ? day.data : undefined
  const wh = config.data?.workingHours.find((w) => w.weekday === isoWeekday(date))
  const rows = useMemo(() => {
    if (!current) return []
    return buildDaySchedule({
      date,
      workingHours: wh,
      intervalMinutes: config.data?.settings.booking_interval_minutes ?? 30,
      appointments: current.appointments,
      blockedPeriods: current.blocked,
    })
  }, [current, config.data, wh, date])

  const issuesById = useMemo(() => {
    const out: Record<string, AppointmentIssue[]> = {}
    if (!current || !config.data) return out
    for (const a of current.appointments) {
      const list = appointmentIssues(a, wh, current.blocked)
      if (list.length) out[a.id] = list
    }
    return out
  }, [current, config.data, wh])

  const counts = useMemo(() => summarizeAppointments(current?.appointments ?? []), [current])
  const attention = Object.keys(issuesById).length

  const selected = current?.appointments.find((a) => a.id === selectedId) ?? null
  const setValidDate = (d: string) => { if (isValidDateString(d)) { setDate(d); setSelectedId(null) } }
  const expired = day.error?.code === 'session_expired'

  return (
    <div>
      <PageHeader
        title="Günlük Randevular"
        description={<>İşletme günü (İstanbul): <strong className="text-fg">{formatDateLong(today)}</strong>. Önceki günlerin randevuları her gece 00:00'da silinir.</>}
      />

      <div className="card mb-5 flex flex-wrap items-center gap-2 p-2" role="group" aria-label="Gün seçimi">
        <Button variant="ghost" onClick={() => setValidDate(addDays(date, -1))} aria-label="Önceki gün" icon={<ChevronLeft className="h-4 w-4" aria-hidden />} />
        <label className="relative inline-flex min-h-[2.75rem] flex-1 items-center justify-center gap-2 rounded-lg px-2 text-sm font-medium sm:flex-none">
          <CalendarDays className="h-4 w-4 text-accent" aria-hidden />
          <span className="sr-only">Tarih seç</span>
          <span aria-live="polite">{formatDateLong(date)}</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setValidDate(e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
        <Button variant="ghost" onClick={() => setValidDate(addDays(date, 1))} aria-label="Sonraki gün" icon={<ChevronRight className="h-4 w-4" aria-hidden />} />
        <div className="ml-auto flex gap-2">
          <Button variant={date === today ? 'primary' : 'secondary'} size="sm" onClick={() => setValidDate(today)}>Bugün</Button>
          <Button variant="secondary" size="sm" onClick={day.reload} aria-label="Listeyi yenile" icon={<RotateCw className={`h-4 w-4 ${day.loading ? 'animate-spin' : ''}`} aria-hidden />} />
        </div>
      </div>

      {current && (
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Aktif randevu" value={counts.active} />
          <StatCard label="Onay bekliyor" value={counts.pending} tone="warning" />
          <StatCard label="Onaylandı" value={counts.confirmed} tone="success" />
          <StatCard label="Tamamlandı" value={counts.completed} tone="accent" />
          <StatCard label="İptal / gelmedi" value={`${counts.cancelled} / ${counts.noShow}`} tone="danger" />
          <StatCard
            label="Beklenen ciro"
            value={formatPrice(counts.expectedMinor) ?? '—'}
            hint={counts.unknownPrice ? `${counts.unknownPrice} randevunun fiyatı kayıtlı değil` : `Gerçekleşen: ${formatPrice(counts.realizedMinor)}`}
          />
        </div>
      )}

      {attention > 0 && (
        <p role="note" className="mb-4 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/[0.08] p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
          <span>{attention} randevu dikkat gerektiriyor (güncel çalışma saatleriyle çakışıyor, onay bekliyor ya da sonucu işaretlenmedi). Aşağıda işaretlidir.</span>
        </p>
      )}

      {day.error && (
        <div className="mb-4">
          <ErrorPanel message={day.error.message} onRetry={expired ? undefined : day.reload} />
          {current && !expired && <p className="mt-2 text-xs text-muted">Aşağıdaki liste son başarılı yüklemeye aittir ve güncel olmayabilir.</p>}
        </div>
      )}
      {config.error && !day.error && (
        <div className="mb-4"><ErrorPanel message={`Çalışma saatleri yüklenemedi: ${config.error.message}`} onRetry={config.reload} /></div>
      )}

      {!current && day.loading && <Spinner label="Randevular yükleniyor…" />}
      {current && rows.length === 0 && <EmptyState>Bu gün kapalı ve kayıtlı randevu yok.</EmptyState>}
      {current && rows.length > 0 && <ScheduleList rows={rows} issuesById={issuesById} onOpen={(a) => setSelectedId(a.id)} />}

      <AppointmentDialog
        appointment={selected}
        issues={selected ? issuesById[selected.id] : undefined}
        onClose={() => setSelectedId(null)}
        onChanged={day.reload}
      />
    </div>
  )
}
