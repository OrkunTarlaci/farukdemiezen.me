import { siteConfig } from '../../config/site'
import { Emblem } from './Emblem'

/** Marka işareti: yuvarlak amblem. siteConfig.logoUrl doldurulursa o görsel kullanılır. */
export function Monogram({ className = 'h-9 w-9' }: { className?: string }) {
  const url = siteConfig.logoUrl
  if (url) {
    const src = url.startsWith('http') ? url : `${import.meta.env.BASE_URL}${url.replace(/^\//, '')}`
    return <img src={src} alt="" className={`${className} object-contain`} />
  }
  return <Emblem className={className} />
}

/** name: veritabanındaki işletme adı (business_settings); yüklenene kadar siteConfig.name kullanılır. */
export function Logo({ compact = false, name }: { compact?: boolean; name?: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2 sm:gap-3">
      <Monogram className="h-9 w-9 shrink-0 sm:h-12 sm:w-12" />
      <span className="flex flex-col leading-none">
        <span className="whitespace-nowrap text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-fg sm:text-sm sm:tracking-[0.2em]">{name || siteConfig.name}</span>
        {!compact && (
          <span className="mt-1 whitespace-nowrap text-[0.6rem] font-medium uppercase tracking-[0.2em] text-muted sm:text-[0.65rem] sm:tracking-[0.28em]">{siteConfig.tagline}</span>
        )}
      </span>
    </span>
  )
}
