import { siteConfig } from '../../config/site'

/**
 * Marka işareti. Onaylı bir logo dosyası yoksa sade bir "FD" monogramı çizilir;
 * siteConfig.logoUrl doldurulursa o görsel kullanılır.
 */
export function Monogram({ className = 'h-9 w-9' }: { className?: string }) {
  const url = siteConfig.logoUrl
  if (url) {
    const src = url.startsWith('http') ? url : `${import.meta.env.BASE_URL}${url.replace(/^\//, '')}`
    return <img src={src} alt="" className={`${className} object-contain`} />
  }
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden>
      <rect x="0.75" y="0.75" width="38.5" height="38.5" rx="9" fill="none" stroke="rgb(var(--accent))" strokeOpacity="0.55" strokeWidth="1.5" />
      <text x="20" y="25.5" textAnchor="middle" fontFamily="Inter, system-ui, sans-serif" fontSize="15" fontWeight="600" letterSpacing="0.5" fill="rgb(var(--accent))">
        FD
      </text>
    </svg>
  )
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5 sm:gap-3">
      <Monogram className="h-8 w-8 shrink-0 sm:h-9 sm:w-9" />
      <span className="flex flex-col leading-none">
        <span className="whitespace-nowrap text-[0.8rem] font-semibold uppercase tracking-[0.12em] text-fg sm:text-sm sm:tracking-[0.2em]">{siteConfig.name}</span>
        {!compact && (
          <span className="mt-1 whitespace-nowrap text-[0.6rem] font-medium uppercase tracking-[0.2em] text-muted sm:text-[0.65rem] sm:tracking-[0.28em]">{siteConfig.tagline}</span>
        )}
      </span>
    </span>
  )
}
