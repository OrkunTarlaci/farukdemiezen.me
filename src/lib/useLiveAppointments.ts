import { useEffect, useRef } from 'react'
import { getSupabase } from './supabase'

const REFRESH_MS = 30_000
let channelSeq = 0

/**
 * Randevu ekranlarını başka cihazlarda yapılan değişikliklerle güncel tutar: Supabase Realtime
 * (appointments tablosu, yalnızca yönetici oturumu alır) + 30 sn yoklama + sekmeye dönünce yenileme.
 * Realtime çalışmasa bile yoklama ve sayfa yenileme veriyi her zaman veritabanından yeniden okur.
 */
export function useLiveAppointments(reload: () => void) {
  const reloadRef = useRef(reload)
  reloadRef.current = reload

  useEffect(() => {
    const tick = () => { if (document.visibilityState === 'visible') reloadRef.current() }
    const timer = setInterval(tick, REFRESH_MS)
    document.addEventListener('visibilitychange', tick)
    let cleanup: (() => void) | null = null
    let cancelled = false
    void getSupabase().then((supabase) => {
      if (!supabase || cancelled) return
      const channel = supabase
        .channel(`appointments-live-${++channelSeq}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, () => reloadRef.current())
        .subscribe()
      cleanup = () => { void supabase.removeChannel(channel) }
    })
    return () => {
      cancelled = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', tick)
      cleanup?.()
    }
  }, [])
}
