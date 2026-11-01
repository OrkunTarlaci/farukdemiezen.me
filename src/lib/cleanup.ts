import type { CleanupStatus } from './api'
import { dateOfInstant, formatDateShort, timeOfInstant } from './time'

/** Zamanlayıcı durumunu yönetici için açıklar; yalnızca etkin ve yakın zamanda çalışmışsa "sorunsuz" sayılır. */
export function describeCleanup(s: CleanupStatus, now: Date = new Date()): { ok: boolean; text: string } {
  const last = s.last_run_at ? new Date(s.last_run_at) : null
  const lastText = last ? `Son çalışma: ${formatDateShort(dateOfInstant(last)).split(' ').slice(0, 2).join(' ')} ${timeOfInstant(last)}${s.last_trigger === 'manual' ? ' (elle)' : ''}, silinen randevu: ${s.last_deleted_appointments ?? 0}.` : 'Henüz hiç çalışmadı.'
  if (s.scheduler === 'not_installed') return { ok: false, text: `Zamanlayıcı (pg_cron) etkin değil: eski randevular otomatik SİLİNMİYOR. ${lastText}` }
  if (s.scheduler === 'not_scheduled') return { ok: false, text: `pg_cron etkin ama temizlik işi kurulmamış: eski randevular otomatik SİLİNMİYOR. ${lastText}` }
  if (s.scheduler === 'inactive') return { ok: false, text: `Temizlik işi kapalı: eski randevular otomatik SİLİNMİYOR. ${lastText}` }
  // Saat başı çalışır; 2 saatten uzun süredir çalışmadıysa uyar.
  if (!last || now.getTime() - last.getTime() > 2 * 3600_000) return { ok: false, text: `Zamanlayıcı kurulu ama son 2 saatte çalışmamış. ${lastText}` }
  return { ok: true, text: `Etkin: her gece 00:00'da (İstanbul) önceki günlerin randevuları silinir. ${lastText}` }
}
