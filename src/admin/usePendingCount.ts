import { fetchAppointmentsInRange } from '../lib/api'
import { addDays } from '../lib/time'
import { useAsync } from '../lib/useAsync'
import { useLiveAppointments } from '../lib/useLiveAppointments'
import { useIstanbulToday } from '../lib/useToday'

/** Menüdeki rozet için: saati henüz gelmemiş, onay bekleyen randevu sayısı. Başka cihazdaki değişiklikle güncellenir. */
export function usePendingCount(): number {
  const today = useIstanbulToday()
  const data = useAsync(() => fetchAppointmentsInRange(today, addDays(today, 30), { status: 'pending' }), [today])
  useLiveAppointments(data.reload)
  const now = Date.now()
  return (data.data ?? []).filter((a) => new Date(a.starts_at).getTime() > now).length
}
