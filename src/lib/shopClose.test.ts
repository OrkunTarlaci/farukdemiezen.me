import { beforeEach, describe, expect, it, vi } from 'vitest'
import { activeClosures, closureRange, closureSpan, selectInClosure } from './shopClose'
import { zonedToInstant } from './time'
import type { AppointmentRow, BlockedPeriod } from './types'

const rpc = vi.fn()
const insert = vi.fn()
const rows = vi.fn()

function query() {
  const q: Record<string, unknown> = {}
  for (const m of ['select', 'gte', 'lt', 'eq', 'order']) q[m] = () => q
  q.insert = (input: unknown) => { insert(input); return q }
  q.single = async () => ({ data: { id: 'b' }, error: null })
  q.limit = async () => ({ data: rows(), error: null })
  return q
}
vi.mock('./supabase', () => ({ getSupabase: async () => ({ rpc, from: query }) }))

const { cancelInClosure, closeShop } = await import('./api')

const DATE = '2026-11-06'
const appt = (id: string, date: string, time: string, status: AppointmentRow['status'] = 'confirmed') =>
  ({ id, status, starts_at: zonedToInstant(date, time).toISOString() }) as AppointmentRow
const period = (from: string, to: string) =>
  ({ id: from, starts_at: from, ends_at: to, reason: null }) as BlockedPeriod

describe('dükkanı kapatma seçimi', () => {
  const now = zonedToInstant(DATE, '14:20')

  it('şu andan seçilen günün gece yarısına kadar kapatır', () => {
    expect(closureRange(now, DATE)).toEqual({
      starts_at: now.toISOString(),
      ends_at: zonedToInstant('2026-11-07', '00:00').toISOString(),
    })
  })

  it('yalnızca dönem içindeki açık randevuları seçer; başlamış ve sonuçlanmış olanı almaz', () => {
    const list = [
      appt('started', DATE, '14:00'),
      appt('later', DATE, '18:00'),
      appt('sooner', DATE, '15:00', 'pending'),
      appt('done', DATE, '16:00', 'cancelled'),
      appt('tomorrow', '2026-11-07', '00:00'),
    ]
    expect(selectInClosure(list, closureRange(now, DATE)).map((a) => a.id)).toEqual(['sooner', 'later'])
  })

  it('yalnızca şu an süren dönemi kapalı sayar', () => {
    const t = (h: string) => zonedToInstant(DATE, h).toISOString()
    const running = period(t('14:00'), t('20:00'))
    expect(activeClosures([running, period(t('15:00'), t('16:00')), period(t('10:00'), t('14:20'))], now)).toEqual([running])
  })

  it('süren dönemlerin toplam aralığını verir', () => {
    expect(closureSpan([])).toBeNull()
    expect(closureSpan([period('2026-11-06T10:00:00Z', '2026-11-06T12:00:00Z'), period('2026-11-06T09:00:00Z', '2026-11-06T11:00:00Z')]))
      .toEqual({ starts_at: '2026-11-06T09:00:00Z', ends_at: '2026-11-06T12:00:00Z' })
  })
})

describe('closeShop', () => {
  const now = new Date()
  const today = new Date(now.getTime() + 3 * 3600_000).toISOString().slice(0, 10)
  const range = closureRange(now, today)
  const soon = { id: 'a', status: 'confirmed', starts_at: new Date(now.getTime() + 60_000).toISOString() }

  beforeEach(() => { rpc.mockReset(); insert.mockReset(); rows.mockReset() })

  it('önce kapalı dönemi yazar, sonra randevuları nedeniyle iptal eder', async () => {
    const order: string[] = []
    insert.mockImplementation(() => order.push('block'))
    rows.mockImplementation(() => { order.push('read'); return [soon] })
    rpc.mockImplementation(async () => { order.push('cancel'); return { data: [{ id: 'a', ok: true }], error: null } })
    expect(await closeShop(range, 'Dükkan kapalı')).toEqual({ cancelled: 1, failed: 0 })
    expect(order).toEqual(['block', 'read', 'cancel'])
    expect(rpc).toHaveBeenCalledWith('admin_bulk_cancel', { p_ids: ['a'], p_reason: 'Dükkan kapalı' })
  })

  it('randevu yoksa sunucuya boş iptal göndermez', async () => {
    rows.mockReturnValue([])
    expect(await cancelInClosure(range, 'Dükkan kapalı')).toEqual({ cancelled: 0, failed: 0 })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('iptal edilemeyen randevuyu sayar', async () => {
    rows.mockReturnValue([soon])
    rpc.mockResolvedValue({ data: [{ id: 'a', ok: false, code: 'invalid_transition' }], error: null })
    expect(await cancelInClosure(range, 'x')).toEqual({ cancelled: 0, failed: 1 })
  })
})
