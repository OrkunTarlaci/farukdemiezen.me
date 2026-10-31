import { lazy, Suspense, useCallback } from 'react'
import { AppError } from '../../lib/errors'
import { turnstileSiteKey } from '../../lib/supabase'
import { resolveVerificationMode, type VerificationResult } from '../../lib/verification'
import { ErrorPanel, Notice, Spinner } from '../ui/feedback'
import { Turnstile } from './Turnstile'

export const verificationMode = resolveVerificationMode(turnstileSiteKey, import.meta.env.DEV)

// Geçici görsel test yalnızca geliştirmede yüklenir. import.meta.env.DEV üretimde sabit "false" olduğu için
// bu içe aktarma üretim derlemesinden tamamen çıkarılır.
const VisualChallenge = import.meta.env.DEV ? lazy(() => import('./VisualChallenge')) : null

interface Props {
  onResult: (r: VerificationResult | null) => void
  onLoadError: () => void
  resetKey: number
}

/**
 * Onay ekranındaki güvenlik doğrulaması. Moda göre gerçek Turnstile, geçici görsel test (yalnızca
 * geliştirme) veya dürüst bir "şu an kullanılamıyor" mesajı gösterir. Turnstile eklendiğinde bileşenin
 * dışı değişmez; ReviewStep yalnızca VerificationResult ile çalışır.
 */
export function SecurityCheck({ onResult, onLoadError, resetKey }: Props) {
  const onToken = useCallback((t: string | null) => onResult(t ? { kind: 'token', token: t } : null), [onResult])
  const onLocal = useCallback((ok: boolean) => onResult(ok ? { kind: 'local' } : null), [onResult])

  if (verificationMode === 'turnstile' && turnstileSiteKey) {
    return <Turnstile siteKey={turnstileSiteKey} onToken={onToken} onError={onLoadError} resetKey={resetKey} />
  }

  if (verificationMode === 'dev-visual' && VisualChallenge) {
    return (
      <div className="space-y-3">
        <Suspense fallback={<Spinner label="Doğrulama yükleniyor…" />}>
          <VisualChallenge onVerifiedChange={onLocal} resetKey={resetKey} />
        </Suspense>
        <Notice>
          <strong>Geliştirme modu.</strong> Turnstile yapılandırılmadığı için yalnızca arayüzü denemeye yarayan geçici bir test
          gösteriliyor. Bu test sunucuya güvenlik belgesi göndermez; sunucu gerçek doğrulama istediği için{' '}
          <strong>randevu kaydedilmez</strong>.
        </Notice>
      </div>
    )
  }

  return <ErrorPanel message={new AppError('captcha_not_configured').message} />
}
