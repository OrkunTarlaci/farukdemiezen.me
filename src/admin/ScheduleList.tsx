import { AlertTriangle, ChevronRight } from 'lucide-react'
import type { AppointmentIssue, ScheduleRow } from '../lib/schedule'
import { ISSUE_LABELS } from '../lib/schedule'
import { timeOfInstant } from '../lib/time'
import type { AppointmentRow } from '../lib/types'
import { StatusBadge } from './StatusBadge'

interface Props {
  rows: ScheduleRow[]
  issuesById: Record<string, AppointmentIssue[]>
  onOpen: (a: AppointmentRow) => void
}

function minutes(a: AppointmentRow) {
  return Math.round((Date.parse(a.ends_at) - Date.parse(a.starts_at)) / 60000)
}

/** Günün kronolojik çizelgesi: randevular, müsait aralıklar, mola ve kapalı dönemler. */
export function ScheduleList({ rows, issuesById, onOpen }: Props) {
  return (
    <ul className="space-y-2">
      {rows.map((r) => {
        const time = timeOfInstant(r.start)
        if (r.kind === 'available' || r.kind === 'break' || r.kind === 'blocked') {
          const text = r.kind === 'available' ? 'Müsait' : r.kind === 'break' ? 'Mola' : `Kapalı${r.reason ? ` — ${r.reason}` : ''}`
          return (
            <li key={r.key} className="flex min-h-[2.75rem] items-center gap-4 rounded-lg border border-dashed border-line px-4 text-sm text-subtle">
              <span className="w-12 font-mono tabular-nums">{time}</span>
              <span className={r.kind === 'available' ? '' : 'rounded-md border border-line px-2 py-0.5 text-xs text-muted'}>{text}</span>
            </li>
          )
        }
        const a = r.appointment
        const cancelled = r.kind === 'cancelled'
        const issues = issuesById[a.id] ?? []
        return (
          <li key={r.key}>
            <button
              type="button"
              onClick={() => onOpen(a)}
              aria-label={`${time}, ${a.customer_first_name} ${a.customer_last_name}, ${a.services?.name ?? 'hizmet'} — ayrıntıları aç`}
              className={[
                'card flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:border-fg/20 hover:bg-raised/60',
                cancelled ? 'opacity-70' : '',
                issues.length > 0 ? 'border-warning/40' : '',
              ].join(' ')}
            >
              <span className="w-12 shrink-0">
                <span className="block font-mono text-base font-semibold tabular-nums text-fg">{time}</span>
                <span className="block font-mono text-xs tabular-nums text-subtle">{timeOfInstant(r.end)}</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block truncate font-medium ${cancelled ? 'text-muted line-through' : 'text-fg'}`}>
                  {a.customer_first_name} {a.customer_last_name}
                </span>
                <span className="block truncate text-xs text-muted">{a.services?.name ?? 'Hizmet'} ({minutes(a)} dk)</span>
                {issues.length > 0 && (
                  <span className="mt-1 flex items-center gap-1 text-xs text-warning">
                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden />{issues.map((i) => ISSUE_LABELS[i]).join(' · ')}
                  </span>
                )}
              </span>
              <StatusBadge status={a.status} />
              <ChevronRight className="hidden h-4 w-4 shrink-0 text-subtle sm:block" aria-hidden />
            </button>
          </li>
        )
      })}
    </ul>
  )
}
