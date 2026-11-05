import { useState, type FormEvent } from 'react'
import { Button } from '../components/ui/Button'
import { ErrorPanel } from '../components/ui/feedback'
import { Field, inputClass } from '../components/ui/Field'

const MIN_LENGTH = 12

/** Davet veya parola sıfırlama bağlantısından sonra kişi parolasını kendisi belirler. */
export function SetPasswordForm({ onSave }: { onSave: (password: string) => Promise<void> }) {
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    if (password.length < MIN_LENGTH) { setError(`Parola en az ${MIN_LENGTH} karakter olmalı.`); return }
    if (password !== repeat) { setError('İki parola aynı değil.'); return }
    setBusy(true); setError(null)
    try {
      await onSave(password)
    } catch {
      setError('Parola kaydedilemedi. Başka bir parola deneyin; olmazsa bağlantıyı yeniden isteyin.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="card mx-auto w-full max-w-sm space-y-5 p-6">
      <div>
        <h1 className="text-xl">Parolanızı belirleyin</h1>
        <p className="mt-1 text-sm text-muted">Bu parolayı yalnızca siz bilirsiniz; kimseyle paylaşmayın.</p>
      </div>
      {error && <ErrorPanel message={error} />}
      <Field id="yeni-parola" label="Yeni parola" required hint={`En az ${MIN_LENGTH} karakter`}>
        {(p) => <input {...p} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />}
      </Field>
      <Field id="yeni-parola-2" label="Yeni parola (tekrar)" required>
        {(p) => <input {...p} type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} className={inputClass} />}
      </Field>
      <Button type="submit" loading={busy} className="w-full">Kaydet</Button>
    </form>
  )
}
