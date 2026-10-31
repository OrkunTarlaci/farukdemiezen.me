import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, RotateCw } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { EmptyState, ErrorPanel, Spinner } from '../../components/ui/feedback'
import { fetchAppointmentsForDay, fetchBlockedForDay, fetchSettings, fetchWorkingHours } from '../../lib/api'
import { appointmentIssues, buildDaySchedule, type AppointmentIssue } from '../../lib/schedule'
import { getSupabase } from '../../lib/supabase'
import { addDays, formatDateLong, isoWeekday, isValidDateString, todayIstanbul } from '../../lib/time'
import { useAsync } from '../../lib/useAsync'
import { AppointmentDialog } from '../AppointmentDialog'
import { PageHeader, StatCard } from '../AdminLayout'
import { ScheduleList } from '../ScheduleList'

const REFRESH_MS = 30_000

/** Seçili günün randevuları: özet kartları, dikkat gerektirenler ve kronolojik çizelge. */
export function DayPage() {
  const [date, setDate] = useState(todayIstanbul())
  const [selectedId, setSelectedId] = useState<string | null>(null)

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
  const reloadRef = useRef(day.reload)
  reloadRef.current = day.reload
  useEffect(() => {
    const tick = () => { if (document.visibilityState === 'visible') reloadRef.current() }
    const timer = setInterval(tick, REFRESH_MS)
    document.addEventListener('visibilitychange', tick)
    let cleanup: (() => void) | null = null
    let cancelled = false
    void getSupabase().then((supabase) => {
      if (!supabase || cancelled) return
      const channel = supabase
        .channel('appointments-live')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, () => reloadRef.current())
        .subscribe()
      cleanup = () => { void supabase.removeChannel(channel) }
    })
    return () => {
      cancelled = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', tick)
      cleanup?.()
    }
  }, [])

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

  const counts = useMemo(() => {
    const list = current?.appointments ?? []
    return {
      active: list.filter((a) => a.status !== 'cancelled').length,
      confirmed: list.filter((a) => a.status === 'confirmed').length,
      pending: list.filter((a) => a.status === 'pending').length,
      cancelled: list.filter((a) => a.status === 'cancelled').length,
    }
  }, [current])
  const attention = Object.keys(issuesById).length

  const selected = current?.appointments.find((a) => a.id === selectedId) ?? null
  const today = todayIstanbul()
  const setValidDate = (d: string) => { if (isValidDateString(d)) { setDate(d); setSelectedId(null) } }
  const expired = day.error?.code === 'session_expired'

  return (
    <div>
      <PageHeader title="Randevular" description="Günlük randevularınızı yönetin." />

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
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Aktif randevu" value={counts.active} />
          <StatCard label="Onaylandı" value={counts.confirmed} tone="success" />
          <StatCard label="Onay bekliyor" value={counts.pending} tone="warning" />
          <StatCard label="İptal" value={counts.cancelled} tone="danger" />
        </div>
      )}

      {attention > 0 && (
        <p role="note" className="mb-4 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/[0.08] p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
          <span>{attention} randevu dikkat gerektiriyor (güncel çalışma saatleriyle çakışıyor veya saati geçtiği hâlde onay bekliyor). Aşağıda işaretlidir.</span>
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
