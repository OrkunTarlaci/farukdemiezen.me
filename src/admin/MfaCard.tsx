import { ShieldCheck, ShieldOff } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '../components/ui/Button'
import { ErrorPanel } from '../components/ui/feedback'
import { inputClass } from '../components/ui/Field'
import { removeFactor, startEnroll, verifiedFactorId, verifyCode } from '../lib/mfa'

type Setup = { factorId: string; qrCode: string; secret: string }

/** İki adımlı girişi açma ve kapatma. Kod, Google Authenticator gibi ücretsiz bir uygulamadan gelir. */
export function MfaCard() {
  const [factorId, setFactorId] = useState<string | null | undefined>(undefined)
  const [setup, setSetup] = useState<Setup | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { void verifiedFactorId().then(setFactorId).catch(() => setFactorId(null)) }, [])

  async function run(action: () => Promise<void>, message: string) {
    if (busy) return
    setBusy(true); setError(null)
    try { await action() } catch { setError(message) } finally { setBusy(false) }
  }

  const begin = () => run(async () => { setSetup(await startEnroll()) }, 'Kurulum başlatılamadı. Sayfayı yenileyip tekrar deneyin.')
  const confirm = () => run(async () => {
    if (!setup) return
    await verifyCode(setup.factorId, code.trim())
    setFactorId(setup.factorId); setSetup(null); setCode('')
  }, 'Kod yanlış veya süresi doldu. Uygulamadaki yeni kodu yazın.')
  const remove = () => run(async () => {
    if (factorId) await removeFactor(factorId)
    setFactorId(null)
  }, 'Kapatılamadı. Çıkış yapıp kodla yeniden girin, sonra tekrar deneyin.')

  if (factorId === undefined) return null

  return (
    <section className="card mb-4 p-4 sm:p-5" aria-labelledby="iki-adim">
      <h2 id="iki-adim" className="flex items-center gap-2 text-base">
        {factorId ? <ShieldCheck className="h-4 w-4 text-success" aria-hidden /> : <ShieldOff className="h-4 w-4 text-warning" aria-hidden />}
        İki adımlı giriş
      </h2>

      {factorId && !setup && (
        <>
          <p className="mt-1 text-sm text-muted">Açık. Girişte parolayla birlikte telefondaki kod istenir.</p>
          <Button className="mt-3" variant="ghost" loading={busy} onClick={remove}>Kapat</Button>
        </>
      )}

      {!factorId && !setup && (
        <>
          <p className="mt-1 text-sm text-muted">Parolanız çalınsa bile panele girilemesin. Telefona Google Authenticator gibi ücretsiz bir uygulama kurun.</p>
          <Button className="mt-3 w-full sm:w-auto" loading={busy} onClick={begin}>Aç</Button>
        </>
      )}

      {setup && (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-muted">Uygulamada bu kareyi okutun, sonra gösterilen 6 haneli kodu yazın.</p>
          <img src={setup.qrCode} alt="İki adımlı giriş kare kodu" width={180} height={180} className="rounded-lg bg-white p-2" />
          <p className="break-all text-xs text-muted">Kare kod okunmazsa elle girin: <span className="font-mono text-fg">{setup.secret}</span></p>
          <input aria-label="6 haneli kod" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className={inputClass} />
          <div className="flex flex-wrap gap-2">
            <Button loading={busy} disabled={code.length !== 6} onClick={confirm}>Doğrula ve Aç</Button>
            <Button variant="ghost" disabled={busy} onClick={() => { setSetup(null); setCode('') }}>Vazgeç</Button>
          </div>
        </div>
      )}

      {error && <div className="mt-3"><ErrorPanel message={error} /></div>}
    </section>
  )
}
