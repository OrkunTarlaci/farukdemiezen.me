import { useEffect, useState } from 'react'
import { msUntilNextIstanbulMidnight, todayIstanbul } from './time'

/**
 * İstanbul'daki bugünün tarihi (YYYY-MM-DD); gece yarısı kendiliğinden yeni güne geçer.
 * Gece yarısı zamanlayıcısına ek olarak dakikada bir ve sekmeye dönüldüğünde de denetlenir
 * (bilgisayar uykudan uyandığında veya saat değiştiğinde kaçırılmasın diye).
 * Not: Bu yalnızca ekranı günceller; rezervasyon kuralları sunucu saatiyle denetlenir.
 */
export function useIstanbulToday(): string {
  const [today, setToday] = useState(() => todayIstanbul())

  useEffect(() => {
    const check = () => setToday((prev) => {
      const now = todayIstanbul()
      return now === prev ? prev : now
    })
    let timer = window.setTimeout(function tick() {
      check()
      timer = window.setTimeout(tick, msUntilNextIstanbulMidnight() + 1000)
    }, msUntilNextIstanbulMidnight() + 1000)
    const interval = window.setInterval(check, 60_000)
    const onVisible = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearTimeout(timer)
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  return today
}
