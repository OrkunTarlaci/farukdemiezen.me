import { Check, Copy, Phone } from 'lucide-react'
import { useState } from 'react'
import { formatTrPhone } from '../lib/phone'

/** Telefon: okunaklı biçim, tek dokunuşla arama ve kopyalama. */
export function PhoneCell({ e164 }: { e164: string }) {
  const [copied, setCopied] = useState(false)
  const pretty = formatTrPhone(e164)

  async function copy() {
    try {
      await navigator.clipboard.writeText(pretty)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = pretty
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <span className="inline-flex items-center gap-1">
      <a
        href={`tel:${e164}`}
        className="inline-flex min-h-[2.75rem] items-center gap-1.5 rounded-md font-mono text-sm tabular-nums text-fg underline-offset-4 hover:underline"
        aria-label={`${pretty} numarasını ara`}
      >
        <Phone className="h-3.5 w-3.5 text-muted" aria-hidden />
        {pretty}
      </a>
      <button
        type="button"
        onClick={copy}
        className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-muted hover:bg-raised hover:text-fg"
        aria-label={copied ? 'Telefon numarası kopyalandı' : `${pretty} numarasını kopyala`}
      >
        {copied ? <Check className="h-4 w-4 text-success" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
      </button>
      <span role="status" className="sr-only">{copied ? 'Kopyalandı' : ''}</span>
    </span>
  )
}
