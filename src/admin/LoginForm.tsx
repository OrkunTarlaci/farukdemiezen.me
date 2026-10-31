import { useState, type FormEvent } from 'react'
import { toAppError } from '../lib/errors'
import { Button } from '../components/ui/Button'
import { Field, inputClass } from '../components/ui/Field'
import { ErrorPanel } from '../components/ui/feedback'

export function LoginForm({ onSignIn }: { onSignIn: (email: string, password: string) => Promise<void> }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password) { setError('E-posta ve parola gerekli.'); return }
    setBusy(true)
    setError(null)
    try {
      await onSignIn(email.trim(), password)
    } catch (err) {
      setError(toAppError(err).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="card mx-auto w-full max-w-sm space-y-5 p-6">
      <div>
        <h1 className="text-xl">Yönetici girişi</h1>
        <p className="mt-1 text-sm text-muted">Randevuları yönetmek için giriş yapın.</p>
      </div>
      {error && <ErrorPanel message={error} />}
      <Field id="giris-eposta" label="E-posta" required>
        {(p) => <input {...p} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />}
      </Field>
      <Field id="giris-parola" label="Parola" required>
        {(p) => <input {...p} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />}
      </Field>
      <Button type="submit" loading={busy} className="w-full">Giriş Yap</Button>
    </form>
  )
}
