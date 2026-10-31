import { hhmmToMinutes, timeOfInstant, zonedToInstant } from './time'
import type { AppointmentRow, BlockedPeriod, WorkingHours } from './types'

/** Yönetici gün çizelgesindeki bir satır. */
export type ScheduleRow =
  | { kind: 'appointment'; key: string; start: Date; end: Date; appointment: AppointmentRow }
  | { kind: 'cancelled'; key: string; start: Date; end: Date; appointment: AppointmentRow }
  | { kind: 'available'; key: string; start: Date; end: Date }
  | { kind: 'blocked'; key: string; start: Date; end: Date; reason: string | null }
  | { kind: 'break'; key: string; start: Date; end: Date }

const KIND_ORDER = { cancelled: 0, appointment: 1, blocked: 2, break: 3, available: 4 } as const

/**
 * Seçili günün kronolojik çizelgesini üretir. Yalnızca çalışma saatleri içindeki aralıkları
 * gösterir; kapalı günde yalnızca (varsa) o güne ait randevuları döner.
 * Müsaitlik BİLGİSİ yalnızca görüntü içindir; rezervasyon kuralları sunucudadır.
 */
export function buildDaySchedule(params: {
  date: string
  workingHours: WorkingHours | undefined
  intervalMinutes: number
  appointments: AppointmentRow[]
  blockedPeriods: BlockedPeriod[]
}): ScheduleRow[] {
  const { date, workingHours: wh, intervalMinutes, appointments, blockedPeriods } = params
  const rows: ScheduleRow[] = []

  const active = appointments.filter((a) => a.status !== 'cancelled')
  const cancelled = appointments.filter((a) => a.status === 'cancelled')

  for (const a of active) {
    rows.push({ kind: 'appointment', key: a.id, start: new Date(a.starts_at), end: new Date(a.ends_at), appointment: a })
  }
  for (const a of cancelled) {
    rows.push({ kind: 'cancelled', key: a.id, start: new Date(a.starts_at), end: new Date(a.ends_at), appointment: a })
  }

  if (wh && !wh.is_closed) {
    const open = hhmmToMinutes(wh.opens_at)
    const close = hhmmToMinutes(wh.closes_at)
    for (let m = open; m + intervalMinutes <= close; m += intervalMinutes) {
      const hh = String(Math.floor(m / 60)).padStart(2, '0')
      const mm = String(m % 60).padStart(2, '0')
      const start = zonedToInstant(date, `${hh}:${mm}`)
      const end = new Date(start.getTime() + intervalMinutes * 60000)

      // Aktif bir randevu bu aralığın başlangıcını kapsıyorsa ayrı satır gerekmez.
      if (active.some((a) => new Date(a.starts_at) <= start && start < new Date(a.ends_at))) continue

      if (
        wh.break_starts_at && wh.break_ends_at &&
        m < hhmmToMinutes(wh.break_ends_at) && m + intervalMinutes > hhmmToMinutes(wh.break_starts_at)
      ) {
        rows.push({ kind: 'break', key: `break-${m}`, start, end })
        continue
      }
      const block = blockedPeriods.find((b) => new Date(b.starts_at) < end && new Date(b.ends_at) > start)
      if (block) {
        rows.push({ kind: 'blocked', key: `blocked-${m}`, start, end, reason: block.reason })
        continue
      }
      rows.push({ kind: 'available', key: `free-${m}`, start, end })
    }
  }

  return rows.sort((x, y) => x.start.getTime() - y.start.getTime() || KIND_ORDER[x.kind] - KIND_ORDER[y.kind])
}

export type AppointmentIssue = 'closed_day' | 'outside_hours' | 'break' | 'blocked' | 'pending_past'

export const ISSUE_LABELS: Record<AppointmentIssue, string> = {
  closed_day: 'Kapalı güne denk geliyor',
  outside_hours: 'Çalışma saatleri dışında',
  break: 'Molaya denk geliyor',
  blocked: 'Kapalı döneme denk geliyor',
  pending_past: 'Saati geçti, hâlâ onay bekliyor',
}

/**
 * Aktif bir randevunun güncel ayarlarla çeliştiği durumlar (ör. sonradan kapatılan gün, eklenen izin).
 * Bu yalnızca uyarıdır; randevular kendiliğinden değiştirilmez. İptal edilmiş randevular için boş döner.
 */
export function appointmentIssues(
  a: AppointmentRow,
  workingHours: WorkingHours | undefined,
  blockedPeriods: BlockedPeriod[],
  now: Date = new Date(),
): AppointmentIssue[] {
  if (a.status === 'cancelled') return []
  const issues: AppointmentIssue[] = []
  const start = new Date(a.starts_at)
  const end = new Date(a.ends_at)
  if (!workingHours || workingHours.is_closed) {
    issues.push('closed_day')
  } else {
    const s = hhmmToMinutes(timeOfInstant(start))
    const e = s + Math.round((end.getTime() - start.getTime()) / 60000)
    if (s < hhmmToMinutes(workingHours.opens_at) || e > hhmmToMinutes(workingHours.closes_at)) issues.push('outside_hours')
    if (workingHours.break_starts_at && workingHours.break_ends_at &&
        s < hhmmToMinutes(workingHours.break_ends_at) && e > hhmmToMinutes(workingHours.break_starts_at)) {
      issues.push('break')
    }
  }
  if (blockedPeriods.some((b) => new Date(b.starts_at) < end && new Date(b.ends_at) > start)) issues.push('blocked')
  if (a.status === 'pending' && start < now) issues.push('pending_past')
  return issues
}
