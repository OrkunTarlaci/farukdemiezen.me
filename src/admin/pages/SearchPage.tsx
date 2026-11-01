import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { EmptyState, ErrorPanel, Spinner } from '../../components/ui/feedback'
import { inputClass, selectClass } from '../../components/ui/Field'
import { fetchAllServices, fetchAppointmentsInRange, MAX_ADMIN_RANGE_DAYS } from '../../lib/api'
import { matchesQuery } from '../../lib/search'
import { addDays, dateOfInstant, formatDateShort, isValidDateString, timeOfInstant, todayIstanbul } from '../../lib/time'
import type { AppointmentStatus } from '../../lib/types'
import { useAsync } from '../../lib/useAsync'
import { AppointmentDialog } from '../AppointmentDialog'
import { PageHeader } from '../AdminLayout'
import { STATUS_LABELS, StatusBadge, TestBadge } from '../StatusBadge'

const PRESETS: { label: string; range: (today: string) => [string, string] }[] = [
  { label: 'Bugün', range: (t) => [t, t] },
  { label: 'Yaklaşan (30 gün)', range: (t) => [t, addDays(t, 30)] },
  { label: 'Yarın', range: (t) => [addDays(t, 1), addDays(t, 1)] },
  { label: 'Önümüzdeki 7 gün', range: (t) => [t, addDays(t, 7)] },
]

export function SearchPage() {
  const today = todayIstanbul()
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(addDays(today, 30))
  const [status, setStatus] = useState<'' | AppointmentStatus>('')
  const [serviceId, setServiceId] = useState('')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const rangeError =
    !isValidDateString(from) || !isValidDateString(to) ? 'Geçerli tarihler seçin.'
      : to < from ? 'Bitiş tarihi başlangıçtan önce olamaz.'
        : addDays(from, MAX_ADMIN_RANGE_DAYS) < to ? `Tek seferde en fazla ${MAX_ADMIN_RANGE_DAYS} günlük aralık aranabilir.`
          : null

  const services = useAsync(fetchAllServices, [])
  const list = useAsync(
    () => fetchAppointmentsInRange(from, to, { status: status || undefined, serviceId: serviceId || undefined }),
    [from, to, status, serviceId],
    rangeError === null,
  )
  const results = useMemo(() => (list.data ?? []).filter((a) => matchesQuery(a, query)), [list.data, query])
  const selected = list.data?.find((a) => a.id === selectedId) ?? null

  return (
    <div>
      <PageHeader title="Ara ve Filtrele" description="Bugünkü ve yaklaşan randevuları tarih, durum ve hizmete göre bulun. Önceki günlerin randevuları her gece 00:00'da silindiği için geçmiş kayıt bulunmaz." />

      <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Hazır aralıklar">
        {PRESETS.map((p) => {
          const [f, t] = p.range(today)
          const active = from === f && to === t
          return (
            <button
              key={p.label}
              type="button"
              aria-pressed={active}
              onClick={() => { setFrom(f); setTo(t) }}
              className={`min-h-[2.25rem] rounded-lg border px-3 text-sm ${active ? 'border-accent bg-accent/10 text-fg' : 'border-line text-muted hover:bg-raised hover:text-fg'}`}
            >
              {p.label}
            </button>
          )
        })}
      </div>

      <form role="search" onSubmit={(e) => e.preventDefault()} className="card mb-5 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1fr]">
        <label className="block text-sm sm:col-span-2 lg:col-span-1">
          <span className="mb-1.5 block font-medium">Ara</span>
          <span className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ad, telefon veya referans"
              className={`${inputClass} pl-9`}
            />
          </span>
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium">Başlangıç</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium">Bitiş</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium">Durum</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as '' | AppointmentStatus)} className={selectClass}>
            <option value="">Tümü</option>
            {(Object.keys(STATUS_LABELS) as AppointmentStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium">Hizmet</span>
          <select value={serviceId} onChange={(e) => setServiceId(e.target.value)} className={selectClass}>
            <option value="">Tümü</option>
            {services.data?.map((s) => <option key={s.id} value={s.id}>{s.name}{s.is_active ? '' : ' (pasif)'}</option>)}
          </select>
        </label>
      </form>

      {rangeError && <ErrorPanel message={rangeError} />}
      {!rangeError && list.error && <ErrorPanel message={list.error.message} onRetry={list.reload} />}
      {!rangeError && list.loading && <Spinner label="Randevular aranıyor…" />}

      {!rangeError && !list.loading && list.data && (
        <>
          <p className="mb-3 text-sm text-muted" role="status">
            {results.length} randevu bulundu{list.data.length >= 1000 ? ' (ilk 1000 kayıt yüklendi; aralığı daraltın)' : ''}.
          </p>
          {results.length === 0 ? (
            <EmptyState>Bu ölçütlere uyan randevu yok.</EmptyState>
          ) : (
            <ul className="overflow-hidden rounded-xl border border-line">
              {results.map((a) => (
                <li key={a.id} className="border-b border-line last:border-b-0">
                  <button
                    type="button"
                    onClick={() => setSelectedId(a.id)}
                    className="grid w-full grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 bg-surface px-4 py-3 text-left text-sm transition-colors hover:bg-raised sm:grid-cols-[9rem_1fr_1fr_auto]"
                  >
                    <span className="tabular-nums text-muted">
                      <span className="text-fg">{formatDateShort(dateOfInstant(a.starts_at)).split(' ').slice(0, 2).join(' ')}</span> · {timeOfInstant(a.starts_at)}
                    </span>
                    <span className="row-start-2 flex items-center gap-2 font-medium text-fg sm:row-start-auto"><span className="truncate">{a.customer_first_name} {a.customer_last_name}</span>{a.is_test && <TestBadge />}</span>
                    <span className="hidden truncate text-muted sm:block">{a.service_name ?? a.services?.name ?? '—'} · <span className="font-mono">{a.reference_code}</span></span>
                    <span className="row-span-2 sm:row-span-1"><StatusBadge status={a.status} /></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <AppointmentDialog appointment={selected} onClose={() => setSelectedId(null)} onChanged={list.reload} />
    </div>
  )
}
