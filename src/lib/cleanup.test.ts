import { describe, expect, it } from 'vitest'
import type { CleanupStatus } from './api'
import { describeCleanup } from './cleanup'

const base: CleanupStatus = {
  scheduler: 'scheduled', schedule: '0 * * * *', last_run_at: '2026-11-01T21:00:00Z', last_trigger: 'scheduler',
  last_deleted_appointments: 4, current_day_start: '2026-11-01T21:00:00Z',
}
const now = new Date('2026-11-01T21:30:00Z')

describe('günlük temizlik durumu', () => {
  it('etkin ve yakın zamanda çalışmışsa sorunsuz sayılır', () => {
    const d = describeCleanup(base, now)
    expect(d.ok).toBe(true)
    expect(d.text).toContain('silinen randevu: 4')
  })
  it('zamanlayıcı yoksa, kurulmamışsa veya kapalıysa açıkça uyarır', () => {
    for (const scheduler of ['not_installed', 'not_scheduled', 'inactive'] as const) {
      const d = describeCleanup({ ...base, scheduler }, now)
      expect(d.ok).toBe(false)
      expect(d.text).toContain('otomatik SİLİNMİYOR')
    }
  })
  it('kurulu ama 2 saatten uzun süredir çalışmamışsa veya hiç çalışmamışsa uyarır', () => {
    expect(describeCleanup({ ...base, last_run_at: '2026-11-01T18:00:00Z' }, now).ok).toBe(false)
    expect(describeCleanup({ ...base, last_run_at: null }, now).text).toContain('Henüz hiç çalışmadı')
  })
})
