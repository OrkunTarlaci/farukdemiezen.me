import { describe, expect, it } from 'vitest'
import { summarizeWorkingHours } from './hours'
import { appointmentIssues, buildDaySchedule } from './schedule'
import { timeOfInstant, zonedToInstant } from './time'
import type { AppointmentRow, WorkingHours } from './types'

const DATE = '2026-10-31'
const wh: WorkingHours = {
  weekday: 6, is_closed: false, opens_at: '10:00:00', closes_at: '13:00:00',
  break_starts_at: null, break_ends_at: null,
}

function appt(id: string, from: string, to: string, status: AppointmentRow['status'] = 'confirmed'): AppointmentRow {
  return {
    id, reference_code: `FD-${id}`, service_id: 's', customer_first_name: 'Ali', customer_last_name: 'Yılmaz',
    customer_phone: '+905321112233', customer_email: null, customer_note: null,
    starts_at: zonedToInstant(DATE, from).toISOString(), ends_at: zonedToInstant(DATE, to).toISOString(),
    status, created_at: '2026-10-30T10:00:00Z', cancelled_at: status === 'cancelled' ? '2026-10-30T11:00:00Z' : null,
    service_name: 'Saç Kesimi', price_minor: 70000, is_test: false,
    services: { name: 'Saç Kesimi', duration_minutes: 30 },
  }
}
const base = { date: DATE, intervalMinutes: 30, blockedPeriods: [] }
const summary = (rows: ReturnType<typeof buildDaySchedule>) =>
  rows.map((r) => `${timeOfInstant(r.start)} ${r.kind}`)

describe('gün çizelgesi', () => {
  it('çalışma saatleri içindeki müsait aralıkları listeler, dışını üretmez', () => {
    const rows = buildDaySchedule({ ...base, workingHours: wh, appointments: [] })
    expect(summary(rows)).toEqual([
      '10:00 available', '10:30 available', '11:00 available', '11:30 available', '12:00 available', '12:30 available',
    ])
  })

  it('randevu birden fazla aralığı kaplıyorsa tek satır gösterir', () => {
    const rows = buildDaySchedule({ ...base, workingHours: wh, appointments: [appt('a', '10:30', '11:20')] })
    expect(summary(rows)).toEqual([
      '10:00 available', '10:30 appointment', '11:30 available', '12:00 available', '12:30 available',
    ])
  })

  it('iptal edilen randevu çizelgede iptal olarak görünür ve saat müsait kalır', () => {
    const rows = buildDaySchedule({ ...base, workingHours: wh, appointments: [appt('a', '10:00', '10:30', 'cancelled')] })
    expect(summary(rows).slice(0, 2)).toEqual(['10:00 cancelled', '10:00 available'])
  })

  it('mola ve bloklu dönemleri ayırt eder', () => {
    const rows = buildDaySchedule({
      ...base,
      workingHours: { ...wh, break_starts_at: '11:00:00', break_ends_at: '11:30:00' },
      appointments: [],
      blockedPeriods: [{
        id: 'b', reason: 'İzin',
        starts_at: zonedToInstant(DATE, '12:00').toISOString(), ends_at: zonedToInstant(DATE, '13:00').toISOString(),
      }],
    })
    expect(summary(rows)).toEqual([
      '10:00 available', '10:30 available', '11:00 break', '11:30 available', '12:00 blocked', '12:30 blocked',
    ])
  })

  it('kapalı günde boş aralık üretmez ama o güne ait randevuyu kaybetmez', () => {
    const closed = { ...wh, is_closed: true }
    expect(buildDaySchedule({ ...base, workingHours: closed, appointments: [] })).toEqual([])
    const rows = buildDaySchedule({ ...base, workingHours: closed, appointments: [appt('a', '10:00', '10:30')] })
    expect(summary(rows)).toEqual(['10:00 appointment'])
  })

  it('ayarlar sonradan değişse bile çalışma saati dışındaki randevu görünür kalır', () => {
    const rows = buildDaySchedule({ ...base, workingHours: wh, appointments: [appt('late', '15:00', '15:30')] })
    expect(summary(rows)[summary(rows).length - 1]).toBe('15:00 appointment')
  })
})

describe('randevu uyarıları', () => {
  const now = new Date('2026-10-30T12:00:00Z')
  it('ayarlarla uyumlu randevu için uyarı yok', () => {
    expect(appointmentIssues(appt('a', '10:00', '10:30'), wh, [], now)).toEqual([])
  })
  it('kapalı gün, saat dışı, mola ve kapalı dönem çakışmalarını bulur', () => {
    expect(appointmentIssues(appt('a', '10:00', '10:30'), { ...wh, is_closed: true }, [], now)).toEqual(['closed_day'])
    expect(appointmentIssues(appt('a', '12:45', '13:15'), wh, [], now)).toEqual(['outside_hours'])
    expect(appointmentIssues(appt('a', '11:00', '11:30'), { ...wh, break_starts_at: '11:15:00', break_ends_at: '11:45:00' }, [], now)).toEqual(['break'])
    const block = { id: 'b', reason: null, starts_at: zonedToInstant(DATE, '10:15').toISOString(), ends_at: zonedToInstant(DATE, '12:00').toISOString() }
    expect(appointmentIssues(appt('a', '10:00', '10:30'), wh, [block], now)).toEqual(['blocked'])
  })
  it('saati geçmiş ve hâlâ onay bekleyen randevuyu işaretler; iptalleri yok sayar', () => {
    const later = new Date('2026-11-01T00:00:00Z')
    expect(appointmentIssues(appt('a', '10:00', '10:30', 'pending'), wh, [], later)).toEqual(['pending_past'])
    expect(appointmentIssues(appt('a', '10:00', '10:30', 'confirmed'), wh, [], later)).toEqual(['unresolved_past'])
    expect(appointmentIssues(appt('a', '10:00', '10:30', 'confirmed'), wh, [], now)).toEqual([])
    expect(appointmentIssues(appt('a', '10:00', '10:30', 'cancelled'), { ...wh, is_closed: true }, [], later)).toEqual([])
    expect(appointmentIssues(appt('a', '10:00', '10:30', 'completed'), { ...wh, is_closed: true }, [], later)).toEqual([])
    expect(appointmentIssues(appt('a', '10:00', '10:30', 'no_show'), wh, [], later)).toEqual([])
  })
})

describe('çalışma saati özeti', () => {
  const day = (weekday: number, over: Partial<WorkingHours> = {}): WorkingHours =>
    ({ weekday, is_closed: false, opens_at: '10:00:00', closes_at: '19:00:00', break_starts_at: null, break_ends_at: null, ...over })
  it('aynı saatli ardışık günleri birleştirir', () => {
    const rows = [1, 2, 3, 4, 5, 6].map((d) => day(d)).concat(day(7, { is_closed: true }))
    expect(summarizeWorkingHours(rows)).toEqual([
      { days: 'Pzt–Cmt', hours: '10:00–19:00' },
      { days: 'Paz', hours: 'Kapalı' },
    ])
  })
  it('farklı saatleri ve molayı ayrı gösterir', () => {
    const rows = [day(1, { break_starts_at: '13:00:00', break_ends_at: '14:00:00' }), day(2), day(3, { closes_at: '17:00:00' })]
    expect(summarizeWorkingHours(rows)).toEqual([
      { days: 'Pzt', hours: '10:00–19:00 (mola 13:00–14:00)' },
      { days: 'Sal', hours: '10:00–19:00' },
      { days: 'Çar', hours: '10:00–17:00' },
    ])
  })
})

describe('09:00–20:00 çizelgesi', () => {
  it('panel 30 dakikalık 22 satır gösterir, İstanbul saatiyle kayma olmaz', () => {
    const rows = buildDaySchedule({
      date: '2026-11-09',
      workingHours: { weekday: 1, is_closed: false, opens_at: '09:00:00', closes_at: '20:00:00', break_starts_at: null, break_ends_at: null },
      intervalMinutes: 30,
      appointments: [],
      blockedPeriods: [],
    })
    expect(rows).toHaveLength(22)
    expect(timeOfInstant(rows[0].start)).toBe('09:00')
    expect(timeOfInstant(rows[21].start)).toBe('19:30')
  })
})
