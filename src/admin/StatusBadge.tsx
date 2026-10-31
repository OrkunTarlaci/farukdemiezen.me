import { CheckCircle2, Clock, XCircle } from 'lucide-react'
import type { AppointmentStatus } from '../lib/types'

export const STATUS_LABELS: Record<AppointmentStatus, string> = {
  pending: 'Onay bekliyor',
  confirmed: 'Onaylandı',
  cancelled: 'İptal edildi',
}

const MAP = {
  pending: { Icon: Clock, cls: 'border-warning/40 bg-warning/10 text-warning' },
  confirmed: { Icon: CheckCircle2, cls: 'border-success/40 bg-success/10 text-success' },
  cancelled: { Icon: XCircle, cls: 'border-danger/40 bg-danger/10 text-danger' },
} as const

/** Durum yalnızca renkle değil, ikon ve metinle de belirtilir. */
export function StatusBadge({ status, compact = false }: { status: AppointmentStatus; compact?: boolean }) {
  const { Icon, cls } = MAP[status]
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-1 text-xs font-medium ${cls}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {compact ? <span className="sr-only">{STATUS_LABELS[status]}</span> : STATUS_LABELS[status]}
    </span>
  )
}
