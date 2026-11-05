import { Bell, BellOff } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '../components/ui/Button'
import { ErrorPanel } from '../components/ui/feedback'
import { toAppError } from '../lib/errors'
import { disablePush, enablePush, getPushState, showTestNotification, type PushState } from '../lib/push'

/**
 * Yeni randevu bildirimini bu telefonda açma. `hideWhenOn`: Ana Sayfa'da yalnızca açık değilken görünür;
 * Ayarlar'da her zaman görünür ve kapatılabilir.
 */
export function PushCard({ hideWhenOn = false }: { hideWhenOn?: boolean }) {
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { void getPushState().then(setState).catch(() => setState('unsupported')) }, [])

  async function run(action: () => Promise<PushState | void>) {
    if (busy) return
    setBusy(true); setError(null)
    try {
      const next = await action()
      if (next) setState(next)
    } catch (e) {
      setError(toAppError(e).message)
    } finally {
      setBusy(false)
    }
  }

  if (state === null || (hideWhenOn && (state === 'on' || state === 'unsupported'))) return null

  return (
    <section className="card mb-4 p-4 sm:p-5" aria-labelledby="bildirim">
      <h2 id="bildirim" className="flex items-center gap-2 text-base">
        {state === 'on' ? <Bell className="h-4 w-4 text-success" aria-hidden /> : <BellOff className="h-4 w-4 text-accent" aria-hidden />}
        Yeni randevu bildirimi
      </h2>

      {state === 'off' && (
        <>
          <p className="mt-1 text-sm text-muted">Yeni randevu gelince bu telefona bildirim gelsin.</p>
          <Button className="mt-3 w-full sm:w-auto" loading={busy} onClick={() => run(enablePush)}>Bildirimleri Aç</Button>
        </>
      )}

      {state === 'on' && (
        <>
          <p className="mt-1 text-sm text-muted">Bu telefonda açık.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" disabled={busy} onClick={() => run(showTestNotification)}>Deneme Gönder</Button>
            <Button variant="ghost" loading={busy} onClick={() => run(disablePush)}>Kapat</Button>
          </div>
        </>
      )}

      {state === 'install_first' && (
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted">
          <li>Safari'de alttaki <strong className="text-fg">Paylaş</strong> düğmesine dokunun.</li>
          <li><strong className="text-fg">Ana Ekrana Ekle</strong>'yi seçin.</li>
          <li>Ana ekrandaki <strong className="text-fg">Panel</strong> simgesinden girin ve buradan bildirimi açın.</li>
        </ol>
      )}

      {state === 'denied' && (
        <p className="mt-1 text-sm text-muted">Bildirim izni kapalı. Telefonun ayarlarından bu site için bildirimlere izin verip sayfayı yenileyin.</p>
      )}

      {state === 'unsupported' && (
        <p className="mt-1 text-sm text-muted">Bu tarayıcı bildirimi desteklemiyor. Telefonda Chrome veya Safari ile deneyin.</p>
      )}

      {error && <div className="mt-3"><ErrorPanel message={error} /></div>}
    </section>
  )
}
