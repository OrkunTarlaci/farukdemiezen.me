import { describe, expect, it } from 'vitest'
import { summarizeAppointments } from './stats'
import type { AppointmentRow, AppointmentStatus } from './types'

const row = (status: AppointmentStatus, price_minor: number | null) =>
  ({ id: Math.random().toString(), status, price_minor } as AppointmentRow)

describe('randevu özeti ve ciro', () => {
  it('durumları sayar; ciroyu randevu anındaki fiyattan hesaplar', () => {
    const s = summarizeAppointments([
      row('pending', 70000), row('confirmed', 40000), row('completed', 90000),
      row('completed', 70000), row('cancelled', 70000), row('no_show', 40000),
    ])
    expect(s).toMatchObject({ active: 4, pending: 1, confirmed: 1, completed: 2, cancelled: 1, noShow: 1 })
    expect(s.expectedMinor).toBe(270000) // 700 + 400 + 900 + 700
    expect(s.realizedMinor).toBe(160000) // 900 + 700
  })

  it('iptal ve gelmeyen randevular ciroya girmez; fiyatı bilinmeyenler ayrıca sayılır', () => {
    const s = summarizeAppointments([row('cancelled', 70000), row('no_show', 70000), row('confirmed', null)])
    expect(s.expectedMinor).toBe(0)
    expect(s.unknownPrice).toBe(1)
  })

  it('test randevularını saymaz', () => {
    const s = summarizeAppointments([{ ...row('confirmed', 70000), is_test: true }, row('confirmed', 40000)])
    expect(s.active).toBe(1)
    expect(s.expectedMinor).toBe(40000)
  })

  it('boş listede sıfır döner', () => {
    expect(summarizeAppointments([]).active).toBe(0)
  })
})
