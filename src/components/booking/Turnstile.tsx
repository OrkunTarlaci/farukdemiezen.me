import { useEffect, useRef } from 'react'

// Cloudflare Turnstile pencere öğesi. Site anahtarı GENEL bir değerdir; gizli anahtar yalnızca
// create-booking Edge Function'ındadır. Token tek kullanımlıktır: her gönderimden sonra resetKey artırılır.

interface TurnstileApi {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string
  reset: (id: string) => void
  remove: (id: string) => void
}
declare global {
  interface Window { turnstile?: TurnstileApi }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
let scriptPromise: Promise<TurnstileApi> | null = null

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  scriptPromise ??= new Promise<TurnstileApi>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = SCRIPT_SRC
    s.async = true
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile')))
    s.onerror = () => { scriptPromise = null; s.remove(); reject(new Error('turnstile')) }
    document.head.appendChild(s)
  })
  return scriptPromise
}

interface Props {
  siteKey: string
  /** Geçerli token veya (süre dolduğunda / hata olduğunda) null */
  onToken: (token: string | null) => void
  onError: () => void
  /** Değiştiğinde pencere öğesi sıfırlanır ve yeni token istenir */
  resetKey: number
}

export function Turnstile({ siteKey, onToken, onError, resetKey }: Props) {
  const el = useRef<HTMLDivElement>(null)
  const widgetId = useRef<string | null>(null)
  const cb = useRef({ onToken, onError })
  cb.current = { onToken, onError }

  useEffect(() => {
    let cancelled = false
    loadTurnstile().then(
      (ts) => {
        if (cancelled || !el.current) return
        widgetId.current = ts.render(el.current, {
          sitekey: siteKey,
          action: 'booking',
          language: 'tr',
          theme: 'dark',
          callback: (t: string) => cb.current.onToken(t),
          'expired-callback': () => cb.current.onToken(null),
          'error-callback': () => { cb.current.onToken(null); cb.current.onError() },
        })
      },
      () => { if (!cancelled) cb.current.onError() },
    )
    return () => {
      cancelled = true
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current)
      widgetId.current = null
    }
  }, [siteKey])

  useEffect(() => {
    if (resetKey === 0 || !widgetId.current || !window.turnstile) return
    cb.current.onToken(null)
    window.turnstile.reset(widgetId.current)
  }, [resetKey])

  return <div ref={el} className="min-h-[65px]" />
}
