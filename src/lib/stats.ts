import type { AppointmentRow } from './types'

export interface AppointmentSummary {
  /** Onay bekleyen + onaylı + tamamlanan (gelmedi ve iptal hariç) */
  active: number
  pending: number
  confirmed: number
  completed: number
  noShow: number
  cancelled: number
  /** Beklenen ciro (kuruş): bekleyen + onaylı + tamamlanan randevuların randevu anındaki fiyatı */
  expectedMinor: number
  /** Gerçekleşen ciro (kuruş): yalnızca tamamlanan randevular */
  realizedMinor: number
  /** Fiyatı kayıtlı olmayan (0005 öncesi) aktif randevu sayısı; ciroya dahil edilmez */
  unknownPrice: number
}

/**
 * Randevu listesinden sayılar ve ciro. Ciro, randevu oluşturulurken sunucunun kaydettiği fiyattan
 * hesaplanır (hizmetin bugünkü fiyatından değil); fiyatı bilinmeyen kayıtlar ayrıca sayılır.
 */
export function summarizeAppointments(list: AppointmentRow[]): AppointmentSummary {
  // Test randevuları (localhost) gerçek iş verisi değildir; sayılara ve ciroya girmez.
  const s: AppointmentSummary = {
    active: 0, pending: 0, confirmed: 0, completed: 0, noShow: 0, cancelled: 0, expectedMinor: 0, realizedMinor: 0, unknownPrice: 0,
  }
  for (const a of list) {
    if (a.is_test) continue
    if (a.status === 'cancelled') { s.cancelled++; continue }
    if (a.status === 'no_show') { s.noShow++; continue }
    s.active++
    if (a.status === 'pending') s.pending++
    if (a.status === 'confirmed') s.confirmed++
    if (a.status === 'completed') s.completed++
    if (a.price_minor == null) { s.unknownPrice++; continue }
    s.expectedMinor += a.price_minor
    if (a.status === 'completed') s.realizedMinor += a.price_minor
  }
  return s
}
