import { AlertTriangle, ChevronLeft, ChevronRight, RotateCw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { ErrorPanel, Spinner } from '../../components/ui/feedback'
import { fetchAppointmentsInRange, fetchBlockedInRange, fetchWorkingHours } from '../../lib/api'
import { summarizeWorkingHours } from '../../lib/hours'
import { appointmentIssues, type AppointmentIssue } from '../../lib/schedule'
import { addDays, dateOfInstant, formatDateShort, isoWeekday, timeOfInstant, todayIstanbul, WEEKDAY_SHORT } from '../../lib/time'
import { useIstanbulToday } from '../../lib/useToday'
import type { AppointmentRow } from '../../lib/types'
import { useAsync } from '../../lib/useAsync'
import { useLiveAppointments } from '../../lib/useLiveAppointments'
import { AppointmentDialog } from '../AppointmentDialog'
import { PageHeader } from '../AdminLayout'
import { StatusBadge, TestBadge } from '../StatusBadge'

const mondayOf = (date: string) => addDays(date, 1 - isoWeekday(date))

/** Haftalık görünüm (Pazartesi–Pazar, Istanbul günleri). Müsaitlik hesaplanmaz; yalnızca kayıtlar gösterilir. */
export function WeekPage() {
  const [weekStart, setWeekStart] = useState(() => mondayOf(todayIstanbul()))
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const weekEnd = addDays(weekStart, 6)
  const today = useIstanbulToday()

  const week = useAsync(async () => {
    const [appointments, blocked] = await Promise.all([fetchAppointmentsInRange(weekStart, weekEnd), fetchBlockedInRange(weekStart, weekEnd)])
    return { weekStart, appointments, blocked }
  }, [weekStart, weekEnd])
  const hours = useAsync(fetchWorkingHours, [])
  useLiveAppointments(week.reload) // başka cihazdaki değişiklikler (ör. telefondan iptal)

  const current = week.data && week.data.weekStart === weekStart ? week.data : undefined
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  const { byDay, issuesById } = useMemo(() => {
    const byDay: Record<string, AppointmentRow[]> = {}
    const issuesById: Record<string, AppointmentIssue[]> = {}
    for (const a of current?.appointments ?? []) {
      const d = dateOfInstant(a.starts_at)
      ;(byDay[d] ??= []).push(a)
      if (hours.data) {
        const list = appointmentIssues(a, hours.data.find((w) => w.weekday === isoWeekday(d)), current?.blocked ?? [])
        if (list.length) issuesById[a.id] = list
      }
    }
    return { byDay, issuesById }
  }, [current, hours.data])

  const activeTotal = current?.appointments.filter((a) => a.status !== 'cancelled').length ?? 0
  const selected = current?.appointments.find((a) => a.id === selectedId) ?? null

  return (
    <div>
      <PageHeader
        title="Takvim"
        description={current ? `${formatDateShort(weekStart)} – ${formatDateShort(weekEnd)} · ${activeTotal} aktif randevu` : 'Haftalık görünüm'}
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Önceki hafta" icon={<ChevronLeft className="h-4 w-4" aria-hidden />} />
            <Button variant={weekStart === mondayOf(today) ? 'primary' : 'secondary'} size="sm" onClick={() => setWeekStart(mondayOf(today))}>Bu hafta</Button>
            <Button variant="secondary" size="sm" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Sonraki hafta" icon={<ChevronRight className="h-4 w-4" aria-hidden />} />
            <Button variant="secondary" size="sm" onClick={week.reload} aria-label="Yenile" icon={<RotateCw className={`h-4 w-4 ${week.loading ? 'animate-spin' : ''}`} aria-hidden />} />
          </>
        }
      />

      {week.error && <div className="mb-4"><ErrorPanel message={week.error.message} onRetry={week.reload} /></div>}
      {!current && week.loading && <Spinner label="Hafta yükleniyor…" />}

      {current && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
          {days.map((d) => {
            const wh = hours.data?.find((w) => w.weekday === isoWeekday(d))
            const list = byDay[d] ?? []
            const blocked = current.blocked.filter((b) => dateOfInstant(b.starts_at) <= d && dateOfInstant(new Date(Date.parse(b.ends_at) - 1)) >= d)
            const isToday = d === today
            return (
              <section key={d} aria-label={formatDateShort(d)} className={`card flex min-h-[8rem] flex-col p-3 ${isToday ? 'border-accent/60' : ''}`}>
                <header className="mb-2 flex items-baseline justify-between gap-2">
                  <h2 className="text-sm">
                    <span className={isToday ? 'text-accent' : 'text-fg'}>{WEEKDAY_SHORT[isoWeekday(d) - 1]}</span>{' '}
                    <span className="font-normal text-muted">{formatDateShort(d).split(' ').slice(0, 2).join(' ')}</span>
                    {isToday && <span className="sr-only"> (bugün)</span>}
                  </h2>
                  <span className="text-xs text-subtle">
                    {wh ? (wh.is_closed ? 'Kapalı' : summarizeWorkingHours([wh])[0].hours) : ''}
                  </span>
                </header>
                {blocked.map((b) => (
                  <p key={b.id} className="mb-1.5 rounded-md border border-line px-2 py-1 text-xs text-muted">
                    Kapalı dönem{b.reason ? ` — ${b.reason}` : ''}
                  </p>
                ))}
                {list.length === 0 ? (
                  <p className="text-xs text-subtle">Randevu yok</p>
                ) : (
                  <ul className="space-y-1.5">
                    {list.map((a) => (
                      <li key={a.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(a.id)}
                          className={`flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition-colors hover:bg-raised ${issuesById[a.id] ? 'border-warning/50' : 'border-line'} ${a.status === 'cancelled' ? 'opacity-60' : ''}`}
                        >
                          <span className="font-mono tabular-nums text-fg">{timeOfInstant(a.starts_at)}</span>
                          <span className={`min-w-0 flex-1 truncate ${a.status === 'cancelled' ? 'line-through' : ''}`}>
                            {a.customer_first_name} {a.customer_last_name}
                          </span>
                          {a.is_test && <TestBadge />}
                          {issuesById[a.id] && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" aria-label="Dikkat gerektiriyor" />}
                          <StatusBadge status={a.status} compact />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )
          })}
        </div>
      )}

      <AppointmentDialog
        appointment={selected}
        issues={selected ? issuesById[selected.id] : undefined}
        onClose={() => setSelectedId(null)}
        onChanged={week.reload}
      />
    </div>
  )
}
