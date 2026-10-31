import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Button } from '../../components/ui/Button'
import { ErrorPanel, Spinner, SuccessNote } from '../../components/ui/feedback'
import { Field, inputClass } from '../../components/ui/Field'
import { fetchAdminSettings, fetchSmsStatus, updateSettings } from '../../lib/api'
import { settingsSchema, type SettingsFormValues } from '../../lib/adminValidation'
import { toAppError } from '../../lib/errors'
import type { AdminSettings } from '../../lib/types'
import { useAsync } from '../../lib/useAsync'
import { PageHeader } from '../AdminLayout'

const toForm = (s: AdminSettings): SettingsFormValues => ({
  business_name: s.business_name,
  booking_interval_minutes: String(s.booking_interval_minutes),
  minimum_booking_notice_minutes: String(s.minimum_booking_notice_minutes),
  maximum_booking_horizon_days: String(s.maximum_booking_horizon_days),
  max_active_bookings_per_phone: String(s.max_active_bookings_per_phone),
  address: s.address ?? '',
  contact_phone: s.contact_phone ?? '',
  map_url: s.map_url ?? '',
})

function SettingsForm({ initial }: { initial: AdminSettings }) {
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const { register, handleSubmit, reset, formState: { errors, isSubmitting, isDirty } } = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: toForm(initial),
  })

  const submit = handleSubmit(async (raw) => {
    setError(null); setSaved(false)
    const v = settingsSchema.parse(raw)
    try {
      const result = await updateSettings({
        business_name: v.business_name,
        booking_interval_minutes: v.booking_interval_minutes,
        minimum_booking_notice_minutes: v.minimum_booking_notice_minutes,
        maximum_booking_horizon_days: v.maximum_booking_horizon_days,
        max_active_bookings_per_phone: v.max_active_bookings_per_phone,
        address: v.address || null,
        contact_phone: v.contact_phone || null,
        map_url: v.map_url || null,
      })
      reset(toForm(result)) // ekranda sunucunun kaydettiği değerler görünür
      setSaved(true)
    } catch (e) {
      setError(toAppError(e).message)
    }
  })

  const num = { inputMode: 'numeric' as const, className: inputClass }

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      <section className="card p-5" aria-labelledby="kurallar">
        <h2 id="kurallar" className="text-base">Randevu kuralları</h2>
        <p className="mt-1 text-sm text-muted">Müsait saatler ve yeni rezervasyonlar sunucuda bu kurallarla denetlenir.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field id="st-int" label="Randevu aralığı (dk)" hint="Başlangıç saatleri bu aralıkla listelenir (5–120)." error={errors.booking_interval_minutes?.message}>
            {(p) => <input {...p} {...register('booking_interval_minutes')} {...num} />}
          </Field>
          <Field id="st-notice" label="En az ne kadar önce (dk)" hint="Bu süreden yakın saatler alınamaz (0–10080)." error={errors.minimum_booking_notice_minutes?.message}>
            {(p) => <input {...p} {...register('minimum_booking_notice_minutes')} {...num} />}
          </Field>
          <Field id="st-horizon" label="En fazla kaç gün ilerisi" hint="1–365 gün." error={errors.maximum_booking_horizon_days?.message}>
            {(p) => <input {...p} {...register('maximum_booking_horizon_days')} {...num} />}
          </Field>
          <Field id="st-phone" label="Telefon başına aktif randevu" hint="Aynı numarayla aynı anda en fazla (1–20)." error={errors.max_active_bookings_per_phone?.message}>
            {(p) => <input {...p} {...register('max_active_bookings_per_phone')} {...num} />}
          </Field>
        </div>
      </section>

      <section className="card p-5" aria-labelledby="iletisim">
        <h2 id="iletisim" className="text-base">İşletme ve iletişim</h2>
        <p className="mt-1 text-sm text-muted">Boş bırakılan bilgiler müşteri sitesinde gösterilmez.</p>
        <div className="mt-4 grid gap-4">
          <Field id="st-name" label="İşletme adı" required hint="Sitenin başlığında, logoda ve alt bilgide görünür." error={errors.business_name?.message}>
            {(p) => <input {...p} {...register('business_name')} className={inputClass} />}
          </Field>
          <Field id="st-addr" label="Adres" optionalLabel error={errors.address?.message}>
            {(p) => <textarea {...p} {...register('address')} rows={2} className={inputClass} />}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="st-tel" label="Telefon" optionalLabel error={errors.contact_phone?.message}>
              {(p) => <input {...p} {...register('contact_phone')} type="tel" className={inputClass} />}
            </Field>
            <Field id="st-map" label="Harita bağlantısı" optionalLabel hint="https:// ile başlamalı." error={errors.map_url?.message}>
              {(p) => <input {...p} {...register('map_url')} type="url" className={inputClass} />}
            </Field>
          </div>
        </div>
      </section>

      <section className="card p-5 text-sm" aria-labelledby="sabit">
        <h2 id="sabit" className="text-base">Değiştirilemeyen ayarlar</h2>
        <dl className="mt-3 grid gap-2 sm:grid-cols-2">
          <div><dt className="text-muted">Saat dilimi</dt><dd className="text-fg">{initial.timezone}</dd></div>
          <div><dt className="text-muted">Para birimi</dt><dd className="text-fg">{initial.currency}</dd></div>
        </dl>
        <p className="mt-3 text-xs text-muted">
          Hız sınırları ve KVKK saklama süresi güvenlik nedeniyle panelden değil, yalnızca Supabase SQL Editor'den değiştirilebilir (README).
        </p>
      </section>

      <div className="flex flex-wrap items-center gap-3" aria-live="polite">
        <Button type="submit" loading={isSubmitting} disabled={!isDirty}>Kaydet</Button>
        {saved && !isDirty && <SuccessNote>Ayarlar kaydedildi.</SuccessNote>}
        {error && <div className="w-full"><ErrorPanel message={error} /></div>}
      </div>
    </form>
  )
}

/** SMS sağlayıcısının durumu. Anahtar veya gizli değer gösterilmez; yalnızca yapılandırılmış olup olmadığı. */
function SmsStatusCard() {
  const status = useAsync(fetchSmsStatus, [])
  const s = status.data
  const text = status.loading
    ? 'Kontrol ediliyor…'
    : s === null || s === undefined
      ? 'SMS servisine ulaşılamadı: "send-notifications" fonksiyonu dağıtılmamış olabilir. SMS gönderilmez; randevular etkilenmez.'
      : s.configured
        ? `Etkin — sağlayıcı: ${s.name}.`
        : 'SMS sağlayıcısı henüz yapılandırılmadı. Bildirimler kuyruğa yazılır ve randevu ayrıntısında “Gönderilmedi” olarak görünür; sağlayıcı eklendikten sonra yeniden gönderilebilir.'
  const tone = s?.configured ? 'text-success' : 'text-warning'
  return (
    <section className="card mb-6 p-5 text-sm" aria-labelledby="sms-durum">
      <h2 id="sms-durum" className="text-base">SMS bildirimleri</h2>
      <p className={`mt-2 ${status.loading ? 'text-muted' : tone}`} role="status">{text}</p>
      <p className="mt-2 text-xs text-muted">Gönderilen mesajlar yalnızca randevu bilgilendirmesidir (talep alındı, onay, iptal, yeniden planlama); pazarlama içermez.</p>
    </section>
  )
}

export function SettingsPage() {
  const settings = useAsync(fetchAdminSettings, [])
  return (
    <div>
      <PageHeader title="Ayarlar" description="Değişiklikler kaydedildiği anda müşteri sitesine yansır." />
      <SmsStatusCard />
      {settings.loading && <Spinner label="Ayarlar yükleniyor…" />}
      {settings.error && <ErrorPanel message={settings.error.message} onRetry={settings.reload} />}
      {settings.data && <SettingsForm initial={settings.data} />}
    </div>
  )
}
