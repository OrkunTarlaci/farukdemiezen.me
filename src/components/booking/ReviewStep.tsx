import { useCallback, useRef, useState } from 'react'
import { AppError, SLOT_ERROR_CODES, toAppError } from '../../lib/errors'
import { createAppointment, fetchAvailableSlots } from '../../lib/api'
import { formatTrPhone, normalizeTrPhone } from '../../lib/phone'
import { turnstileSiteKey } from '../../lib/supabase'
import { dateOfInstant, formatDateLong, formatDuration, formatPrice, timeOfInstant } from '../../lib/time'
import type { BookingResult, BusinessSettings, Service } from '../../lib/types'
import type { CustomerFormValues } from '../../lib/validation'
import { Button } from '../ui/Button'
import { ErrorPanel } from '../ui/feedback'
import { PrivacyLink } from '../site/PrivacyNotice'
import { Turnstile } from './Turnstile'

interface Props {
  service: Service
  settings: BusinessSettings
  slot: string
  customer: CustomerFormValues
  onSuccess: (r: BookingResult) => void
  onPickAnotherTime: () => void
}

export function ReviewStep({ service, settings, slot, customer, onSuccess, onPickAnotherTime }: Props) {
  const [submitting, setSubmitting] = useState(false)
  // Durum güncellenmeden önce gelen ikinci tıklamayı da engeller (çift gönderim koruması).
  const inFlight = useRef(false)
  const [error, setError] = useState<AppError | null>(null)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [captchaResetKey, setCaptchaResetKey] = useState(0)
  const [captchaLoadFailed, setCaptchaLoadFailed] = useState(false)
  const onToken = useCallback((t: string | null) => { setCaptchaToken(t); if (t) setCaptchaLoadFailed(false) }, [])
  const onCaptchaError = useCallback(() => setCaptchaLoadFailed(true), [])
  const price = formatPrice(service.price_minor, settings.currency)
  const phone = normalizeTrPhone(customer.phone)

  async function confirm() {
    if (inFlight.current) return
    if (!captchaToken) { setError(new AppError('captcha_required')); return }
    inFlight.current = true
    setSubmitting(true)
    setError(null)
    try {
      // Kaydetmeden önce müsaitliği yeniden doğrula (kesin kontrol yine de sunucuda yapılır).
      const slots = await fetchAvailableSlots(dateOfInstant(slot), service.id)
      if (!slots.includes(slot)) throw new AppError('slot_unavailable')
      const result = await createAppointment({
        serviceId: service.id,
        startsAt: slot,
        firstName: customer.firstName.trim(),
        lastName: customer.lastName.trim(),
        phone: customer.phone,
        email: customer.email.trim(),
        note: customer.note.trim(),
        captchaToken,
      })
      onSuccess(result) // yalnızca sunucu onayından sonra
    } catch (e) {
      setError(toAppError(e))
      // Token tek kullanımlıktır (sunucuya ulaşmış olabilir): yeni doğrulama iste.
      setCaptchaResetKey((k) => k + 1)
    } finally {
      inFlight.current = false
      setSubmitting(false)
    }
  }

  const rows: [string, string][] = [
    ['Hizmet', service.name],
    ['Tarih', formatDateLong(dateOfInstant(slot))],
    ['Saat', timeOfInstant(slot)],
    ['Süre', formatDuration(service.duration_minutes)],
    ['Fiyat', price ?? 'Fiyat için sorunuz'],
    ['Ad Soyad', `${customer.firstName.trim()} ${customer.lastName.trim()}`],
    ['Telefon', phone ? formatTrPhone(phone) : customer.phone],
  ]

  return (
    <div className="max-w-xl">
      <dl className="overflow-hidden rounded-lg border border-line">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[6.5rem_1fr] gap-4 border-b border-line px-4 py-3 text-sm last:border-b-0">
            <dt className="text-muted">{k}</dt>
            <dd className="font-medium text-fg">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-6">
        <p className="mb-2 text-sm font-medium">Güvenlik doğrulaması</p>
        {turnstileSiteKey
          ? <Turnstile siteKey={turnstileSiteKey} onToken={onToken} onError={onCaptchaError} resetKey={captchaResetKey} />
          : <ErrorPanel message={new AppError('captcha_not_configured').message} />}
        {captchaLoadFailed && <div className="mt-3"><ErrorPanel message={new AppError('captcha_load_failed').message} /></div>}
      </div>

      <p className="mt-4 text-xs text-muted">
        Kişisel verilerinizin nasıl işlendiğini öğrenmek için: <PrivacyLink />
      </p>

      {error && (
        <div className="mt-5 space-y-3">
          <ErrorPanel message={error.message} />
          {SLOT_ERROR_CODES.has(error.code) && (
            <Button variant="secondary" onClick={onPickAnotherTime}>Başka saat seç</Button>
          )}
        </div>
      )}

      <Button size="lg" className="mt-6 w-full sm:w-auto" loading={submitting} disabled={!captchaToken} onClick={confirm}>
        {submitting ? 'Kaydediliyor…' : 'Randevuyu Onayla'}
      </Button>
    </div>
  )
}
