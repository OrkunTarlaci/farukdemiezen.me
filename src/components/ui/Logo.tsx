const asset = (path: string) => `${import.meta.env.BASE_URL}brand/${path}`
const ALT = 'Faruk Demirezen Erkek Kuaförü'

/** Ana marka logosu: amblem ve yazı. Yazı SVG içinde eğridir, yazı tipine bağlı değildir. */
export function Logo({ className = 'h-9', decorative = false }: { className?: string; decorative?: boolean }) {
  return <img src={asset('logo-horizontal.svg')} alt={decorative ? '' : ALT} width={355} height={64} className={`${className} w-auto max-w-none`} />
}

/** Kompakt amblem: yazısız, küçük alanlar için. */
export function Monogram({ className = 'h-9 w-9', decorative = true }: { className?: string; decorative?: boolean }) {
  return <img src={asset('emblem.svg')} alt={decorative ? '' : ALT} width={64} height={64} className={className} />
}
