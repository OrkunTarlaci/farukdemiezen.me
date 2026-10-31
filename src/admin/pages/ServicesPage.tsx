import { zodResolver } from '@hookform/resolvers/zod'
import { Clock, Pencil, Plus } from 'lucide-react'
import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { EmptyState, ErrorPanel, Spinner, SuccessNote } from '../../components/ui/feedback'
import { Field, inputClass } from '../../components/ui/Field'
import { createService, fetchAllServices, updateService } from '../../lib/api'
import { minorToPriceInput, parsePriceToMinor, serviceSchema, type ServiceFormValues } from '../../lib/adminValidation'
import { toAppError } from '../../lib/errors'
import { formatDuration, formatPrice } from '../../lib/time'
import type { Service } from '../../lib/types'
import { useAsync } from '../../lib/useAsync'
import { PageHeader } from '../AdminLayout'

function ServiceForm({ initial, onSaved, onCancel }: { initial: Service | null; onSaved: (s: Service) => void; onCancel: () => void }) {
  const [error, setError] = useState<string | null>(null)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<ServiceFormValues>({
    resolver: zodResolver(serviceSchema),
    defaultValues: {
      name: initial?.name ?? '',
      description: initial?.description ?? '',
      duration_minutes: String(initial?.duration_minutes ?? 30),
      price: minorToPriceInput(initial?.price_minor ?? null),
      sort_order: String(initial?.sort_order ?? 0),
      is_active: initial?.is_active ?? true,
    },
  })

  const submit = handleSubmit(async (raw) => {
    setError(null)
    const v = serviceSchema.parse(raw)
    const input = {
      name: v.name,
      description: v.description || null,
      duration_minutes: v.duration_minutes,
      price_minor: parsePriceToMinor(v.price),
      sort_order: v.sort_order,
      is_active: v.is_active,
    }
    try {
      onSaved(initial ? await updateService(initial.id, input) : await createService(input))
    } catch (e) {
      setError(toAppError(e).message)
    }
  })

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Field id="svc-name" label="Hizmet adı" required error={errors.name?.message}>
        {(p) => <input {...p} {...register('name')} className={inputClass} />}
      </Field>
      <Field id="svc-desc" label="Kısa açıklama" optionalLabel error={errors.description?.message}>
        {(p) => <textarea {...p} {...register('description')} rows={2} className={inputClass} />}
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="svc-dur" label="Süre (dk)" required error={errors.duration_minutes?.message}>
          {(p) => <input {...p} {...register('duration_minutes')} inputMode="numeric" className={inputClass} />}
        </Field>
        <Field id="svc-price" label="Fiyat (₺)" hint="Boş: “Fiyat için sorunuz”" error={errors.price?.message}>
          {(p) => <input {...p} {...register('price')} inputMode="decimal" placeholder="örn. 350" className={inputClass} />}
        </Field>
        <Field id="svc-sort" label="Sıra" required error={errors.sort_order?.message}>
          {(p) => <input {...p} {...register('sort_order')} inputMode="numeric" className={inputClass} />}
        </Field>
      </div>
      <label className="flex min-h-[2.75rem] items-center gap-3 text-sm">
        <input type="checkbox" {...register('is_active')} className="h-4 w-4 accent-[rgb(var(--accent))]" />
        Müşteri sitesinde göster ve randevuya aç
      </label>
      {error && <ErrorPanel message={error} />}
      <div className="flex flex-wrap gap-3 pt-1">
        <Button type="submit" loading={isSubmitting}>{initial ? 'Değişiklikleri kaydet' : 'Hizmeti ekle'}</Button>
        <Button variant="ghost" onClick={onCancel} disabled={isSubmitting}>Vazgeç</Button>
      </div>
    </form>
  )
}

export function ServicesPage() {
  const list = useAsync(fetchAllServices, [])
  const [editing, setEditing] = useState<Service | 'new' | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [toggleError, setToggleError] = useState<string | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)
  const inFlight = useRef(false)

  async function toggle(s: Service) {
    if (inFlight.current) return
    inFlight.current = true
    setToggling(s.id); setToggleError(null); setNotice(null)
    try {
      const saved = await updateService(s.id, { is_active: !s.is_active })
      setNotice(`“${saved.name}” ${saved.is_active ? 'etkinleştirildi' : 'pasifleştirildi'}.`)
      list.reload()
    } catch (e) {
      setToggleError(toAppError(e).message)
    } finally {
      inFlight.current = false
      setToggling(null)
    }
  }

  return (
    <div>
      <PageHeader
        title="Hizmetler"
        description="Burada yaptığınız değişiklikler müşteri sitesine ve yeni randevulara hemen yansır. Mevcut randevular değişmez."
        actions={<Button onClick={() => { setNotice(null); setEditing('new') }} icon={<Plus className="h-4 w-4" aria-hidden />}>Hizmet ekle</Button>}
      />

      <div aria-live="polite" className="mb-4 space-y-3 empty:hidden">
        {notice && <SuccessNote>{notice}</SuccessNote>}
        {toggleError && <ErrorPanel message={toggleError} />}
      </div>

      {list.loading && <Spinner label="Hizmetler yükleniyor…" />}
      {list.error && <ErrorPanel message={list.error.message} onRetry={list.reload} />}
      {list.data && list.data.length === 0 && <EmptyState>Henüz hizmet yok. “Hizmet ekle” ile başlayın.</EmptyState>}

      {list.data && list.data.length > 0 && (
        <ul className="space-y-2">
          {list.data.map((s) => {
            const price = formatPrice(s.price_minor)
            return (
              <li key={s.id} className={`card flex flex-col gap-3 p-4 sm:flex-row sm:items-center ${s.is_active ? '' : 'opacity-70'}`}>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium text-fg">
                    {s.name}
                    <span className={`rounded-md border px-1.5 py-0.5 text-[0.7rem] font-medium ${s.is_active ? 'border-success/40 text-success' : 'border-line text-subtle'}`}>
                      {s.is_active ? 'Aktif' : 'Pasif'}
                    </span>
                  </p>
                  {s.description && <p className="mt-0.5 truncate text-sm text-muted">{s.description}</p>}
                  <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                    <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" aria-hidden />{formatDuration(s.duration_minutes)}</span>
                    <span>{price ?? 'Fiyat belirtilmemiş'}</span>
                    <span>Sıra: {s.sort_order}</span>
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" loading={toggling === s.id} disabled={toggling !== null} onClick={() => toggle(s)}>
                    {s.is_active ? 'Pasifleştir' : 'Etkinleştir'}
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => { setNotice(null); setEditing(s) }} icon={<Pencil className="h-4 w-4" aria-hidden />}>
                    Düzenle
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Yeni hizmet' : 'Hizmeti düzenle'}>
        {editing !== null && (
          <ServiceForm
            key={editing === 'new' ? 'new' : editing.id}
            initial={editing === 'new' ? null : editing}
            onCancel={() => setEditing(null)}
            onSaved={(s) => { setEditing(null); setNotice(`“${s.name}” kaydedildi.`); list.reload() }}
          />
        )}
      </Dialog>
    </div>
  )
}
