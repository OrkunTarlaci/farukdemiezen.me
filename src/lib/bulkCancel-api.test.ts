// Toplu iptal ve bildirim çağrıları: sunucu yanıtları sahte istemciyle verilir.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()
vi.mock('./supabase', () => ({ getSupabase: async () => ({ rpc }) }))

const { cancelAppointments, markCancelNoticeOpened } = await import('./api')

describe('toplu iptal (cancelAppointments)', () => {
  beforeEach(() => rpc.mockReset())

  it('tek sunucu çağrısıyla, nedeni ile birlikte veritabanına yazar', async () => {
    rpc.mockResolvedValue({ data: [{ id: 'a', ok: true }, { id: 'b', ok: false, code: 'already_cancelled' }], error: null })
    const out = await cancelAppointments(['a', 'b'], 'Hastane')
    expect(rpc.mock.calls).toEqual([['admin_bulk_cancel', { p_ids: ['a', 'b'], p_reason: 'Hastane' }]])
    expect(out).toEqual([{ id: 'a', ok: true }, { id: 'b', ok: false, code: 'already_cancelled' }])
  })

  it('yetki hatasını iletir (sunucu reddeder; hiçbir şey iptal edilmez)', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'forbidden', code: '42501' } })
    await expect(cancelAppointments(['a'], 'x')).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('0008 canlıya uygulanmamışsa anlaşılır bir hata verir', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'Could not find the function public.admin_bulk_cancel', code: 'PGRST202' } })
    await expect(cancelAppointments(['a'], 'x')).rejects.toMatchObject({ code: 'migration_required' })
  })

  it('"WhatsApp açıldı" işaretini sunucuya yazar', async () => {
    rpc.mockResolvedValue({ data: '2026-11-01T15:00:00Z', error: null })
    await markCancelNoticeOpened('a')
    expect(rpc).toHaveBeenCalledWith('admin_mark_cancel_notice', { p_id: 'a' })
  })
})
