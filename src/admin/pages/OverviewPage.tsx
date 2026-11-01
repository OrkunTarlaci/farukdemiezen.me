import { AlertTriangle, ArrowRight, Clock, RotateCw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { EmptyState, ErrorPanel, Spinner } from '../../components/ui/feedback'
import { fetchAppointmentsInRange } from '../../lib/api'
import { appointmentIssues } from '../../lib/schedule'
import { summarizeAppointments } from '../../lib/stats'
import { addDays, dateOfInstant, formatDateLong, formatDateShort, formatPrice, timeOfInstant } from '../../lib/time'
import { useIstanbulToday } from '../../lib/useToday'
import type { AppointmentRow } from '../../lib/types'
import { useAsync } from '../../lib/useAsync'
import { useLiveAppointments } from '../../lib/useLiveAppointments'
import { AppointmentDialog } from '../AppointmentDialog'
import { PageHeader, StatCard } from '../AdminLayout'
import { StatusBadge, TestBadge } from '../StatusBadge'

const UPCOMING_DAYS = 30

function Row({ a, onOpen, showDate }: { a: AppointmentRow; onOpen: () => void; showDate?: boolean }) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors hover:bg-raised"
      >
        <span className="w-24 shrink-0 tabular-nums text-muted">
          {showDate && <span className="block text-xs text-subtle">{formatDateShort(dateOfInstant(a.starts_at)).split(' ').slice(0, 2).join(' ')}</span>}
          <span className="font-mono text-fg">{timeOfInstant(a.starts_at)}</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 font-medium text-fg">
            <span className="truncate">{a.customer_first_name} {a.customer_last_name}</span>{a.is_test && <TestBadge />}
          </span>
          <span className="block truncate text-xs text-muted">{a.service_name ?? a.services?.name ?? 'Hizmet'}</span>
        </span>
        <StatusBadge status={a.status} />
      </button>
    </li>
  )
}

/** Bugünün özeti, sıradaki randevu, onay bekleyen talepler ve sonucu işaretlenmemiş randevular. */
export function OverviewPage() {
  const today = useIstanbulToday()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // Önceki günler her gece silindiği için bugünden başlanır.
  const data = useAsync(() => fetchAppointmentsInRange(today, addDays(today, UPCOMING_DAYS)), [today])
  useLiveAppointments(data.reload) // başka cihazdaki değişiklikler (ör. telefondan iptal)

  const view = useMemo(() => {
    const list = data.data ?? []
    const now = Date.now()
    const todays = list.filter((a) => dateOfInstant(a.starts_at) === today)
    const future = list.filter((a) => new Date(a.starts_at).getTime() > now && (a.status === 'pending' || a.status === 'confirmed'))
    return {
      todays,
      summary: summarizeAppointments(todays),
      next: future[0] ?? null,
      pending: future.filter((a) => a.status === 'pending'),
      upcomingCount: future.length,
      // Bugün: saati geçmiş ama sonucu işaretlenmemiş / hâlâ onay bekleyen (gece yarısı silinmeden önce)
      unresolved: list.filter((a) => appointmentIssues(a, undefined, []).some((i) => i === 'pending_past' || i === 'unresolved_past')),
    }
  }, [data.data, today])

  const selected = data.data?.find((a) => a.id === selectedId) ?? null

  return (
    <div>
      <PageHeader
        title="Genel Bakış"
        description={formatDateLong(today)}
        actions={<Button variant="secondary" size="sm" onClick={data.reload} aria-label="Yenile" icon={<RotateCw className={`h-4 w-4 ${data.loading ? 'animate-spin' : ''}`} aria-hidden />} />}
      />

      {data.error && <div className="mb-4"><ErrorPanel message={data.error.message} onRetry={data.reload} /></div>}
      {!data.data && data.loading && <Spinner label="Özet yükleniyor…" />}

      {data.data && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard label="Bugünkü randevu" value={view.summary.active} />
            <StatCard label="Onay bekleyen talep" value={view.pending.length} tone="warning" />
            <StatCard label="Bugün onaylı" value={view.summary.confirmed} tone="success" />
            <StatCard label="Bugün tamamlanan" value={view.summary.completed} tone="accent" />
            <StatCard label="Bugün iptal" value={view.summary.cancelled} tone="danger" />
            <StatCard
              label="Bugün beklenen ciro"
              value={formatPrice(view.summary.expectedMinor) ?? '—'}
              hint={view.summary.unknownPrice ? `${view.summary.unknownPrice} randevunun fiyatı kayıtlı değil` : `Gerçekleşen: ${formatPrice(view.summary.realizedMinor)}`}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
            <section className="card p-5" aria-labelledby="siradaki">
              <h2 id="siradaki" className="flex items-center gap-2 text-sm text-muted"><Clock className="h-4 w-4 text-accent" aria-hidden /> Sıradaki randevu</h2>
              {view.next ? (
                <button type="button" onClick={() => setSelectedId(view.next!.id)} className="mt-3 block w-full rounded-lg text-left hover:bg-raised/50">
                  <p className="font-mono text-3xl font-semibold tabular-nums text-fg">{timeOfInstant(view.next.starts_at)}</p>
                  <p className="text-sm text-muted">{formatDateLong(dateOfInstant(view.next.starts_at))}</p>
                  <p className="mt-3 text-lg font-medium text-fg">{view.next.customer_first_name} {view.next.customer_last_name}</p>
                  <p className="text-sm text-muted">{view.next.service_name ?? view.next.services?.name}</p>
                  <div className="mt-3"><StatusBadge status={view.next.status} /></div>
                </button>
              ) : (
                <p className="mt-3 text-sm text-muted">Önümüzdeki {UPCOMING_DAYS} gün için randevu yok.</p>
              )}
              <p className="mt-4 border-t border-line pt-3 text-xs text-subtle">Önümüzdeki {UPCOMING_DAYS} günde {view.upcomingCount} aktif randevu.</p>
            </section>

            <section className="card p-5" aria-labelledby="bekleyen">
              <div className="flex items-center justify-between gap-3">
                <h2 id="bekleyen" className="text-sm text-muted">Onay bekleyen talepler</h2>
                <Link to="/admin/ara" className="inline-flex min-h-[2.5rem] items-center gap-1 text-xs text-accent hover:underline">
                  Tüm randevular <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </div>
              {view.pending.length === 0 ? (
                <p className="mt-3 text-sm text-muted">Bekleyen talep yok.</p>
              ) : (
                <ul className="-mx-3 mt-2">{view.pending.slice(0, 8).map((a) => <Row key={a.id} a={a} showDate onOpen={() => setSelectedId(a.id)} />)}</ul>
              )}
              {view.pending.length > 8 && <p className="mt-2 text-xs text-subtle">+{view.pending.length - 8} talep daha (Ara ve Filtrele sayfasında).</p>}
            </section>
          </div>

          {view.unresolved.length > 0 && (
            <section className="card mt-4 border-warning/40 p-5" aria-labelledby="sonuc">
              <h2 id="sonuc" className="flex items-center gap-2 text-sm text-warning">
                <AlertTriangle className="h-4 w-4" aria-hidden /> Sonucu işaretlenmemiş randevular (bugün)
              </h2>
              <p className="mt-1 text-xs text-muted">Saati geçmiş ama hâlâ “onay bekliyor” veya “onaylandı” durumundakiler. Açıp “Tamamlandı” ya da “Gelmedi” olarak işaretleyin.</p>
              <ul className="-mx-3 mt-2">{view.unresolved.map((a) => <Row key={a.id} a={a} showDate onOpen={() => setSelectedId(a.id)} />)}</ul>
            </section>
          )}

          <section className="mt-4" aria-labelledby="bugun">
            <div className="mb-2 flex items-center justify-between">
              <h2 id="bugun" className="text-base">Bugünün randevuları</h2>
              <Link to="/admin/gun" className="inline-flex min-h-[2.5rem] items-center gap-1 text-xs text-accent hover:underline">
                Günlük çizelge <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </div>
            {view.todays.length === 0 ? (
              <EmptyState>Bugün için randevu yok.</EmptyState>
            ) : (
              <ul className="card p-2">{view.todays.map((a) => <Row key={a.id} a={a} onOpen={() => setSelectedId(a.id)} />)}</ul>
            )}
          </section>
        </>
      )}

      <AppointmentDialog appointment={selected} onClose={() => setSelectedId(null)} onChanged={data.reload} />
    </div>
  )
}
