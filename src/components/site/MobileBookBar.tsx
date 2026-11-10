import { CalendarDays } from 'lucide-react'
import { useEffect, useState } from 'react'
import { scrollToId } from '../../lib/nav'
import { Button } from '../ui/Button'

/**
 * Telefonda ekranın altında sabit "Randevu Al". İlk ekranı geçince görünür; randevu bölümü
 * ekrandayken gizlenir. Masaüstünde üst menüdeki düğme yeterlidir.
 */
export function MobileBookBar() {
  const [scrolled, setScrolled] = useState(false)
  const [bookingVisible, setBookingVisible] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > window.innerHeight * 0.8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    const target = document.getElementById('randevu')
    const obs = typeof IntersectionObserver !== 'undefined' && target
      ? new IntersectionObserver(([e]) => setBookingVisible(e.isIntersecting))
      : null
    if (obs && target) obs.observe(target)
    return () => { window.removeEventListener('scroll', onScroll); obs?.disconnect() }
  }, [])

  const show = scrolled && !bookingVisible
  return (
    <>
      <div className="h-20 md:hidden" aria-hidden />
      <div
        className={[
          'fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/90 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur-md transition-transform duration-200 motion-reduce:transition-none md:hidden',
          show ? 'translate-y-0' : 'pointer-events-none translate-y-full',
        ].join(' ')}
        aria-hidden={!show}
      >
        <Button className="w-full" size="lg" tabIndex={show ? 0 : -1} onClick={() => scrollToId('randevu')} icon={<CalendarDays className="h-5 w-5" aria-hidden />}>
          Randevu Al
        </Button>
      </div>
    </>
  )
}
