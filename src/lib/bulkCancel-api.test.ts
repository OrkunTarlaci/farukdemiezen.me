// Toplu iptal çağrısı: sunucunun (admin_set_appointment_status) yanıtları sahte istemciyle verilir.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()
vi.mock('./supabase', () => ({ getSupabase: async () => ({ rpc }) }))

const { cancelAppointments } = await import('./api')

describe('toplu iptal (cancelAppointments)', () => {
  beforeEach(() => rpc.mockReset())

  it('her randevu için mevcut yönetici iptal fonksiyonunu ayrı ayrı çağırır', async () => {
    rpc.mockResolvedValue({ data: { status: 'cancelled' }, error: null })
    const out = await cancelAppointments(['a', 'b'])
    expect(rpc.mock.calls).toEqual([
      ['admin_set_appointment_status', { p_id: 'a', p_status: 'cancelled' }],
      ['admin_set_appointment_status', { p_id: 'b', p_status: 'cancelled' }],
    ])
    expect(out).toEqual([{ id: 'a', ok: true }, { id: 'b', ok: true }])
  })

  it('zaten iptal edilmiş randevu başarılı sayılmaz (iki kez iptal ve mesaj yok); diğerleri devam eder', async () => {
    rpc
      .mockResolvedValueOnce({ data: null, error: { message: 'already_cancelled' } })
      .mockResolvedValueOnce({ data: { status: 'cancelled' }, error: null })
    expect(await cancelAppointments(['a', 'b'])).toEqual([
      { id: 'a', ok: false, code: 'already_cancelled' },
      { id: 'b', ok: true },
    ])
  })

  it('yetki veya oturum hatasında kalanları denemez', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'forbidden', code: '42501' } })
    expect(await cancelAppointments(['a', 'b', 'c'])).toEqual([
      { id: 'a', ok: false, code: 'forbidden' },
      { id: 'b', ok: false, code: 'not_attempted' },
      { id: 'c', ok: false, code: 'not_attempted' },
    ])
    expect(rpc).toHaveBeenCalledTimes(1)
  })
})
