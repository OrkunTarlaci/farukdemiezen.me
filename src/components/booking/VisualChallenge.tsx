import { Armchair, Brush, Check, Clock, Coffee, Glasses, Key, RefreshCw, ShieldCheck, Umbrella, Scissors, type LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import {
  CATEGORY_LABELS, generateChallenge, isCorrectSelection, type Challenge, type ChallengeCategory,
} from '../../lib/visualChallenge'

// GEÇİCİ, YALNIZCA GELİŞTİRME: Görsel seçme testi. Tarayıcıda çalışır, güvenlik sağlamaz ve sunucuya
// hiçbir belge göndermez. Bu dosya yalnızca import.meta.env.DEV iken yüklenir; üretim derlemesine girmez.
// Görseller projedeki ikon setinden (lucide-react) çizilir; harici görsel servisi kullanılmaz.

const ICONS: Record<ChallengeCategory, LucideIcon> = {
  scissors: Scissors, armchair: Armchair, clock: Clock, coffee: Coffee,
  key: Key, umbrella: Umbrella, brush: Brush, glasses: Glasses,
}

function ChallengeDialog({ open, onClose, onPassed }: { open: boolean; onClose: () => void; onPassed: () => void }) {
  const [challenge, setChallenge] = useState<Challenge>(() => generateChallenge())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  const renew = (message: string | null) => {
    setChallenge(generateChallenge())
    setSelected(new Set())
    setError(message)
  }

  // Her açılışta yeni görseller
  useEffect(() => { if (open) renew(null) }, [open])

  const toggle = (id: string) => {
    setError(null)
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const verify = () => {
    if (isCorrectSelection(challenge, selected)) onPassed()
    else renew('Seçiminiz doğru değil. Yeni görsellerle tekrar deneyin.')
  }

  // Ok tuşlarıyla ızgarada gezinme (3 sütun)
  const onGridKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const keys: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 3, ArrowUp: -3 }
    if (!(e.key in keys)) return
    const buttons = [...(gridRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])]
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement)
    if (i < 0) return
    const next = buttons[i + keys[e.key]]
    if (next) { e.preventDefault(); next.focus() }
  }

  const label = CATEGORY_LABELS[challenge.target]

  return (
    <Dialog open={open} onClose={onClose} title="Robot olmadığınızı doğrulayın">
      <p className="rounded-lg border border-accent/40 bg-accent/[0.08] px-3 py-2.5 text-sm text-fg" id="challenge-prompt">
        <strong className="font-semibold">{label.prompt}</strong> bulunan tüm görselleri seçin.
        <span className="mt-0.5 block text-xs text-muted">Seçtikten sonra “Doğrula”ya basın. Ok tuşlarıyla gezinip boşluk tuşuyla seçebilirsiniz.</span>
      </p>

      <div
        ref={gridRef}
        role="group"
        aria-labelledby="challenge-prompt"
        onKeyDown={onGridKey}
        className="mx-auto mt-4 grid max-w-xs grid-cols-3 gap-2 sm:max-w-sm"
      >
        {challenge.tiles.map((t, i) => {
          const Icon = ICONS[t.category]
          const on = selected.has(t.id)
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={on}
              aria-label={`Görsel ${i + 1}: ${CATEGORY_LABELS[t.category].name}`}
              onClick={() => toggle(t.id)}
              className={[
                'relative flex aspect-square items-center justify-center overflow-hidden rounded-lg border bg-raised transition-[border-color,transform] duration-150',
                on ? 'scale-[0.94] border-accent' : 'border-line hover:border-fg/30',
              ].join(' ')}
            >
              <span
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgb(var(--accent)/0.12),transparent_60%)]"
                aria-hidden
              />
              <Icon
                aria-hidden
                strokeWidth={1.5}
                className={on ? 'text-accent' : 'text-fg/80'}
                style={{ width: '46%', height: '46%', transform: `rotate(${t.rotate}deg) scale(${t.scale})` }}
              />
              {on && (
                <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-accent-fg" aria-hidden>
                  <Check className="h-3.5 w-3.5" />
                </span>
              )}
            </button>
          )
        })}
      </div>

      <p className="sr-only" aria-live="polite">{selected.size} görsel seçildi</p>
      {error && <p role="alert" className="mt-3 text-center text-sm text-danger">{error}</p>}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <Button variant="ghost" size="sm" onClick={() => renew(null)} icon={<RefreshCw className="h-4 w-4" aria-hidden />}>
          Yeni görseller
        </Button>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>Vazgeç</Button>
          <Button onClick={verify} disabled={selected.size === 0}>Doğrula</Button>
        </div>
      </div>
      <p className="mt-3 text-[0.7rem] text-subtle">Geliştirme modu: bu test geçicidir ve gerçek bir CAPTCHA değildir.</p>
    </Dialog>
  )
}

interface Props {
  /** true: test geçildi (yalnızca tarayıcıda), false: sıfırlandı */
  onVerifiedChange: (verified: boolean) => void
  /** Değiştiğinde test sıfırlanır (ör. gönderim denemesinden sonra) */
  resetKey: number
}

export default function VisualChallenge({ onVerifiedChange, resetKey }: Props) {
  const [open, setOpen] = useState(false)
  const [verified, setVerified] = useState(false)
  const cb = useRef(onVerifiedChange)
  cb.current = onVerifiedChange

  useEffect(() => {
    if (resetKey === 0) return
    setVerified(false)
    cb.current(false)
  }, [resetKey])

  return (
    <div>
      <button
        type="button"
        aria-haspopup="dialog"
        disabled={verified}
        onClick={() => setOpen(true)}
        className={[
          'flex w-full max-w-sm items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors',
          verified ? 'cursor-default border-success/50 bg-success/[0.07]' : 'border-line bg-bg hover:border-fg/30',
        ].join(' ')}
      >
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${verified ? 'border-success bg-success text-bg' : 'border-fg/40'}`}
          aria-hidden
        >
          {verified && <Check className="h-4 w-4" />}
        </span>
        <span className="flex-1">
          <span className={`block text-sm font-medium ${verified ? 'text-success' : 'text-fg'}`}>
            {verified ? 'Doğrulama tamamlandı' : 'Robot olmadığımı doğrula'}
          </span>
          <span className="block text-xs text-subtle">Geliştirme modu · geçici test</span>
        </span>
        <ShieldCheck className="h-5 w-5 shrink-0 text-subtle" aria-hidden />
      </button>
      <p className="sr-only" aria-live="polite">{verified ? 'Doğrulama tamamlandı' : ''}</p>

      <ChallengeDialog
        open={open}
        onClose={() => setOpen(false)}
        onPassed={() => { setOpen(false); setVerified(true); cb.current(true) }}
      />
    </div>
  )
}
