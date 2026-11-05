import { CalendarDays, Menu, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { siteConfig } from '../../config/site'
import { scrollToId } from '../../lib/nav'
import { Button } from '../ui/Button'
import { Logo } from '../ui/Logo'

interface Props { showLocation: boolean; businessName?: string }

/** Görünür bölümü izler; menüde etkin bağlantıyı işaretlemek için. */
function useActiveSection(ids: string[]) {
  const [active, setActive] = useState<string | null>(null)
  const key = ids.join(',')
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id)
      },
      { rootMargin: '-45% 0px -50% 0px' },
    )
    for (const id of key.split(',')) {
      const el = document.getElementById(id)
      if (el) obs.observe(el)
    }
    return () => obs.disconnect()
  }, [key])
  return active
}

export function Header({ showLocation, businessName }: Props) {
  const [open, setOpen] = useState(false)
  const items = [
    { id: 'hizmetler', label: 'Hizmetler' },
    { id: 'randevu', label: 'Randevu' },
    { id: 'hakkinda', label: 'Hakkında' },
    ...(showLocation ? [{ id: 'konum', label: 'Konum' }] : []),
  ]
  const active = useActiveSection(items.map((i) => i.id))
  const go = (id: string) => { setOpen(false); scrollToId(id) }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <header className="sticky top-0 z-30 border-b border-line/80 bg-bg/85 backdrop-blur-md">
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <a
          href="#/"
          onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0 }) }}
          aria-label={`${businessName || siteConfig.name} — sayfanın başına dön`}
          className="rounded-lg"
        >
          <Logo decorative className="h-10 lg:h-11" />
        </a>

        <nav aria-label="Ana menü" className="hidden items-center gap-1 md:flex">
          {items.map((i) => (
            <a
              key={i.id}
              href="#/"
              onClick={(e) => { e.preventDefault(); go(i.id) }}
              aria-current={active === i.id ? 'location' : undefined}
              className={[
                'relative rounded-lg px-3 py-2 text-sm transition-colors hover:text-fg',
                active === i.id ? 'text-fg after:absolute after:inset-x-3 after:-bottom-[13px] after:h-px after:bg-accent' : 'text-muted',
              ].join(' ')}
            >
              {i.label}
            </a>
          ))}
          <Button className="ml-3" onClick={() => go('randevu')} icon={<CalendarDays className="h-4 w-4" aria-hidden />}>
            Randevu Al
          </Button>
        </nav>

        <div className="flex items-center gap-2 md:hidden">
          {/* Dar ekranda logo öne çıkar; Randevu Al ana sayfada ve menüde kalır. */}
          <span className="hidden min-[420px]:block"><Button size="sm" onClick={() => go('randevu')}>Randevu Al</Button></span>
          <button
            type="button"
            aria-expanded={open}
            aria-controls="mobil-menu"
            aria-label={open ? 'Menüyü kapat' : 'Menüyü aç'}
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-line text-fg hover:bg-raised"
          >
            {open ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
          </button>
        </div>
      </div>

      {open && (
        <nav id="mobil-menu" aria-label="Mobil menü" className="border-t border-line bg-bg md:hidden">
          <ul className="container-page py-2">
            <li className="min-[420px]:hidden">
              <Button className="my-1 w-full" onClick={() => go('randevu')} icon={<CalendarDays className="h-4 w-4" aria-hidden />}>Randevu Al</Button>
            </li>
            {items.map((i) => (
              <li key={i.id}>
                <a
                  href="#/"
                  onClick={(e) => { e.preventDefault(); go(i.id) }}
                  aria-current={active === i.id ? 'location' : undefined}
                  className="flex min-h-[3rem] items-center rounded-lg px-2 text-base text-fg hover:bg-raised"
                >
                  {i.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  )
}
