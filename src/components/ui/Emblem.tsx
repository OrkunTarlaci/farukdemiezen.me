import { useId } from 'react'
import { siteConfig } from '../../config/site'

const ACCENT = 'rgb(var(--accent))'
const STRIPES = Array.from({ length: 12 }, (_, i) => 128 + i * 22)
const TICKS = Array.from({ length: 72 }, (_, i) => i * 5)

/** Ana sayfa görseli: berber direği, makas ve ustura olan yuvarlak amblem. Header logosu public/brand içindedir. */
export function Emblem({ className, label }: { className?: string; label?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '')
  return (
    <svg viewBox="40 40 400 400" className={className} preserveAspectRatio="xMidYMid meet" {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}>
      <defs>
        <path id={`${id}top`} d="M92 240 A148 148 0 0 1 388 240" />
        <path id={`${id}bottom`} d="M82 240 A158 158 0 0 0 398 240" />
        <clipPath id={`${id}glass`}><rect x="227" y="150" width="26" height="180" rx="3" /></clipPath>
      </defs>

      {/* Dış halkalar ve çentikler */}
      <g fill="none" stroke={ACCENT}>
        <circle cx="240" cy="240" r="186" strokeOpacity="0.25" />
        <circle cx="240" cy="240" r="176" strokeWidth="2" strokeOpacity="0.9" />
        <circle cx="240" cy="240" r="134" strokeWidth="1.25" strokeOpacity="0.9" />
        <circle cx="240" cy="240" r="128" strokeOpacity="0.3" />
        {TICKS.map((a) => (
          <line key={a} x1="240" y1="58" x2="240" y2={a % 15 === 0 ? 66 : 62} strokeOpacity="0.45" transform={`rotate(${a} 240 240)`} />
        ))}
      </g>

      {/* Halka yazısı */}
      <g fill={ACCENT} fontFamily="Inter, system-ui, sans-serif" fontWeight="600" fontSize="15" letterSpacing="5">
        <text textAnchor="middle"><textPath href={`#${id}top`} startOffset="50%">{siteConfig.name.toLocaleUpperCase('tr-TR')}</textPath></text>
        <text textAnchor="middle" fontSize="12" letterSpacing="6"><textPath href={`#${id}bottom`} startOffset="50%">{siteConfig.tagline.toLocaleUpperCase('tr-TR')}</textPath></text>
      </g>
      {[84, 396].map((x) => (
        <path key={x} d={`M${x} 232 L${x + 2.4} 238 L${x + 8} 240 L${x + 2.4} 242 L${x} 248 L${x - 2.4} 242 L${x - 8} 240 L${x - 2.4} 238 Z`} fill={ACCENT} />
      ))}

      {/* Makas (sağa yatık) */}
      <g transform="translate(240 240) rotate(-45)" fill="none" stroke={ACCENT} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
        <path d="M2 -2 L104 -10 Q114 -9 106 -4 L4 4 Z" fill={ACCENT} fillOpacity="0.18" />
        <path d="M2 2 L104 10 Q114 9 106 4 L4 -4 Z" fill={ACCENT} fillOpacity="0.18" />
        <path d="M-2 -3 Q-24 -10 -40 -16" />
        <path d="M-2 3 Q-24 10 -40 16" />
        <ellipse cx="-56" cy="-20" rx="16" ry="11" transform="rotate(-12 -56 -20)" />
        <ellipse cx="-56" cy="20" rx="16" ry="11" transform="rotate(12 -56 20)" />
        <circle r="3.5" fill={ACCENT} />
      </g>

      {/* Açık ustura (sola yatık) */}
      <g transform="translate(240 240) rotate(-135)" fill="none" stroke={ACCENT} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
        <path d="M4 -4 L92 -6 Q112 -6 112 8 Q112 14 100 14 L4 6 Z" fill={ACCENT} fillOpacity="0.18" />
        <path d="M10 -1 L96 -2" strokeOpacity="0.5" strokeWidth="1" />
        <rect x="-112" y="-7" width="110" height="14" rx="7" />
        <path d="M-104 0 L-14 0" strokeOpacity="0.5" strokeWidth="1" />
        <circle cx="-4" cy="0" r="3.5" fill={ACCENT} />
      </g>

      {/* Berber direği */}
      <g stroke={ACCENT} strokeWidth="2" strokeLinejoin="round">
        <circle cx="240" cy="128" r="9" fill={ACCENT} />
        <path d="M222 150 L222 142 Q240 134 258 142 L258 150 Z" fill="rgb(var(--surface))" />
        <rect x="219" y="146" width="42" height="8" rx="2" fill="rgb(var(--surface))" />
        <rect x="227" y="150" width="26" height="180" rx="3" fill="rgb(var(--bg))" />
        <g clipPath={`url(#${id}glass)`} stroke="none">
          {STRIPES.map((y) => <path key={y} d={`M227 ${y} L253 ${y - 18} L253 ${y - 8} L227 ${y + 10} Z`} fill={ACCENT} />)}
          <rect x="231" y="150" width="4" height="180" fill="rgb(var(--fg))" fillOpacity="0.18" />
        </g>
        <rect x="227" y="150" width="26" height="180" rx="3" fill="none" />
        <rect x="219" y="326" width="42" height="8" rx="2" fill="rgb(var(--surface))" />
        <path d="M222 334 L258 334 L258 340 Q240 348 222 340 Z" fill="rgb(var(--surface))" />
        <circle cx="240" cy="352" r="6" fill={ACCENT} />
      </g>
    </svg>
  )
}
