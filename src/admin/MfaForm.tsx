import { useState, type FormEvent } from 'react'
import { Button } from '../components/ui/Button'
import { ErrorPanel } from '../components/ui/feedback'
import { Field, inputClass } from '../components/ui/Field'

/** Girişin ikinci adımı: telefondaki doğrulama uygulamasının 6 haneli kodu. */
export function MfaForm({ onVerify, onCancel }: { onVerify: (code: string) => Promise<void>; onCancel: () => void }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true); setError(null)
    try {
      await onVerify(code.trim())
    } catch {
      setError('Kod yanlış veya süresi doldu. Uygulamadaki yeni kodu yazın.')
      setCode('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="card mx-auto w-full max-w-sm space-y-5 p-6">
      <div>
        <h1 className="text-xl">Doğrulama kodu</h1>
        <p className="mt-1 text-sm text-muted">Telefonunuzdaki doğrulama uygulamasında görünen 6 haneli kodu yazın.</p>
      </div>
      {error && <ErrorPanel message={error} />}
      <Field id="giris-kod" label="Kod" required>
        {(p) => <input {...p} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className={inputClass} />}
      </Field>
      <Button type="submit" loading={busy} disabled={code.length !== 6} className="w-full">Doğrula</Button>
      <Button variant="ghost" className="w-full" onClick={onCancel}>Çıkış yap</Button>
    </form>
  )
}
