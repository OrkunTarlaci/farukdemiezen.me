import { ArrowLeft, ArrowRight, CalendarDays, Check, Clock, Scissors } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchAvailableDates } from '../../lib/api'
import { addDays, dateOfInstant, formatDateLong, formatDateShort, formatDuration, formatPrice, timeOfInstant } from '../../lib/time'
import { useIstanbulToday } from '../../lib/useToday'
import type { SiteData } from '../../lib/siteData'
import type { BookingResult, Service } from '../../lib/types'
import { useAsync } from '../../lib/useAsync'
import type { CustomerFormValues } from '../../lib/validation'
import { Button } from '../ui/Button'
import { ErrorPanel, Spinner } from '../ui/feedback'
import { Calendar } from './Calendar'
import { DETAILS_FORM_ID, loadDetailsStep } from './constants'
import { ReviewStep } from './ReviewStep'
import { Success } from './Success'
import { TimeStep } from './TimeStep'

const DetailsStep = lazy(() => loadDetailsStep().then((m) => ({ default: m.DetailsStep })))

const STEPS = ['Hizmet', 'Tarih', 'Saat', 'Bilgiler', 'Onay'] as const
const EMPTY: CustomerFormValues = { firstName: '', lastName: '', phone: '', email: '', note: '' }

interface Props {
  site: SiteData
  preselect: { serviceId: string; nonce: number } | null
}

function Stepper({ step, onGo }: { step: number; onGo: (n: number) => void }) {
  return (
    <ol className="grid grid-cols-5" aria-label="Randevu adımları">
      {STEPS.map((label, i) => {
        const n = i + 1
        const done = n < step
        const current = n === step
        return (
          <li key={label} aria-current={current ? 'step' : undefined} className="relative flex justify-center">
            {i > 0 && (
              <span
                className={`absolute right-1/2 top-[1.375rem] h-px w-full -translate-y-1/2 ${n <= step ? 'bg-accent/60' : 'bg-line'}`}
                aria-hidden
              />
            )}
            <button
              type="button"
              disabled={!done}
              onClick={() => onGo(n)}
              className="relative flex min-h-[2.75rem] flex-col items-center gap-1.5 rounded-lg px-1 disabled:cursor-default"
            >
              <span
                className={[
                  'relative z-10 mt-[0.625rem] flex h-6 w-6 items-center justify-center rounded-full border text-xs font-semibold transition-colors',
                  current ? 'border-accent bg-accent text-accent-fg' : done ? 'border-accent bg-bg text-accent' : 'border-line bg-bg text-subtle',
                ].join(' ')}
                aria-hidden
              >
                {done ? <Check className="h-3.5 w-3.5" /> : n}
              </span>
              <span className={`text-xs ${current ? 'font-medium text-fg' : done ? 'text-muted' : 'text-subtle'}`}>{label}</span>
              {done && <span className="sr-only"> (tamamlandı, düzenlemek için seçin)</span>}
            </button>
          </li>
        )
      })}
    </ol>
  )
}

function Summary({ service, date, slot, currency }: { service?: Service; date?: string; slot?: string; currency: string }) {
  const price = service ? formatPrice(service.price_minor, currency) : null
  const rows: [React.ReactNode, string, string | null][] = [
    [<Scissors key="s" className="h-4 w-4" />, 'Hizmet', service ? `${service.name} · ${formatDuration(service.duration_minutes)}` : null],
    [<CalendarDays key="d" className="h-4 w-4" />, 'Tarih', date ? formatDateLong(date) : null],
    [<Clock key="t" className="h-4 w-4" />, 'Saat', slot ? timeOfInstant(slot) : null],
  ]
  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold">Randevu özeti</h3>
      <dl className="mt-4 space-y-3 text-sm">
        {rows.map(([icon, k, v]) => (
          <div key={k}>
            <dt className="flex items-center gap-2 text-xs text-subtle"><span aria-hidden>{icon}</span>{k}</dt>
            <dd className={`mt-0.5 pl-6 ${v ? 'text-fg' : 'text-subtle'}`}>{v ?? 'Seçilmedi'}</dd>
          </div>
        ))}
      </dl>
      {service && (
        <p className="mt-4 flex items-baseline justify-between border-t border-line pt-4 text-sm">
          <span className="text-muted">Fiyat</span>
          <span className={price ? 'text-base font-semibold text-fg' : 'text-muted'}>{price ?? 'Fiyat için sorunuz'}</span>
        </p>
      )}
    </div>
  )
}

export function BookingFlow({ site, preselect }: Props) {
  const { services, settings } = site
  const [step, setStep] = useState(1)
  const [serviceId, setServiceId] = useState<string>()
  const [date, setDate] = useState<string>()
  const [slot, setSlot] = useState<string>()
  const [customer, setCustomer] = useState<CustomerFormValues>(EMPTY)
  const [result, setResult] = useState<BookingResult>()

  const service = services.find((s) => s.id === serviceId)
  // Takvimin sınırları için; kesin denetim (geçmiş saat, bildirim süresi) sunucu saatiyle yapılır.
  const today = useIstanbulToday()
  const maxDate = addDays(today, settings.maximum_booking_horizon_days)

  // "Randevu Al" ile belirli bir hizmetten gelindiyse seçimi taşı
  useEffect(() => {
    if (!preselect) return
    setServiceId(preselect.serviceId)
    setDate(undefined)
    setSlot(undefined)
    setResult(undefined)
    setStep(2)
  }, [preselect])

  // Adım değişince içerik kısalabilir; kartın başı ekran dışında kaldıysa kartı görünür alana getir.
  const cardRef = useRef<HTMLDivElement>(null)
  const firstStep = useRef(true)
  useEffect(() => {
    if (firstStep.current) { firstStep.current = false; return }
    const el = cardRef.current
    if (!el || el.getBoundingClientRect().top >= 64) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  }, [step])

  // Bilgiler adımının kodunu saat seçilirken önceden getir
  useEffect(() => { if (step === 3) void loadDetailsStep() }, [step])

  const dates = useAsync(
    () => fetchAvailableDates(serviceId as string, today, maxDate),
    [serviceId, today, maxDate],
    Boolean(serviceId) && step === 2,
  )
  const available = useMemo(() => new Set(dates.data ?? []), [dates.data])

  const chooseService = (id: string) => { setServiceId(id); setDate(undefined); setSlot(undefined) }
  const chooseDate = (d: string) => { setDate(d); setSlot(undefined) }
  const onSlot = useCallback((s: string | undefined) => setSlot(s), [])

  const reset = () => {
    setStep(1); setServiceId(undefined); setDate(undefined); setSlot(undefined); setCustomer(EMPTY); setResult(undefined)
  }

  if (result) return <Success result={result} settings={settings} onNew={reset} />

  const canContinue = (step === 1 && serviceId) || (step === 2 && date) || (step === 3 && slot)
  const mobileSummary = [service?.name, date ? formatDateShort(date) : null, slot ? timeOfInstant(slot) : null].filter(Boolean).join(' · ')

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start">
      <div ref={cardRef} className="card scroll-mt-20 overflow-hidden">
        <div className="border-b border-line px-3 pb-3 pt-1 sm:px-6">
          <Stepper step={step} onGo={setStep} />
        </div>
        {step > 1 && mobileSummary && (
          <p className="border-b border-line bg-raised/50 px-4 py-2.5 text-xs text-muted lg:hidden">
            <span className="text-subtle">Seçiminiz: </span><span className="text-fg">{mobileSummary}</span>
          </p>
        )}

        <div className="p-4 sm:p-6" aria-live="polite">
          {step === 1 && (
            <fieldset>
              <legend className="text-lg font-semibold">Hizmet seçin</legend>
              <p className="mb-4 mt-1 text-sm text-muted">Randevu almak istediğiniz hizmeti seçin.</p>
              <div className="grid gap-2">
                {services.map((s) => {
                  const selected = s.id === serviceId
                  const price = formatPrice(s.price_minor, settings.currency)
                  return (
                    <label
                      key={s.id}
                      className={[
                        'flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors sm:p-4',
                        'has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent',
                        selected ? 'border-accent/70 bg-accent/[0.07]' : 'border-line hover:border-fg/25 hover:bg-raised/60',
                      ].join(' ')}
                    >
                      <input type="radio" name="hizmet" value={s.id} checked={selected} onChange={() => chooseService(s.id)} className="sr-only" />
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line bg-raised text-accent" aria-hidden>
                        <Scissors className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-fg">{s.name}</span>
                        <span className="mt-0.5 flex items-center gap-1 text-xs text-muted">
                          <Clock className="h-3.5 w-3.5" aria-hidden />{formatDuration(s.duration_minutes)}
                        </span>
                      </span>
                      <span className={price ? 'text-sm font-semibold text-fg' : 'text-xs text-muted'}>{price ?? 'Fiyat için sorunuz'}</span>
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${selected ? 'border-accent bg-accent text-accent-fg' : 'border-line'}`}
                        aria-hidden
                      >
                        {selected && <Check className="h-3.5 w-3.5" />}
                      </span>
                    </label>
                  )
                })}
              </div>
            </fieldset>
          )}

          {step === 2 && serviceId && (
            <div>
              <h3 className="mb-4 text-lg">Tarih seçin</h3>
              {dates.error && <ErrorPanel message={dates.error.message} onRetry={dates.reload} />}
              {!dates.error && (
                <Calendar today={today} maxDate={maxDate} available={available} value={date} loading={dates.loading} onSelect={chooseDate} />
              )}
            </div>
          )}

          {step === 3 && serviceId && date && (
            <div>
              <h3 className="mb-1 text-lg">Saat seçin</h3>
              <TimeStep date={date} serviceId={serviceId} value={slot} onSelect={onSlot} />
            </div>
          )}

          {step === 4 && (
            <div>
              <h3 className="mb-4 text-lg">Bilgileriniz</h3>
              <Suspense fallback={<Spinner label="Form yükleniyor…" />}>
                <DetailsStep values={customer} onSubmit={(v) => { setCustomer(v); setStep(5) }} />
              </Suspense>
            </div>
          )}

          {step === 5 && service && slot && (
            <div>
              <h3 className="mb-4 text-lg">Randevunuzu kontrol edin</h3>
              <ReviewStep
                service={service}
                settings={settings}
                slot={slot}
                customer={customer}
                onSuccess={setResult}
                onPickAnotherTime={() => { setSlot(undefined); setStep(3) }}
              />
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-line p-4 sm:px-6">
          {step > 1 && (
            <Button variant="ghost" onClick={() => setStep(step === 5 ? 4 : step - 1)} icon={<ArrowLeft className="h-4 w-4" aria-hidden />}>
              {step === 5 ? 'Bilgileri düzenle' : 'Geri'}
            </Button>
          )}
          {step < 4 && (
            <Button className="ml-auto w-full max-w-[14rem] sm:w-auto" disabled={!canContinue} onClick={() => setStep(step + 1)}>
              Devam Et <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
          )}
          {step === 4 && (
            <Button type="submit" form={DETAILS_FORM_ID} className="ml-auto w-full max-w-[14rem] sm:w-auto">
              Devam Et <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
          )}
        </div>
      </div>

      <aside className="hidden lg:sticky lg:top-24 lg:block" aria-label="Randevu özeti">
        <Summary service={service} date={date ?? (slot ? dateOfInstant(slot) : undefined)} slot={slot} currency={settings.currency} />
      </aside>
    </div>
  )
}
